import fs from 'node:fs';
import path from 'node:path';
import { walk, modulePair, stable } from './module-pairs.mjs';

const root = process.cwd();
const sourcesDir = path.join(root, 'Sources');
const distDir = path.join(root, 'dist', 'esm');
const baselinePath = path.join(
  root,
  'Utilities',
  'TypeTesting',
  'export-baseline.json'
);

const valueDeclaration =
  /^export\s+(?:declare\s+)?(?:const|let|var|function|enum|class)\s+([A-Za-z_$][\w$]*)/gm;
const anyDeclaration =
  /^export\s+(?:declare\s+)?(?:const|let|var|function|enum|class|type|interface)\s+([A-Za-z_$][\w$]*)/gm;
const localExportBlock = /^export\s*\{([^}]*)\}\s*;?\s*$/gm;
const defaultTarget = /^export\s+default\s+([A-Za-z_$][\w$]*)\s*;/gm;

function matches(content, expression) {
  expression.lastIndex = 0;
  return new Set(Array.from(content.matchAll(expression), (match) => match[1]));
}

function declaredNames(content, expression, omitMergedDefault) {
  const names = matches(content, expression);
  localExportBlock.lastIndex = 0;
  for (const match of content.matchAll(localExportBlock)) {
    if (match[1].includes(' from ')) continue;
    for (const part of match[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith('type ')) continue;
      const name = trimmed
        .split(/\s+as\s+/)
        .at(-1)
        ?.trim();
      if (name && name !== 'default') names.add(name);
    }
  }

  // vtk.js declarations intentionally merge an exported instance interface
  // with the default factory object. Keeping the value declaration exported
  // preserves default imports in type position even though the built value is
  // available only as the default export.
  if (omitMergedDefault) {
    for (const name of matches(content, defaultTarget)) names.delete(name);
  }
  return names;
}

function runtimeExports(content) {
  localExportBlock.lastIndex = 0;
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

function addMismatch(collection, moduleName, names) {
  if (names.size) collection[moduleName] = [...names].sort();
}

if (!fs.existsSync(distDir)) {
  throw new Error('dist/esm is missing; run npm run build:esm first');
}

const actual = { ghostDeclarations: {}, undeclaredRuntimeExports: {} };
for (const declarationPath of walk(sourcesDir, '.d.ts')) {
  const pair = modulePair(declarationPath, sourcesDir, distDir);
  if (!pair) continue;

  const declaration = fs.readFileSync(declarationPath, 'utf8');
  const runtime = fs.readFileSync(pair.runtimePath, 'utf8');
  const exportedAtRuntime = runtimeExports(runtime);
  const declaredValues = declaredNames(declaration, valueDeclaration, true);
  const allDeclarations = declaredNames(declaration, anyDeclaration, false);

  addMismatch(
    actual.ghostDeclarations,
    pair.moduleName,
    declaredValues.difference(exportedAtRuntime)
  );
  addMismatch(
    actual.undeclaredRuntimeExports,
    pair.moduleName,
    exportedAtRuntime.difference(allDeclarations)
  );
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
baseline.ghostDeclarations ??= {};

if (JSON.stringify(stable(actual)) !== JSON.stringify(stable(baseline))) {
  console.error('The declaration/runtime export surface changed.');
  console.error('Expected baseline:');
  console.error(JSON.stringify(baseline, null, 2));
  console.error('Actual census:');
  console.error(JSON.stringify(actual, null, 2));
  process.exitCode = 1;
} else {
  const debt = Object.values(actual.undeclaredRuntimeExports).reduce(
    (count, names) => count + names.length,
    0
  );
  console.log(
    `Export census passed (0 ghosts, ${debt} baselined undeclared runtime exports).`
  );
}
