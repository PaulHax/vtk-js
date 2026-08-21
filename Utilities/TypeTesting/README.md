# Type conformance checks

These checks cover declaration behavior that `tsc --noEmit` cannot verify by
compiling the declarations alone.

- `npm run test:types:exports` compares named value exports in `Sources` with
  the generated ESM modules. It must run after `npm run build:esm`.
- `npm run test:types:contracts` compiles focused source-tree API contracts.
- `npm run test:types:packed` installs the generated ESM tarball into a clean
  temporary consumer, compiles the same public contracts through package deep
  imports, and runs the package's existing executable smoke checks.
- `Sources/Testing/testTypeContracts.js` verifies the corresponding runtime
  behavior through the normal Vitest suite.

`export-baseline.json` records known runtime exports that still lack matching
declarations. Do not refresh it mechanically when the census fails. Review the
JavaScript and declaration first, then either fix the mismatch or update the
baseline with the specific intentional exception. Removing a known mismatch
also requires removing its baseline entry.

The census ignores the named value side of vtk.js's merged default-factory
declaration pattern. Those declarations preserve default imports in type
position even though the factory object is only a default runtime export.
