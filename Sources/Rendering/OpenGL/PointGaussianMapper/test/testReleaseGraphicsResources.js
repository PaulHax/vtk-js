import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createTrackedRenderView,
  expectSameImageAfterRelease,
} from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import {
  DISC,
  createPolyData,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

// Coloured points carrying every per-point buffer the mapper can own. The
// opacities stay at one and splats are hard discs, so that no translucent pass
// allocates its own targets.
function createPointActor(gc, initialValues) {
  const polyData = createPolyData(
    gc,
    [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
    [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]
  );
  const pointData = polyData.getPointData();
  pointData.addArray(
    vtkDataArray.newInstance({
      name: 'scale',
      numberOfComponents: 3,
      values: Float32Array.from([1, 2, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1]),
    })
  );
  pointData.addArray(
    vtkDataArray.newInstance({
      name: 'rotation',
      numberOfComponents: 4,
      values: Float32Array.from([
        1, 0, 0, 0, 0.9, 0.4, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
      ]),
    })
  );
  pointData.addArray(
    vtkDataArray.newInstance({
      name: 'opacity',
      values: Float32Array.from([1, 1, 1, 1]),
    })
  );
  const mapper = gc.registerResource(
    vtkPointGaussianMapper.newInstance({
      emissive: false,
      splatShaderCode: DISC,
      scaleArray: 'scale',
      rotationArray: 'rotation',
      opacityArray: 'opacity',
      ...initialValues,
    })
  );
  mapper.setInputData(polyData);
  mapper.setColorModeToDirectScalars();
  const actor = gc.registerResource(vtkActor.newInstance());
  actor.getProperty().setPointSize(10);
  actor.setMapper(mapper);
  return actor;
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper redraws the same points after releaseGraphicsResources',
  () =>
    expectSameImageAfterRelease((gc) =>
      createPointActor(gc, { scaleFactor: 0 })
    )
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper redraws the same splats after releaseGraphicsResources',
  () =>
    expectSameImageAfterRelease((gc) =>
      createPointActor(gc, { scaleFactor: 0.2, anisotropic: true })
    )
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper frees every buffer when its actor leaves the view',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, emptySceneObjects } =
      createTrackedRenderView(gc);

    const actors = [
      createPointActor(gc, { scaleFactor: 0 }),
      createPointActor(gc, { scaleFactor: 0.2 }),
      createPointActor(gc, { scaleFactor: 0.2, anisotropic: true }),
    ];
    actors.forEach((actor) => renderer.addActor(actor));
    renderer.resetCamera();
    renderWindow.render();
    expect(tracker.count()).toBeGreaterThan(emptySceneObjects);

    actors.forEach((actor) => renderer.removeActor(actor));
    renderWindow.render();
    expect(tracker.count()).toBe(emptySceneObjects);

    gc.releaseResources();
  }
);
