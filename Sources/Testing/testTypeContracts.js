import { expect, it } from 'vitest';
import macro from 'vtk.js/Sources/macros';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkProxyManager from 'vtk.js/Sources/Proxy/Core/ProxyManager';
import vtkLookupTableProxy from 'vtk.js/Sources/Proxy/Core/LookupTableProxy';
import vtkDataSet from 'vtk.js/Sources/Common/DataModel/DataSet';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkSkybox from 'vtk.js/Sources/Rendering/Core/Skybox';
import resliceCursorBehavior from 'vtk.js/Sources/Widgets/Widgets3D/ResliceCursorWidget/behavior';
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

it('exposes the member names the declarations promise', () => {
  const renderer = vtkRenderer.newInstance();
  expect(renderer.getTexturedBackground()).toBe(false);

  const skybox = vtkSkybox.newInstance();
  expect(skybox.getFormat()).toBe('box');
  expect(skybox.setFormat('sphere')).toBe(true);
  expect(skybox.setFromat).toBeUndefined();

  const mapper = vtkMapper.newInstance();
  expect(mapper.getCoincidentTopologyPointOffsetParameter()).toHaveProperty(
    'factor'
  );
  expect(mapper.getCoincidentTopologyPointOffsetParameters).toBeUndefined();

  expect(vtkDataSet.FieldAssociations.FIELD_ASSOCIATION_CELLS).toBe(1);
});

it('keeps proxy accessors on the names macro.proxy installs', () => {
  const lookupTableProxy = vtkLookupTableProxy.newInstance();
  expect(lookupTableProxy.getRgbPoints()).toBeInstanceOf(Array);
  expect(lookupTableProxy.getHsvPoints()).toBeInstanceOf(Array);
  expect(lookupTableProxy.getRGBPoints).toBeUndefined();
  expect(lookupTableProxy.getHSVPoints).toBeUndefined();

  // getProperties and listProxyProperties stay closed over inside macro.proxy.
  expect(lookupTableProxy.getProperties).toBeUndefined();
  expect(lookupTableProxy.listProxyProperties).toBeUndefined();
  expect(lookupTableProxy.listPropertyNames()).toEqual([]);
});

it('exports the reslice cursor behavior as a decorator', () => {
  expect(typeof resliceCursorBehavior).toBe('function');
  expect(resliceCursorBehavior.length).toBe(2);
});
