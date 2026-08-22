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
import vtkLine from 'vtk.js/Sources/Common/DataModel/Line';
import vtkCellTypes from 'vtk.js/Sources/Common/DataModel/CellTypes';
import vtkLandmarkTransform from 'vtk.js/Sources/Common/Transform/LandmarkTransform';
import vtkScalarBarActor from 'vtk.js/Sources/Rendering/Core/ScalarBarActor';
import vtkSphereHandleRepresentation from 'vtk.js/Sources/Widgets/Representations/SphereHandleRepresentation';
import ClassHierarchy from 'vtk.js/Sources/Common/Core/ClassHierarchy';
import { CellType } from 'vtk.js/Sources/Common/DataModel/CellTypes/Constants';
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

it('carries the constants its index spreads onto the module default', () => {
  expect(vtkLine.IntersectionState.ON_LINE).toBe(2);
  expect(vtkLandmarkTransform.Mode.AFFINE).toBe(2);
  expect(vtkScalarBarActor.Orientation.AUTO).toBe('auto');

  // CellTypes exports its constants only from the Constants module.
  expect(CellType.VTK_VERTEX).toBe(1);
  expect(vtkCellTypes.CellType).toBeUndefined();
});

it('gives widget representations the algorithm surface', () => {
  const representation = vtkSphereHandleRepresentation.newInstance();
  expect(typeof representation.getOutputPort).toBe('function');
  expect(typeof representation.setInputData).toBe('function');
  expect(representation.getNumberOfInputPorts()).toBe(1);
});

it('keeps duplicate class names out of the hierarchy', () => {
  const hierarchy = new ClassHierarchy();
  hierarchy.push('vtkObject');
  expect(hierarchy.push('vtkObject', 'vtkAlgorithm')).toBe(2);
  expect([...hierarchy]).toEqual(['vtkObject', 'vtkAlgorithm']);
});
