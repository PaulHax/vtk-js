import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import {
  walk,
  modulePair,
  stable,
  compareToBaseline,
  total,
} from './module-pairs.mjs';
import { instanceKeys } from './instance-keys.mjs';

const root = process.cwd();
const sourcesDir = path.join(root, 'Sources');
const distDir = path.join(root, 'dist', 'esm');
const baselinePath = path.join(
  root,
  'Utilities',
  'TypeTesting',
  'declaration-baseline.json'
);

// The modules Node cannot construct are handed to the browser census, which
// enumerates them against a real WebGL or WebGPU context.
// Ghost detection ignores optional members, so the browser census needs the
// required set and the full set kept apart.
const unverifiedEntry = (instance) => ({
  required: [...instance.required].sort(),
  all: [...instance.all].sort(),
});

const emitIndex = process.argv.indexOf('--emit-unverified');
const emitPath = emitIndex === -1 ? null : process.argv[emitIndex + 1];
const unverified = {};

if (!fs.existsSync(distDir)) {
  throw new Error('dist/esm is missing; run npm run build:esm first');
}

const pairs = walk(sourcesDir, '.d.ts')
  .map((declarationPath) => ({
    declarationPath,
    ...modulePair(declarationPath, sourcesDir, distDir),
  }))
  .filter((pair) => pair.moduleName);

const program = ts.createProgram(
  pairs.map((pair) => pair.declarationPath),
  {
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  }
);
const checker = program.getTypeChecker();

const internal = (name) => name.startsWith('_');

function resolved(symbol) {
  return symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

// `export type { X }` re-exports a value declaration in type position only, so
// the built module is not expected to export it.
function typeOnlyExport(symbol) {
  return (symbol.declarations ?? []).some(
    (declaration) =>
      ts.isExportSpecifier(declaration) &&
      (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly)
  );
}

// ----------------------------------------------------------------------------
// Declared surface
// ----------------------------------------------------------------------------

/**
 * The parameter bounds of a callable member, or null when it is not callable.
 *
 * `required` is the fewest parameters any overload demands; optional, rest and
 * defaulted parameters do not count. `accepted` is the most any overload can
 * take, or null when a rest parameter makes that unbounded. Both come from one
 * walk of the signatures — this runs over ~43k properties.
 */
function parameterBounds(symbol) {
  const signatures = checker.getTypeOfSymbol(symbol).getCallSignatures();
  if (!signatures.length) return null;

  let required = Infinity;
  let accepted = 0;
  let unbounded = false;

  for (const signature of signatures) {
    const parameters = signature.getParameters();
    let demanded = 0;
    for (const parameter of parameters) {
      const declaration = parameter.valueDeclaration;
      if (declaration?.dotDotDotToken) unbounded = true;
      else if (!(declaration?.questionToken || declaration?.initializer)) {
        demanded += 1;
      }
    }
    required = Math.min(required, demanded);
    accepted = Math.max(accepted, parameters.length);
  }

  return { required, accepted: unbounded ? null : accepted };
}

function members(type) {
  const required = new Set();
  const all = new Set();
  const arity = new Map();
  const accepted = new Map();
  for (const property of checker.getPropertiesOfType(type)) {
    const name = property.getName();
    if (name.startsWith('__')) continue;
    all.add(name);
    if (!(property.flags & ts.SymbolFlags.Optional)) required.add(name);
    const bounds = parameterBounds(property);
    if (bounds === null) continue;
    arity.set(name, bounds.required);
    if (bounds.accepted !== null) accepted.set(name, bounds.accepted);
  }
  return { required, all, arity, accepted };
}

function instanceType(defaultType, exportSymbols) {
  const fromDefault = defaultType?.getProperty('newInstance');
  const namedExport = exportSymbols.find(
    (symbol) => symbol.getName() === 'newInstance'
  );
  const factory = fromDefault ?? (namedExport && resolved(namedExport));
  if (!factory || !(factory.flags & ts.SymbolFlags.Value)) return null;
  const signature = checker.getTypeOfSymbol(factory).getCallSignatures()[0];
  return signature ? signature.getReturnType() : null;
}

function declaredSurface(sourceFile) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return null;
  const exportSymbols = checker.getExportsOfModule(moduleSymbol);
  const surface = {
    hasDefault: false,
    exportedValues: new Set(),
    exportedNames: new Set(),
    statics: null,
    named: {},
  };
  let defaultType = null;
  let defaultTarget = null;

  for (const symbol of exportSymbols) {
    const name = symbol.getName();
    surface.exportedNames.add(name);
    const target = resolved(symbol);
    if (name === 'default') {
      surface.hasDefault = true;
      if (symbol.flags & ts.SymbolFlags.Alias) defaultTarget = target.getName();
    }
    if (!(target.flags & ts.SymbolFlags.Value) || typeOnlyExport(symbol)) {
      continue;
    }
    const type = checker.getTypeOfSymbol(target);
    if (name === 'default') {
      defaultType = type;
      surface.statics = members(type);
    } else {
      surface.exportedValues.add(name);
      surface.named[name] = members(type);
    }
  }

  // vtk.js declarations intentionally merge an exported instance interface with
  // the default factory object. Keeping the value declaration exported
  // preserves default imports in type position even though the built value is
  // available only as the default export.
  if (defaultTarget) surface.exportedValues.delete(defaultTarget);

  const declaredInstance = instanceType(defaultType, exportSymbols);
  surface.instance = declaredInstance && members(declaredInstance);
  return surface;
}

