# Type conformance checks

These checks cover declaration behavior that `tsc --noEmit` cannot verify by
compiling the declarations alone.

- `npm run test:types:exports` compares named value exports in `Sources` with
  the generated ESM modules. It must run after `npm run build:esm`.
- `npm run test:types:surface` goes one level deeper than the export census:
  it enumerates the members of each declared default factory object, each
  constant object, and each instance interface (through the declared
  `newInstance` return type) with the TypeScript compiler API, then imports
  the generated ESM modules in Node and compares against the real runtime
  surface, instantiating each factory headlessly when possible. It must run
  after `npm run build:esm`.
- `npm run test:types:contracts` compiles focused source-tree API contracts.
- `npm run test:types:packed` installs the generated ESM tarball into a clean
  temporary consumer, compiles the same public contracts through package deep
  imports, and runs the package's existing executable smoke checks.
- `Sources/Testing/testTypeContracts.js` verifies the corresponding runtime
  behavior through the normal Vitest suite.

`export-baseline.json` and `surface-baseline.json` record known mismatches
that still lack matching declarations. Do not refresh them mechanically when a
census fails. Review the JavaScript and declaration first, then either fix the
mismatch or update the baseline with the specific intentional exception.
Removing a known mismatch also requires removing its baseline entry.

In `surface-baseline.json`, `ghostMembers` (declared members absent from the
runtime) should stay empty apart from abstract members that only subclasses
implement; the single entry is `vtkAbstractManipulator.handleEvent`, which
every concrete manipulator defines and the abstract factory does not.
`undeclaredMembers` is accepted declaration debt. Three groups make up most of
it: `vtkVolumeMapper` installs throwing stubs for the methods that moved to the
volume property, and those must stay undeclared; `vtkIncrementalOctreePointLocator`
declares no instance members at all; and the OpenGL and WebXR backends expose
render-pass internals their declarations skip. `uninstantiable` lists factories
whose `newInstance` needs browser globals, so only their static surface is
checked headlessly. `importFailures` lists modules the Node ESM loader cannot
import at all (browser globals or broken transitive packaging); their runtime
surface is unverifiable in Node. `IO/Misc/PDBReader` is there because a
transitive dependency ships ESM syntax from a CommonJS package, which also
breaks it for Node consumers of vtk.js.

The census ignores the named value side of vtk.js's merged default-factory
declaration pattern. Those declarations preserve default imports in type
position even though the factory object is only a default runtime export.
