import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createTrackedRenderView,
  expectSameImageAfterRelease,
} from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkImageMapper from 'vtk.js/Sources/Rendering/Core/ImageMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';

function createImageSlice(gc) {
  const mapper = gc.registerResource(vtkImageMapper.newInstance());
  mapper.setInputData(testUtils.createImage([8, 8, 8], [1, 1, 1]));
  const slice = gc.registerResource(vtkImageSlice.newInstance());
  slice.setMapper(mapper);
  return slice;
}

function createColorTransferFunction(gc) {
  const colorTransferFunction = gc.registerResource(
    vtkColorTransferFunction.newInstance()
  );
  colorTransferFunction.addRGBPoint(0, 0, 0, 1);
  colorTransferFunction.addRGBPoint(255, 1, 0, 0);
  return colorTransferFunction;
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'releases resources when a slice is removed',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, emptySceneObjects } =
      createTrackedRenderView(gc);

    const slice = createImageSlice(gc);
    renderer.addActor(slice);
    renderer.resetCamera();
    renderWindow.render();
    expect(tracker.count()).toBeGreaterThan(emptySceneObjects);

    renderer.removeActor(slice);
    renderWindow.render();
    expect(tracker.count()).toBe(emptySceneObjects);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'does not leak when slicing or changing window/level',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow } = createTrackedRenderView(gc);

    const slice = createImageSlice(gc);
    renderer.addActor(slice);
    renderer.resetCamera();
    renderWindow.render();
    const objectsInUse = tracker.count();

    slice.getMapper().setSlice(1);
    renderWindow.render();
    slice.getProperty().setColorWindow(100);
    renderWindow.render();
    expect(tracker.count()).toBe(objectsInUse);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'retains shared lookup textures until their last user leaves',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow } = createTrackedRenderView(gc);

    const colorTransferFunction = createColorTransferFunction(gc);
    // Keep opacity shared to isolate color texture ownership.
    const opacityFunction = gc.registerResource(
      vtkPiecewiseFunction.newInstance()
    );
    opacityFunction.addPoint(0, 0.5);
    opacityFunction.addPoint(255, 1);
    const [first, second] = [createImageSlice(gc), createImageSlice(gc)];
    [first, second].forEach((slice) => {
      slice.getProperty().setRGBTransferFunction(colorTransferFunction);
      slice.getProperty().setPiecewiseFunction(opacityFunction);
      renderer.addActor(slice);
    });
    renderer.resetCamera();
    renderWindow.render();

    // A hidden slice cannot recreate a prematurely freed texture.
    second.setVisibility(false);
    first.getProperty().setRGBTransferFunction(null);
    renderWindow.render();
    const objectsWithOneUser = tracker.count();

    second.setVisibility(true);
    renderWindow.render();
    expect(tracker.count()).toBe(objectsWithOneUser);

    second.getProperty().setRGBTransferFunction(null);
    renderWindow.render();
    expect(tracker.count()).toBe(objectsWithOneUser);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'recreates shared and default textures after release',
  () =>
    expectSameImageAfterRelease((gc) => {
      const slice = createImageSlice(gc);
      slice
        .getProperty()
        .setRGBTransferFunction(createColorTransferFunction(gc));
      return slice;
    })
);

it.skipIf(__VTK_TEST_NO_WEBGL__)('removes a slice with no input', () => {
  const gc = testUtils.createGarbageCollector();
  const { tracker, renderer, renderWindow, emptySceneObjects } =
    createTrackedRenderView(gc);

  const slice = gc.registerResource(vtkImageSlice.newInstance());
  slice.setMapper(gc.registerResource(vtkImageMapper.newInstance()));
  renderer.addActor(slice);
  renderWindow.render();

  renderer.removeActor(slice);
  renderWindow.render();
  expect(tracker.count()).toBe(emptySceneObjects);
});