// ----------------------------------------------------------------------------
// Runtime surface
// ----------------------------------------------------------------------------

const localExportBlock = /^export\s*\{([^}]*)\}\s*;?\s*$/gm;

/**
 * Named exports of a built module, read from its text so that modules the Node
 * loader cannot execute are still covered.
 */
function runtimeExports(content) {
  const blocks = Array.from(content.matchAll(localExportBlock));
  if (!blocks.length) return new Set();
  return new Set(
    blocks
      .at(-1)[1]
      .split(',')
      .map((part) =>
        part
          .trim()
          .split(/\s+as\s+/)
          .at(-1)
          ?.trim()
      )
      .filter(
        (name) => name && name !== 'default' && !name.endsWith('_exports')
      )
  );
}

// Minimal constructor arguments for factories whose extend() rejects an
// empty model. Keep entries constructible without DOM or WebGL globals.
const instantiationHints = {
  'Common/Core/DataArray': { values: Float32Array.from([0]) },
  'Common/Core/StringArray': { values: ['a'] },
  'Common/Core/VariantArray': { values: [0] },
};

const consoleMethods = ['error', 'warn', 'log', 'info', 'debug'];
function silenced(action) {
  const saved = consoleMethods.map((name) => [name, console[name]]);
  consoleMethods.forEach((name) => {
    console[name] = () => {};
  });
  try {
    return action();
  } finally {
    saved.forEach(([name, method]) => {
      console[name] = method;
    });
  }
}

function isPlainObject(value) {
  return !!value && Object.getPrototypeOf(value) === Object.prototype;
}

// A runtime surface is the object that carries the members plus their names,
// which for the factory instances are not simply its own keys.
const carrier = (holder, names = new Set(Object.keys(holder))) => ({
  holder,
  names,
});

async function runtimeSurface(runtimePath, wantsInstance, initialValues) {
  const module = await import(pathToFileURL(runtimePath).href);
  const surface = {
    hasDefault: 'default' in module,
    statics: null,
    instance: null,
    instantiationFailed: false,
    named: {},
  };

  const factory = module.default;
  if (factory && ['object', 'function'].includes(typeof factory)) {
    surface.statics = carrier(factory);
  }
  for (const [name, value] of Object.entries(module)) {
    if (name !== 'default' && isPlainObject(value)) {
      surface.named[name] = carrier(value);
    }
  }

  if (wantsInstance && typeof factory?.newInstance === 'function') {
    try {
      const instance = silenced(() => factory.newInstance(initialValues));
      if (instance && typeof instance === 'object') {
        surface.instance = carrier(instance, instanceKeys(instance));
      }
    } catch {
      surface.instantiationFailed = true;
    }
  }
  return surface;
}

