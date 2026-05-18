import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import path from 'path';
import { createVtkPlugins } from './Utilities/build/plugins.mjs';

const noWebGL = !!process.env.NO_WEBGL;
const webGPU = !!process.env.WEBGPU;
const testBrowser = process.env.TEST_BROWSER || 'chromium';
const ci = !!process.env.CI;

// Firefox WebGL in fully-headless mode is fragile on Linux CI (Mozilla bug
// 1375585). Run Firefox windowed inside xvfb-run instead — the X server gives
// us llvmpipe and Firefox sees a "real" display.
const firefox = {
  browser: 'firefox',
  launch: {
    headless: false,
    firefoxUserPrefs: {
      'dom.webgpu.enabled': true, // off by default on Linux Firefox
      'webgl.force-enabled': true, // override GPU blocklist (no real GPU on CI)
      'webgl.disable-fail-if-major-performance-caveat': true, // accept llvmpipe
    },
  },
};

function buildBrowserInstances() {
  if (ci) {
    return [
      {
        browser: 'chromium',
        launch: {
          headless: true,
          args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
        },
      },
      firefox,
    ];
  }
  return [testBrowser === 'firefox' ? firefox : { browser: 'chromium', launch: { headless: true } }];
}

export default defineConfig({
  resolve: {
    alias: {
      'vtk.js': path.resolve(import.meta.dirname),
    },
  },
  optimizeDeps: {
    include: ['webworker-promise/lib/register'],
  },
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  define: {
    __BASE_PATH__: JSON.stringify(''),
    __VTK_TEST_NO_WEBGL__: JSON.stringify(noWebGL),
    __VTK_TEST_WEBGPU__: JSON.stringify(webGPU),
    global: 'globalThis',
  },
  plugins: createVtkPlugins({
    includeCjson: true,
    includeStaticData: true,
    staticDataRootDir: import.meta.dirname,
  }),
  test: {
    include: ['Sources/**/test*.js'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'Sources/Testing/testUtils.js',
      'Sources/Testing/setupTestEnv.js',
    ],
    setupFiles: ['Sources/Testing/setupTestEnv.js'],
    testTimeout: 120000,
    reporters: ['default', 'junit'],
    outputFile: { junit: 'Utilities/TestResults/junit-report.xml' },
    fileParallelism: false, // GPU tests should run sequentially
    maxWorkers: 1, // Single worker for GPU resource management
    retry: ci ? 1 : 0,
    allowOnly: !ci,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: buildBrowserInstances(),
    },
  },
});
