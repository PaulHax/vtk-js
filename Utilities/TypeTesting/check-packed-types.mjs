import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'vtk-packed-types-')
);

try {
  const tarballName = execFileSync(
    'npm',
    [
      'pack',
      path.join(root, 'dist', 'esm'),
      '--silent',
      '--pack-destination',
      temporaryDirectory,
    ],
    { cwd: root, encoding: 'utf8' }
  ).trim();
  const tarballPath = path.join(temporaryDirectory, tarballName);

  fs.writeFileSync(
    path.join(temporaryDirectory, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`
  );
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      tarballPath,
    ],
    { cwd: temporaryDirectory, stdio: 'inherit' }
  );

  // The packed consumer compiles the very same contracts; only the module
  // specifiers change, from source-tree paths to package deep imports.
  const contracts = fs
    .readFileSync(path.join(scriptDirectory, 'contracts.ts'), 'utf8')
    .replaceAll("'../../Sources/", "'@kitware/vtk.js/");
  if (contracts.includes('../../Sources')) {
    throw new Error('contracts.ts has a source-tree import the rewrite missed');
  }
  fs.writeFileSync(path.join(temporaryDirectory, 'contracts.ts'), contracts);
  fs.writeFileSync(
    path.join(temporaryDirectory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        include: ['contracts.ts'],
        compilerOptions: {
          lib: ['ESNext', 'DOM'],
          module: 'ESNext',
          moduleResolution: 'Node',
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          target: 'ES2022',
        },
      },
      null,
      2
    )}\n`
  );

  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
      '-p',
      path.join(temporaryDirectory, 'tsconfig.json'),
    ],
    { cwd: temporaryDirectory, stdio: 'inherit' }
  );

  execFileSync(
    process.execPath,
    ['-e', "require('@kitware/vtk.js/Utilities/config/rules-vtk')"],
    { cwd: temporaryDirectory, stdio: 'inherit' }
  );
  execFileSync(
    process.execPath,
    ['-e', "require('@kitware/vtk.js/Utilities/config/chainWebpack')"],
    { cwd: temporaryDirectory, stdio: 'inherit' }
  );
  execFileSync(
    path.join(temporaryDirectory, 'node_modules', '.bin', 'vtkDataConverter'),
    ['--help'],
    { cwd: temporaryDirectory, stdio: 'ignore' }
  );
  console.log('Packed ESM declaration contracts passed.');
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
