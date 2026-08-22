import { expect, it } from 'vitest';
import unverified from 'vtk.js/Utilities/TypeTesting/unverified-surface.json';

// The Node census cannot construct these modules: they need a DOM, a WebGL
// context or a GPU adapter. It hands their declared instance surface here so a
// real browser can enumerate them. Regenerate the manifest with
// `check-declarations.mjs --emit-unverified`.
const modules = import.meta.glob([
  '/Sources/**/index.js',
  '/Sources/**/[A-Z]*.js',
  '!/Sources/**/example*/**',
  '!/Sources/**/test/**',
  '!/Sources/**/*.worker.js',
]);

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

// The modules that build their own DOM read the container from initial values.
function initialValues(moduleName) {
  if (
    moduleName.startsWith('Rendering/Misc') ||
    moduleName.startsWith('Interaction/UI')
  ) {
    const container = document.createElement('div');
    container.style.width = '300px';
    container.style.height = '300px';
    document.body.appendChild(container);
    return { container, rootContainer: container };
  }
  return {};
}

async function surfaceOf(moduleName) {
  const loader =
    modules[`/Sources/${moduleName}/index.js`] ??
    modules[`/Sources/${moduleName}.js`];
  if (!loader) return { skipped: `no module for Sources/${moduleName}` };
  const factory = (await loader()).default;
  if (typeof factory?.newInstance !== 'function') {
    return { skipped: 'no newInstance on the default export' };
  }
  let instance;
  try {
    instance = factory.newInstance(initialValues(moduleName));
  } catch (error) {
    return { skipped: `newInstance threw: ${error.message}` };
  }
  const names = instanceKeys(instance);
  try {
    instance.delete?.();
  } catch {
    // Some factories throw while tearing down without a full pipeline.
  }
  return { names };
}

it('declares only members the browser runtime provides', async () => {
  const ghosts = {};
  const undeclared = {};
  const skipped = {};
  let verified = 0;

  for (const [moduleName, declared] of Object.entries(unverified)) {
    const result = await surfaceOf(moduleName);
    if (result.skipped) {
      skipped[moduleName] = result.skipped;
      continue;
    }
    verified += 1;
    const missing = declared.required.filter((name) => !result.names.has(name));
    if (missing.length) ghosts[moduleName] = missing;
    const extra = [...result.names].filter(
      (name) => !name.startsWith('_') && !declared.all.includes(name)
    );
    if (extra.length) undeclared[moduleName] = extra.sort();
  }

  console.log(
    `Browser census enumerated ${verified}/${Object.keys(unverified).length} ` +
      `modules the Node census cannot construct.`
  );
  if (Object.keys(skipped).length) {
    console.log('Still unverified:', JSON.stringify(skipped, null, 2));
  }
  const undeclaredCount = Object.values(undeclared).reduce(
    (total, names) => total + names.length,
    0
  );
  console.log(
    `${undeclaredCount} undeclared runtime members across ` +
      `${Object.keys(undeclared).length} of them (reported, not gated).`
  );
  if (Object.keys(ghosts).length) {
    console.log('GHOSTS', JSON.stringify(ghosts, null, 2));
  }

  expect(verified).toBeGreaterThan(0);
  expect(ghosts).toEqual({});
});
