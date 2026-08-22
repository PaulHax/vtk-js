import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { walk, modulePair, stable } from './module-pairs.mjs';

const root = process.cwd();
const sourcesDir = path.join(root, 'Sources');
const distDir = path.join(root, 'dist', 'esm');
const baselinePath = path.join(
  root,
  'Utilities',
  'TypeTesting',
  'surface-baseline.json'
);

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

function propertyName(property) {
  return property.getName();
}

function splitByOptionality(type) {
  const required = new Set();
  const all = new Set();
  for (const property of checker.getPropertiesOfType(type)) {
    const name = propertyName(property);
    if (name.startsWith('__')) continue;
    all.add(name);
    if (!(property.flags & ts.SymbolFlags.Optional)) required.add(name);
  }
  return { required, all };
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
  const surface = { hasDefault: false, statics: null, named: {} };
  let defaultType = null;

  for (const symbol of exportSymbols) {
    const target = resolved(symbol);
    if (!(target.flags & ts.SymbolFlags.Value)) continue;
    const type = checker.getTypeOfSymbol(target);
    if (symbol.getName() === 'default') {
      surface.hasDefault = true;
      defaultType = type;
      surface.statics = splitByOptionality(type);
    } else {
      surface.named[symbol.getName()] = splitByOptionality(type);
    }
  }

  const declaredInstance = instanceType(defaultType, exportSymbols);
  surface.instance = declaredInstance && splitByOptionality(declaredInstance);
  return surface;
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

// Class-based helpers (vtkBoundingBox, vtkEdgeLocator) keep their methods on
// the prototype, where Object.keys cannot see them.
function instanceKeys(instance) {
  const names = new Set(Object.keys(instance));
  for (
    let prototype = Object.getPrototypeOf(instance);
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name !== 'constructor') names.add(name);
    }
  }
  return names;
}

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
    surface.statics = new Set(Object.keys(factory));
  }
  for (const [name, value] of Object.entries(module)) {
    if (name !== 'default' && isPlainObject(value)) {
      surface.named[name] = new Set(Object.keys(value));
    }
  }

  if (wantsInstance && typeof factory?.newInstance === 'function') {
    try {
      const instance = silenced(() => factory.newInstance(initialValues));
      if (instance && typeof instance === 'object') {
        surface.instance = instanceKeys(instance);
        silenced(() => instance.delete?.());
      }
    } catch {
      surface.instantiationFailed = true;
    }
  }
  return surface;
}

function difference(left, right) {
  return new Set([...left].filter((name) => !right.has(name)));
}

function addMismatch(collection, key, names) {
  if (names.size) collection[key] = [...names].sort();
}

function compareMembers(census, key, declared, runtime) {
  addMismatch(
    census.ghostMembers,
    key,
    difference(declared.required, runtime)
  );
  addMismatch(
    census.undeclaredMembers,
    key,
    difference(
      new Set([...runtime].filter((name) => !internal(name))),
      declared.all
    )
  );
}

const census = {
  defaultMismatches: {},
  ghostMembers: {},
  undeclaredMembers: {},
  importFailures: [],
  uninstantiable: [],
};
const counters = { statics: 0, instances: 0, constants: 0 };

for (const pair of pairs) {
  const sourceFile = program.getSourceFile(pair.declarationPath);
  const declared = sourceFile && declaredSurface(sourceFile);
  if (!declared) continue;

  let runtime;
  try {
    runtime = await runtimeSurface(
      pair.runtimePath,
      (declared.instance?.all.size ?? 0) > 0,
      instantiationHints[pair.moduleName]
    );
  } catch {
    census.importFailures.push(pair.moduleName);
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
      census,
      `${pair.moduleName}#default`,
      declared.statics,
      runtime.statics
    );
  }

  for (const [name, members] of Object.entries(runtime.named)) {
    const declaredMembers = declared.named[name];
    if (!declaredMembers || !declaredMembers.all.size) continue;
    counters.constants += 1;
    compareMembers(
      census,
      `${pair.moduleName}#${name}`,
      declaredMembers,
      members
    );
  }

  if (runtime.instantiationFailed) {
    census.uninstantiable.push(pair.moduleName);
  } else if (declared.instance && runtime.instance) {
    counters.instances += 1;
    compareMembers(
      census,
      `${pair.moduleName}#instance`,
      declared.instance,
      runtime.instance
    );
  }
}

census.importFailures.sort();
census.uninstantiable.sort();

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

if (JSON.stringify(stable(census)) !== JSON.stringify(stable(baseline))) {
  console.error('The declared API surface diverged from the built runtime.');
  console.error('Expected baseline:');
  console.error(JSON.stringify(stable(baseline), null, 2));
  console.error('Actual census:');
  console.error(JSON.stringify(stable(census), null, 2));
  process.exitCode = 1;
} else {
  const debt = Object.values(census.undeclaredMembers).reduce(
    (count, names) => count + names.length,
    0
  );
  const ghosts = Object.values(census.ghostMembers).reduce(
    (count, names) => count + names.length,
    0
  );
  console.log(
    `API surface census passed over ${pairs.length} typed modules ` +
      `(${counters.statics} static, ${counters.instances} instance, ` +
      `${counters.constants} constant surfaces; ${ghosts} baselined ghosts, ` +
      `${debt} baselined undeclared members, ` +
      `${census.uninstantiable.length} uninstantiable headless).`
  );
}

process.exit(process.exitCode ?? 0);
