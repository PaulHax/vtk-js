/**
 * The purpose of this file is to bundle all testing
 * entrypoints into one chunk. This cuts down on extraneous
 * code generation and addresses a race issue with the
 * timer task queue.
 *
 * Optional filtering:
 *   TEST_PATTERN=SharedRenderWindow npm test
 *   TEST_PATTERN=Rendering/OpenGL/SharedRenderWindow/test npm test
 */

/* global __TEST_PATTERN__ */

import './setupTestEnv';

// webpack will include files that match the regex
// '..' refers to the Sources/ dir
const testsContext = require.context('..', true, /test[^/]+\.js$/);

const testPattern =
  typeof __TEST_PATTERN__ !== 'undefined' ? __TEST_PATTERN__ : '';
const testKeys = testsContext.keys();

if (testPattern) {
  testKeys.filter((key) => key.includes(testPattern)).forEach(testsContext);
} else {
  testKeys.forEach(testsContext);
}
