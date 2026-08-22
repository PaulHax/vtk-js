// Census of the options each factory accepts.
//
// `vtkX.newInstance(initialValues)` copies its argument straight onto the model,
// so every DEFAULT_VALUES key that also has a public setter is a legitimate
// option. This walks the JS for those keys, resolves the type `newInstance`
// actually declares for `initialValues`, and reports the keys that type omits.
//
// Keys whose only accessor is a read-only `macro.get` are reported separately:
// they are assignable at construction but are internal state (cached tables,
// timestamps, values derived from the input), so they are baselined rather than
// declared.

import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = process.cwd();
const SOURCES = path.join(ROOT, 'Sources');
const baselinePath = path.join(
  ROOT,
  'Utilities/TypeTesting/initial-values-baseline.json'
);

const SKIP_DIR = /^(example|examples|test)$/i;

const moduleFiles = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.test(entry.name)) moduleFiles(full, out);
    } else if (entry.name === 'index.js') {
      out.push(full);
    }
  }
  return out;
};

const parseJs = (file) =>
  ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );

const objectKeys = (literal, into) => {
  for (const prop of literal.properties) {
    const name = prop.name;
    if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) {
      into.add(name.text);
    }
  }
};

// DEFAULT_VALUES is either an object literal or a factory returning one.
const defaultValueKeys = (source) => {
  const keys = new Set();
  let found = false;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'DEFAULT_VALUES'
    ) {
      found = true;
      const init = node.initializer;
      if (init && ts.isObjectLiteralExpression(init)) objectKeys(init, keys);
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        const body = init.body;
        if (body && ts.isObjectLiteralExpression(body)) objectKeys(body, keys);
        else if (body && ts.isBlock(body)) {
          for (const statement of body.statements) {
            if (
              ts.isReturnStatement(statement) &&
              statement.expression &&
              ts.isObjectLiteralExpression(statement.expression)
            ) {
              objectKeys(statement.expression, keys);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found ? keys : null;
};

const ACCESSOR = /^(get|set|setGet|getArray|setArray|setGetArray)$/;
const WRITER = /^(set|setGet|setArray|setGetArray)$/;

// A key is configurable if macro generated a setter for it, or index.js
// assigned one by hand. `_capitalize` drops a leading underscore, so the
// protected form of a name shares the public accessor.
const accessors = (source) => {
  const all = new Set();
  const writable = new Set();

  const record = (list, isWritable) => {
    if (!list || !ts.isArrayLiteralExpression(list)) return;
    const add = (raw) => {
      const name = raw.replace(/^_/, '');
      all.add(name);
      if (isWritable) writable.add(name);
    };
    for (const element of list.elements) {
      if (ts.isStringLiteral(element)) add(element.text);
      else if (ts.isObjectLiteralExpression(element)) {
        for (const prop of element.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === 'name' &&
            ts.isStringLiteral(prop.initializer)
          ) {
            add(prop.initializer.text);
          }
        }
      }
    }
  };

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isIdentifier(callee)
          ? callee.text
          : null;
      if (name && ACCESSOR.test(name)) {
        record(node.arguments[2], WRITER.test(name));
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      ts.isIdentifier(node.left.expression) &&
      node.left.expression.text === 'publicAPI' &&
      /^set[A-Z]/.test(node.left.name.text)
    ) {
      const name = node.left.name.text.slice(3);
      writable.add(name[0].toLowerCase() + name.slice(1));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { all, writable };
};

// The options type is whatever newInstance/extend declares, not whatever is
// named I*InitialValues: several modules name it differently.
const optionsType = (declaration) => {
  let found = null;
  ts.forEachChild(declaration, (node) => {
    if (found) return;
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      /^(newInstance|extend)$/.test(node.name.text)
    ) {
      const last = node.parameters[node.parameters.length - 1];
      if (last?.type && last.name.getText() === 'initialValues')
        found = last.type;
    }
  });
  if (found) return found;
  ts.forEachChild(declaration, (node) => {
    if (found) return;
    if (
      ts.isInterfaceDeclaration(node) &&
      /InitialValues$/.test(node.name.text)
    ) {
      found = node.name;
    }
  });
  return found;
};

const jsFiles = moduleFiles(SOURCES);
const declarationFiles = jsFiles
  .map((file) => file.replace(/index\.js$/, 'index.d.ts'))
  .filter((file) => fs.existsSync(file));

const program = ts.createProgram(declarationFiles, {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: false,
  skipLibCheck: true,
  noEmit: true,
});
const checker = program.getTypeChecker();

const census = { missingOptions: {}, readOnlyOptions: {}, untypedOptions: [] };
let audited = 0;

for (const js of jsFiles) {
  const declarationPath = js.replace(/index\.js$/, 'index.d.ts');
  if (!fs.existsSync(declarationPath)) continue;

  const keys = defaultValueKeys(parseJs(js));
  if (!keys?.size) continue;

  const declaration = program.getSourceFile(declarationPath);
  if (!declaration) continue;

  const moduleName = path
    .relative(SOURCES, path.dirname(js))
    .split(path.sep)
    .join('/');
  const { all, writable } = accessors(parseJs(js));
  const configurable = [...keys].filter((key) => all.has(key));
  if (!configurable.length) continue;
  audited += 1;

  const options = optionsType(declaration);
  const optionsName = options?.getText();
  if (!options || /^(object|any)$/.test(optionsName)) {
    census.untypedOptions.push(moduleName);
    census.missingOptions[moduleName] = configurable
      .filter((key) => writable.has(key))
      .sort();
    census.readOnlyOptions[moduleName] = configurable
      .filter((key) => !writable.has(key))
      .sort();
    continue;
  }

  const declared = new Set(
    checker
      .getPropertiesOfType(checker.getTypeAtLocation(options))
      .map((symbol) => symbol.name)
  );
  const gap = configurable.filter((key) => !declared.has(key));
  const missing = gap.filter((key) => writable.has(key)).sort();
  const readOnly = gap.filter((key) => !writable.has(key)).sort();
  if (missing.length) census.missingOptions[moduleName] = missing;
  if (readOnly.length) census.readOnlyOptions[moduleName] = readOnly;
}

const stable = (value) => {
  if (Array.isArray(value)) return [...value].sort();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])])
    );
  }
  return value;
};

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify(stable(census), null, 2)}\n`
  );
  console.log(`Wrote ${path.relative(ROOT, baselinePath)}.`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

if (JSON.stringify(stable(census)) !== JSON.stringify(stable(baseline))) {
  console.error('The declared newInstance options diverged from the runtime.');
  console.error('Expected baseline:');
  console.error(JSON.stringify(stable(baseline), null, 2));
  console.error('Actual census:');
  console.error(JSON.stringify(stable(census), null, 2));
  process.exit(1);
}

const total = (collection) =>
  Object.values(collection).reduce((count, keys) => count + keys.length, 0);
console.log(
  `Initial-values census passed over ${audited} configurable modules ` +
    `(${total(census.missingOptions)} baselined undeclared options, ` +
    `${total(census.readOnlyOptions)} baselined read-only options, ` +
    `${census.untypedOptions.length} factories still typed as object).`
);
