import { it, expect } from 'vitest';
import macro from 'vtk.js/Sources/macros';
import vtkProxyManager from 'vtk.js/Sources/Proxy/Core/ProxyManager';

// ----------------------------------------------------------------------------
// vtkTestProxyClass methods
// ----------------------------------------------------------------------------
function testProxyClass(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkTestProxyClass');
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------
const DEFAULT_VALUES = {};

// ----------------------------------------------------------------------------
function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Object methods
  macro.obj(publicAPI, model);

  // Proxy methods
  macro.proxy(publicAPI, model);

  testProxyClass(publicAPI, model);
}

const vtkTestProxyClass = {
  newInstance: macro.newInstance(extend, 'vtkTestProxyClass'),
};

// ----------------------------------------------------------------------------

const defaultConfig = {
  definitions: {
    Sources: {
      TrivialProducer: {
        class: vtkTestProxyClass,
        options: {
          activateOnCreate: true,
        },
      },
    },
  },
};

function newProxyManager(proxyConfiguration = defaultConfig) {
  return vtkProxyManager.newInstance({ proxyConfiguration });
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

it('Proxy activation via config', () => {
  const proxyManager = newProxyManager();
  expect(proxyManager.getActiveSource(), 'No initial active source').toBe(
    undefined
  );

  const proxy = proxyManager.createProxy('Sources', 'TrivialProducer');
  expect(
    proxyManager.getActiveSource(),
    'Active source set after proxy creation'
  ).toBe(proxy);

  proxyManager.onModified(() => {
    expect.fail(
      'Proxy manager should not be modified when activating proxy twice'
    );
  });
  proxy.activate();

  proxy.getState();
});

it('Proxy getState serializes the proxy', () => {
  const proxyManager = newProxyManager();
  const proxy = proxyManager.createProxy('Sources', 'TrivialProducer');

  const state = proxy.getState();
  expect(state, 'getState returns a state, not null').not.toBeNull();
  expect(state.vtkClass).toBe('vtkTestProxyClass');
  expect(
    state.proxyManager.vtkClass,
    'the proxy manager serializes instead of recursing forever'
  ).toBe('vtkProxyManager');

  // JSON.stringify routes through toJSON()/getState() and must terminate
  // even though the proxy and its manager reference each other.
  expect(() => JSON.stringify(proxy)).not.toThrow();
  expect(() => JSON.stringify(proxyManager)).not.toThrow();
});

it('Proxy activation via .activate()', () => {
  const proxyManager = newProxyManager();
  expect(
    proxyManager.getActiveSource(),
    'Proxy manager should not be modified when activating proxy twice'
  ).toBe(undefined);

  const proxy = proxyManager.createProxy('Sources', 'TrivialProducer', {
    // Inhibit the default { activateOnCreate: true }
    activateOnCreate: false,
  });
  expect(proxyManager.getActiveSource(), 'No initial active source').toBe(
    undefined
  );

  proxyManager.onModified(() => {});

  proxy.activate();
  expect(
    proxyManager.getActiveSource(),
    'No active source after proxy creation'
  ).toBe(proxy);
});
