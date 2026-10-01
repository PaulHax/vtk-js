import { it, expect, onTestFinished, vi } from 'vitest';
import macro from 'vtk.js/Sources/macros';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkImageCPRMapper from 'vtk.js/Sources/Rendering/Core/ImageCPRMapper';
import vtkImageMapper from 'vtk.js/Sources/Rendering/Core/ImageMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';

const size = 8;

// Replacing a texture can leave the live texture count unchanged.
function countTextureCalls(context) {
  const calls = [
    'createTexture',
    'texImage2D',
    'texImage3D',
    'texStorage2D',
    'texStorage3D',
    'texSubImage2D',
    'texSubImage3D',
  ]
    .filter((name) => context[name])
    .map((name) => vi.spyOn(context, name));
  onTestFinished(() => calls.forEach((call) => call.mockRestore()));
  return () => calls.reduce((count, call) => count + call.mock.calls.length, 0);
}

function createSlice(gc, Mapper) {
  const mapper = gc.registerResource(Mapper.newInstance());
  mapper.setInputData(testUtils.createImage([size, size, size], [1, 1, 1]));
  if (Mapper === vtkImageCPRMapper) {
    const centerline = gc.registerResource(vtkPolyData.newInstance());
    const center = size / 2;
    centerline
      .getPoints()
      .setData(
        Float32Array.of(center, center, 0.5, center, center, size - 1.5)
      );
    centerline.getLines().setData(Uint16Array.of(2, 0, 1));
    mapper.setCenterlineData(centerline);
    mapper.setUseUniformOrientation(true);
    mapper.setWidth(size);
  }
  const slice = gc.registerResource(vtkImageSlice.newInstance());
  slice.setMapper(mapper);
  return slice;
}

function createTransferFunctions(gc) {
  const colorTransferFunction = gc.registerResource(
    vtkColorTransferFunction.newInstance()
  );
  colorTransferFunction.addRGBPoint(0, 0, 0, 1);
  colorTransferFunction.addRGBPoint(255, 1, 0.5, 0);
  const piecewiseFunction = gc.registerResource(
    vtkPiecewiseFunction.newInstance()
  );
  piecewiseFunction.addPoint(0, 1);
  piecewiseFunction.addPoint(255, 1);
  return { colorTransferFunction, piecewiseFunction };
}

it.skipIf(__VTK_TEST_NO_WEBGL__).each([
  ['ImageMapper', vtkImageMapper],
  ['ImageCPRMapper', vtkImageCPRMapper],
])('%s uploads no textures on unchanged renders', (_, Mapper) => {
  const gc = testUtils.createGarbageCollector();
  const { renderer, renderWindow, view } = createTrackedRenderView(gc);
  const slice = createSlice(gc, Mapper);
  renderer.addActor(slice);
  renderer.resetCamera();
  renderWindow.render();
  slice.getProperty().setColorWindow(100);
  renderWindow.render();

  const textureCalls = countTextureCalls(view.getContext());
  renderWindow.render();
  expect(textureCalls()).toBe(0);

  const { colorTransferFunction } = createTransferFunctions(gc);
  slice.getProperty().setRGBTransferFunction(colorTransferFunction);
  renderWindow.render();
  expect(textureCalls()).toBeGreaterThan(0);
});

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'CPR keeps drawing slices that share transfer functions in two table layouts',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view } = createTrackedRenderView(gc);
    const { colorTransferFunction, piecewiseFunction } =
      createTransferFunctions(gc);
    const slices = [
      createSlice(gc, vtkImageCPRMapper),
      createSlice(gc, vtkImageCPRMapper),
    ];
    // The transfer-function cache holds one table layout at a time.
    slices[1].getProperty().setIndependentComponents(true);
    slices.forEach((slice) => {
      slice.getProperty().setRGBTransferFunction(colorTransferFunction);
      slice.getProperty().setPiecewiseFunction(piecewiseFunction);
      renderer.addActor(slice);
    });
    renderer.resetCamera();
    const firstFrame = view.captureNextImage();
    renderWindow.render();

    const secondFrame = view.captureNextImage();
    renderWindow.render();
    expect(await secondFrame).toBe(await firstFrame);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'CPR draws a changed width after a context wide release',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view } = createTrackedRenderView(gc);
    const slice = createSlice(gc, vtkImageCPRMapper);
    renderer.addActor(slice);
    renderer.resetCamera();
    const wideFrame = view.captureNextImage();
    renderWindow.render();

    slice.getMapper().setWidth(size / 2);
    const narrowFrame = view.captureNextImage();
    renderWindow.render();
    expect(await narrowFrame).not.toBe(await wideFrame);

    const errors = [];
    macro.setLoggerFunction('error', (...args) => errors.push(args.join(' ')));
    onTestFinished(() => macro.setLoggerFunction('error', console.error));
    view.releaseGraphicsResources();
    slice.getMapper().setWidth(size);
    const restoredFrame = view.captureNextImage();
    renderWindow.render();
    expect(errors).toEqual([]);
    expect(await restoredFrame).toBe(await wideFrame);
  }
);
