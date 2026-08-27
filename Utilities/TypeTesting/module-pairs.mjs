import fs from 'node:fs';
import path from 'node:path';

export function walk(directory, suffix, skipDirectory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (skipDirectory?.(entry.name)) continue;
      files.push(...walk(entryPath, suffix, skipDirectory));
    } else if (entry.name.endsWith(suffix)) files.push(entryPath);
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
  if (Array.isArray(value)) return [...value].map(stable).sort();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)])
    );
  }
  return value;
}

/**
 * Compare a census against its reviewed baseline and report. Both censuses gate
 * the same way: identical means pass, anything else prints both sides so the
 * diff is readable in CI. `--write-baseline` regenerates instead of comparing.
 */
export function compareToBaseline(census, baselinePath, { subject, summary }) {
  const normalized = stable(census);

  if (process.argv.includes('--write-baseline')) {
    fs.writeFileSync(baselinePath, `${JSON.stringify(normalized, null, 2)}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), baselinePath)}.`);
    return true;
  }

  const baseline = stable(JSON.parse(fs.readFileSync(baselinePath, 'utf8')));
  if (JSON.stringify(normalized) === JSON.stringify(baseline)) {
    console.log(summary());
    return true;
  }

  console.error(subject);
  console.error('Expected baseline:');
  console.error(JSON.stringify(baseline, null, 2));
  console.error('Actual census:');
  console.error(JSON.stringify(normalized, null, 2));
  return false;
}

/** Count the names held across a census section keyed by module. */
export const total = (collection) =>
  Object.values(collection).reduce((count, names) => count + names.length, 0);