// ----------------------------------------------------------------------------
// Runtime arity
// ----------------------------------------------------------------------------

/**
 * The parameter list of a function as written, or null when it cannot be read.
 */
function parameterText(source) {
  const shorthand = /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/.exec(source);
  if (shorthand) return shorthand[1];
  const open = source.indexOf('(');
  if (open < 0) return null;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if ('([{'.includes(source[index])) depth += 1;
    else if (')]}'.includes(source[index])) {
      depth -= 1;
      if (!depth) return source.slice(open + 1, index);
    }
  }
  return null;
}

/**
 * Whether `Function.length` understates what the implementation accepts. Rest
 * and defaulted parameters are not counted by the language, and a function
 * reading `arguments` declares no parameters at all.
 */
function acceptsMoreThanItDeclares(fn) {
  let source;
  try {
    source = Function.prototype.toString.call(fn);
  } catch {
    return true;
  }
  if (source.includes('[native code]') || /\barguments\b/.test(source)) {
    return true;
  }
  const parameters = parameterText(source);
  if (parameters === null) return true;
  return parameters.includes('...') || parameters.includes('=');
}

/**
 * Whether every parameter past `from` is only read behind a guard. Such a
 * parameter is optional in practice but is not defaulted, so `Function.length`
 * still counts it. `macro.obj`'s `modified(otherMTime)` is the archetype.
 */
function trailingParametersAreGuarded(fn, from) {
  let source;
  try {
    source = Function.prototype.toString.call(fn);
  } catch {
    return true;
  }
  const parameters = parameterText(source);
  if (parameters === null) return true;
  const names = parameters
    .split(',')
    .map((parameter) => parameter.trim())
    .filter(Boolean);
  const body = source.slice(source.indexOf(')', source.indexOf('(')) + 1);
  return names.slice(from).every((name) => {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) return true;
    const guard = new RegExp(
      `(if\\s*\\(\\s*!?${name}\\b|${name}\\s*(&&|\\?\\?|!==|===|!=|==)\\s*(undefined|null|\\w))`
    );
    return guard.test(body);
  });
}

/**
 * The reverse of an arity mismatch: the declaration cannot express a call the
 * implementation requires, so passing the argument it needs is a type error.
 * `Function.length` stops at the first defaulted or rest parameter, so it only
 * ever counts parameters the implementation genuinely takes.
 */
function underDeclaredArity(declared, holder) {
  const mismatches = [];
  for (const [name, accepted] of declared.accepted) {
    if (internal(name)) continue;
    const fn = holder[name];
    if (typeof fn !== 'function' || fn.length === 0) continue;
    if (accepted >= fn.length) continue;
    if (trailingParametersAreGuarded(fn, accepted)) continue;
    mismatches.push(`${name}(${accepted}<${fn.length})`);
  }
  return mismatches;
}

function arityMismatches(declared, holder) {
  const mismatches = [];
  for (const [name, required] of declared.arity) {
    if (internal(name) || required === 0) continue;
    const fn = holder[name];
    if (typeof fn !== 'function' || required <= fn.length) continue;
    if (acceptsMoreThanItDeclares(fn)) continue;
    mismatches.push(`${name}(${required}>${fn.length})`);
  }
  return mismatches;
}

// ----------------------------------------------------------------------------
// Census
// ----------------------------------------------------------------------------

function difference(left, right) {
  return new Set([...left].filter((name) => !right.has(name)));
}

function record(collection, key, names) {
  const list = [...names];
  if (list.length) collection[key] = list.sort();
}

const census = {
  ghostDeclarations: {},
  undeclaredRuntimeExports: {},
  defaultMismatches: {},
  ghostMembers: {},
  undeclaredMembers: {},
  arityMismatches: {},
  underDeclaredArity: {},
  importFailures: [],
  uninstantiable: [],
};
const counters = { statics: 0, instances: 0, constants: 0 };

