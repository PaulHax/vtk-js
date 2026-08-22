# Type conformance checks

These checks cover declaration behavior that `tsc --noEmit` cannot verify by
compiling the declarations alone.

- `npm run test:types:declarations` censuses every `Sources` declaration
  against the module it describes in `dist/esm`, so it must run after
  `npm run build:esm`. It compares named value exports, then enumerates the
  members of each declared default factory object, each constant object and
  each instance interface (through the declared `newInstance` return type) with
  the TypeScript compiler API and matches them against the real runtime
  surface, instantiating each factory headlessly when possible.
- `npm run test:types:browser` runs the same census in a real browser for the
  modules Node cannot construct. `test:types:declarations` writes their declared
  instance surface to `unverified-surface.json`, and
  `Sources/Testing/declarationSurfaceCensus.js` builds each one against a live DOM,
  WebGL or WebGPU context and fails on any declared member the runtime lacks. A
  module the browser still cannot construct is reported as unverified rather than
  passing silently, and WebGPU nodes only construct under `WEBGPU=1`
  (`npm run test:webgpu`). It runs under its own `vitest.declarations.config.js`,
  as its own CI step: the census glob-imports most of `Sources`, which makes Vite
  re-optimize its dependency graph mid-run, and that reload breaks whichever
  sibling test file happens to be importing at the time. Its filename deliberately
  does not match the suite's `test*.js` pattern for the same reason.
- `npm run test:types:initial-values` censuses what each factory accepts as
  `newInstance` options. `newInstance` copies its argument straight onto the
  model, so every `DEFAULT_VALUES` key with a public setter is a real option.
  This reads those keys and the registered accessor names out of each
  `index.js`, resolves the type the declaration gives the `initialValues`
  parameter — the declared type, not whatever interface is named
  `I*InitialValues`, because several modules name it differently — and reports
  the options that type omits. It is pure static analysis, so unlike the
  declaration census it needs no build.
- `npm run test:types:contracts` compiles focused source-tree API contracts.
- `npm run test:types:packed` installs the generated ESM tarball into a clean
  temporary consumer, compiles those same contracts through package deep
  imports, and runs the package's existing executable smoke checks.
- `Sources/Testing/testTypeContracts.js` verifies the corresponding runtime
  behavior through the normal Vitest suite.

`contracts.ts` is the single copy of the compile-time contracts. The packed
check rewrites its `../../Sources/` specifiers to `@kitware/vtk.js/` on the way
into the temporary consumer, so an assertion added there is checked both ways.

`declaration-baseline.json` records known mismatches that still lack matching
declarations. Do not refresh it mechanically when the census fails. Review the
JavaScript and the declaration first, then either fix the mismatch or add the
specific intentional exception. Removing a known mismatch also requires
removing its baseline entry.

The baseline's sections:

- `ghostDeclarations` and `ghostMembers` are declared but absent at runtime and
  should stay empty, apart from abstract members that only subclasses
  implement; the single entry is `vtkAbstractManipulator.handleEvent`, which
  every concrete manipulator defines and the abstract factory does not.
- `undeclaredRuntimeExports` and `undeclaredMembers` are accepted declaration
  debt. Only one entry is left: `vtkVolumeMapper` installs throwing stubs for
  the methods that moved to the volume property, and those must stay
  undeclared — declaring them would advertise methods whose only behavior is to
  throw. Anything else appearing here is a real gap, not a category.
- `arityMismatches` are members whose declaration demands more parameters than
  the implementation accepts, written as `name(declared>runtime)`. Parameters
  that are optional, defaulted or rest are not counted on either side, and
  implementations reading `arguments` are skipped, so an entry means the
  implementation genuinely ignores a trailing argument its contract is handed.
  Most are interactor style and manipulator hooks that override a base method
  and drop the event payload: a style that ends a gesture takes no event data,
  while the base declares the parameter for the styles that do read it.
- `uninstantiable` lists factories whose `newInstance` needs browser globals,
  so only their static surface is checked headlessly. These are handed to the
  browser census rather than left unchecked; being on this list means Node skipped
  the instance comparison, not that nothing verifies it. The `Interaction/UI`
  widgets build their own DOM, and `Rendering/Core/CubeAxesActor` measures text
  on a canvas.
- `importFailures` lists modules the Node ESM loader cannot import at all;
  their member surface is unverifiable in Node, though their exports are still
  compared because that side reads the built module as text. Most are
  browser-only by design. The three chemistry modules
  (`IO/Misc/PDBReader`, `Filters/General/MoleculeToRepresentation`,
  `Proxy/Representations/MoleculeRepresentationProxy`) are not: the build emits
  `dist/esm/Utilities/XMLConverter/package.json` with `"type": "commonjs"`,
  while the `elements.json.js` those modules import from that directory is ESM,
  so Node rejects it with `SyntaxError: Unexpected token 'export'`. That breaks
  the three modules for every Node consumer of vtk.js, not just this check.

The census ignores the named value side of vtk.js's merged default-factory
declaration pattern. Those declarations preserve default imports in type
position even though the factory object is only a default runtime export.

Modules with no `.d.ts` at all are outside the census: it walks declarations,
not the runtime. Adding declarations for a module brings it into scope
automatically.

`initial-values-baseline.json` records the same kind of reviewed exceptions for
the options census, in three sections:

- `missingOptions` are settable keys the declared options type omits, and should
  stay empty. An entry here means `newInstance({ key })` is rejected for a key
  the runtime honors.
- `readOnlyOptions` are keys whose only accessor is a read-only `macro.get`.
  They are assignable at construction because `newInstance` assigns the whole
  object, but they hold internal state — cached tables, timestamps, values
  derived from the input — so they are deliberately not declared.
- `untypedOptions` lists factories whose `initialValues` parameter is still
  `object` or `any`, which accepts anything and completes nothing. The single
  entry is `vtkAnimationProxyManager`: it has no settable options of its own,
  but `macro.proxy` reads `proxyId` and `ui` off the model, so an empty
  interface would reject the keys the proxy manager legitimately constructs it
  with. Typing it needs the shared proxy option set declared first.

Regenerate it with `--write-baseline`, and only after reviewing the diff: a new
`missingOptions` entry is a gap to close, not a line to record.

A disagreement between a `DEFAULT_VALUES` key and the accessor registered for it
is worth reading closely rather than declaring around. The three this branch's
base still carries are misspellings that leave a documented option inert, fixed
on `runtime-defect-cleanup` and written up in
`plans/runtime-defects-from-declaration-audit.md` in the fork's parent directory.
