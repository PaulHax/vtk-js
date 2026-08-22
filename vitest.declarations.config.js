import base from './vitest.config.js';

// The census glob-imports most of Sources, which makes Vite re-optimize its
// dependency graph mid-run. That reload breaks whichever sibling test file is
// importing at the time, so the census runs in its own Vitest invocation
// rather than alongside the rest of the suite.
export default {
  ...base,
  test: {
    ...base.test,
    include: ['Sources/Testing/declarationSurfaceCensus.js'],
    reporters: ['default'],
    outputFile: {},
  },
};