function compareMembers(key, declared, runtime) {
  record(
    census.ghostMembers,
    key,
    difference(declared.required, runtime.names)
  );
  record(
    census.undeclaredMembers,
    key,
    difference(
      new Set([...runtime.names].filter((name) => !internal(name))),
      declared.all
    )
  );
  record(
    census.arityMismatches,
    key,
    arityMismatches(declared, runtime.holder)
  );
  record(
    census.underDeclaredArity,
    key,
    underDeclaredArity(declared, runtime.holder)
  );
}

for (const pair of pairs) {
  const sourceFile = program.getSourceFile(pair.declarationPath);
  const declared = sourceFile && declaredSurface(sourceFile);
  if (!declared) continue;

  // Export level: read the built module as text so that modules the Node
  // loader cannot execute are still compared.
  const exportedAtRuntime = runtimeExports(
    fs.readFileSync(pair.runtimePath, 'utf8')
  );
  record(
    census.ghostDeclarations,
    pair.moduleName,
    difference(declared.exportedValues, exportedAtRuntime)
  );
  record(
    census.undeclaredRuntimeExports,
    pair.moduleName,
    difference(exportedAtRuntime, declared.exportedNames)
  );

  // Member level: needs the real module.
  let runtime;
  try {
    runtime = await runtimeSurface(
      pair.runtimePath,
      (declared.instance?.all.size ?? 0) > 0,
      instantiationHints[pair.moduleName]
    );
  } catch {
    census.importFailures.push(pair.moduleName);
    if (declared.instance?.all.size) {
      unverified[pair.moduleName] = unverifiedEntry(declared.instance);
    }
    continue;
  }

  if (declared.hasDefault !== runtime.hasDefault) {
    census.defaultMismatches[pair.moduleName] = declared.hasDefault
      ? 'missing-runtime-default'
      : 'undeclared-runtime-default';
  }

  if (declared.statics && runtime.statics) {
    counters.statics += 1;
    compareMembers(
      `${pair.moduleName}#default`,
      declared.statics,
      runtime.statics
    );
  }

  for (const [name, constant] of Object.entries(runtime.named)) {
    const declaredMembers = declared.named[name];
    if (!declaredMembers || !declaredMembers.all.size) continue;
    counters.constants += 1;
    compareMembers(`${pair.moduleName}#${name}`, declaredMembers, constant);
  }

  if (runtime.instantiationFailed) {
    census.uninstantiable.push(pair.moduleName);
    if (declared.instance?.all.size) {
      unverified[pair.moduleName] = unverifiedEntry(declared.instance);
    }
  } else if (declared.instance && runtime.instance) {
    counters.instances += 1;
    compareMembers(
      `${pair.moduleName}#instance`,
      declared.instance,
      runtime.instance
    );
  }

  try {
    silenced(() => runtime.instance?.holder.delete?.());
  } catch {
    // Some factories throw while tearing down a headless instance.
  }
}

census.importFailures.sort();
census.uninstantiable.sort();

if (emitPath) {
  fs.writeFileSync(
    emitPath,
    `${JSON.stringify(stable(unverified), null, 2)}\n`
  );
}

const passed = compareToBaseline(census, baselinePath, {
  subject: 'The declared API surface diverged from the built runtime.',
  summary: () =>
    `Declaration census passed over ${pairs.length} typed modules ` +
    `(${counters.statics} static, ${counters.instances} instance, ` +
    `${counters.constants} constant surfaces; ` +
    `${total(census.ghostDeclarations)} baselined export ghosts, ` +
    `${total(census.undeclaredRuntimeExports)} baselined undeclared exports, ` +
    `${total(census.ghostMembers)} baselined member ghosts, ` +
    `${total(census.undeclaredMembers)} baselined undeclared members, ` +
    `${total(census.arityMismatches)} baselined arity mismatches, ` +
    `${total(census.underDeclaredArity)} baselined under-declared arities, ` +
    `${census.uninstantiable.length} uninstantiable headless).`,
});

process.exit(passed ? 0 : 1);
