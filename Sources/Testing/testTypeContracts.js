import { expect, it } from 'vitest';
import macro from 'vtk.js/Sources/macros';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkProxyManager from 'vtk.js/Sources/Proxy/Core/ProxyManager';
import { SlabTypes } from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper/Constants';

it('matches macro return-value contracts', () => {
  const publicAPI = {};
  const model = { value: 1 };
  macro.obj(publicAPI, model);
  macro.setGet(publicAPI, model, ['value']);
  macro.event(publicAPI, model, 'Changed');

  expect(publicAPI.setValue(2)).toBe(true);
  expect(publicAPI.setValue(2)).toBe(false);
  expect(publicAPI.onChanged(() => {})).toHaveProperty('unsubscribe');

  publicAPI.delete();
  expect(publicAPI.onChanged(() => {})).toBeNull();
  expect(publicAPI.getState()).toBeNull();
});

it('matches corrected concrete API return contracts', () => {
  const dataArray = vtkDataArray.newInstance({
    values: new Float32Array([1, 2, 3]),
  });
  expect(dataArray.initialize()).toBe(dataArray);

  const piecewiseFunction = vtkPiecewiseFunction.newInstance();
  expect(piecewiseFunction.addPoint(10, 0.5)).toBe(0);

  const proxyManager = vtkProxyManager.newInstance({
    proxyConfiguration: { definitions: {} },
  });
  expect(proxyManager.setActiveView(undefined)).toBeUndefined();
  expect(proxyManager.createProxy('missing', 'missing')).toBeNull();
});

it('models runtime constants as one-way objects', () => {
  expect(SlabTypes.MAX).toBe(1);
  expect(SlabTypes[SlabTypes.MAX]).toBeUndefined();
});
