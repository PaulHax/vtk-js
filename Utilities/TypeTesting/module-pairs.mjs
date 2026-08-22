import fs from 'node:fs';
import path from 'node:path';

export function walk(directory, suffix) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(entryPath, suffix));
    else if (entry.name.endsWith(suffix)) files.push(entryPath);
  }
  return files;
}

export function modulePair(declarationPath, sourcesDir, distDir) {
  const directory = path.dirname(declarationPath);
  const filename = path.basename(declarationPath);
  const relativeDirectory = path.relative(sourcesDir, directory);
  let moduleName;
  let runtimePath;

  if (filename === 'index.d.ts') {
    moduleName = relativeDirectory.replaceAll(path.sep, '/');
    runtimePath = path.join(distDir, `${relativeDirectory}.js`);
    if (!fs.existsSync(runtimePath)) {
      runtimePath = path.join(distDir, relativeDirectory, 'index.js');
    }
  } else {
    const basename = filename.slice(0, -'.d.ts'.length);
    moduleName = path
      .join(relativeDirectory, basename)
      .replaceAll(path.sep, '/');
    runtimePath = path.join(distDir, relativeDirectory, `${basename}.js`);
  }

  return fs.existsSync(runtimePath) ? { moduleName, runtimePath } : null;
}

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)])
    );
  }
  return value;
}
