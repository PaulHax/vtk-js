import { it, expect } from 'vitest';
import { mat4 } from 'gl-matrix';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkPointSpriteMapper from 'vtk.js/Sources/Rendering/Core/PointSpriteMapper';
import {
  capture,
  countLitPixels,
  createPolyData,
  createScene,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

// One point at the origin in a 50 px view.
function makeScene(gc) {
  return createScene(
    gc,
    vtkPointSpriteMapper.newInstance(),
    createPolyData(gc, [0, 0, 0]),
    50
  );
}

// Looks at the origin from the given distance along +z.
function placeCamera(renderer, distance) {
  const camera = renderer.getActiveCamera();
  camera.setPosition(0, 0, distance);
  renderer.resetCameraClippingRange();
  return camera;
}

const drawnArea = async (scene) => countLitPixels(await capture(scene));

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'worldSize scales points with perspective distance; screen mode does not',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);

    // worldSize 1 at viewAngle 30 in a 50 px viewport: about 19 px across at
    // distance 5 and 9 px at distance 10, a quarter of the area.
    scene.mapper.setWorldSize(1);
    placeCamera(scene.renderer, 5);
    const nearCount = await drawnArea(scene);
    placeCamera(scene.renderer, 10);
    const farCount = await drawnArea(scene);

    expect(farCount, 'the far point still renders').toBeGreaterThan(0);
    expect(
      nearCount,
      'a world-sized point covers about 4x the area at half the distance'
    ).toBeGreaterThan(2.5 * farCount);
    expect(nearCount).toBeLessThan(6 * farCount);

    // Screen-space mode keeps the drawn size independent of distance.
    scene.mapper.setWorldSize(0);
    scene.actor.getProperty().setPointSize(10);
    placeCamera(scene.renderer, 5);
    const screenNear = await drawnArea(scene);
    placeCamera(scene.renderer, 10);
    const screenFar = await drawnArea(scene);
    expect(screenFar).toBeGreaterThan(0);
    expect(
      Math.abs(screenNear - screenFar),
      'screen-space size is unaffected by distance'
    ).toBeLessThan(0.25 * screenNear);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'sub-pixel world points fall back to the actor point size floor',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);

    scene.actor.getProperty().setPointSize(12);
    placeCamera(scene.renderer, 5);
    const screenCount = await drawnArea(scene);

    // A world size that projects far below 1 px must not shrink the point
    // below the screen-space floor.
    scene.mapper.setWorldSize(0.01);
    const flooredCount = await drawnArea(scene);

    expect(screenCount).toBeGreaterThan(0);
    expect(
      Math.abs(flooredCount - screenCount),
      'sub-pixel world sizing renders at the actor point size'
    ).toBeLessThan(0.25 * screenCount + 3);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'worldSize folds the actor scale in (model units through the transform)',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);

    // A point at the origin stays in place under actor scaling, so scaling
    // the actor only rescales the point: 2x scale, about 4x area.
    scene.mapper.setWorldSize(0.5);
    placeCamera(scene.renderer, 5);
    const unscaled = await drawnArea(scene);
    scene.actor.setScale(2, 2, 2);
    const scaled = await drawnArea(scene);

    expect(unscaled, 'the unscaled point renders').toBeGreaterThan(0);
    expect(
      scaled,
      'a 2x actor scale roughly quadruples the covered area'
    ).toBeGreaterThan(2.5 * unscaled);
    expect(scaled).toBeLessThan(6 * unscaled);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'worldSize under a parallel projection tracks parallelScale, not distance',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);

    scene.mapper.setWorldSize(1);
    const camera = placeCamera(scene.renderer, 5);
    camera.setParallelProjection(true);
    camera.setParallelScale(5); // 1 world unit is 5 px in a 50 px viewport

    const nearCount = await drawnArea(scene);
    placeCamera(scene.renderer, 10);
    const farCount = await drawnArea(scene);
    expect(farCount, 'the point renders at both distances').toBeGreaterThan(0);
    expect(
      Math.abs(nearCount - farCount),
      'parallel-projection size is distance-independent'
    ).toBeLessThan(0.4 * nearCount + 3);

    // Halving parallelScale zooms in 2x: covered area grows about 4x.
    camera.setParallelScale(2.5);
    const zoomedCount = await drawnArea(scene);
    expect(
      zoomedCount,
      'halving parallelScale roughly quadruples the covered area'
    ).toBeGreaterThan(2.5 * farCount);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'worldSize follows an explicit projection matrix',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);

    scene.mapper.setWorldSize(2);
    const camera = placeCamera(scene.renderer, 5);
    camera.setViewAngle(60);
    const reference = await drawnArea(scene);

    camera.setViewAngle(30);
    camera.setExplicitProjectionMatrix(
      mat4.perspective(mat4.create(), Math.PI / 3, 1, 1, 100)
    );
    const explicit = await drawnArea(scene);
    expect(reference).toBeGreaterThan(0);
    expect(explicit).toBeGreaterThan(0.8 * reference);
    expect(explicit).toBeLessThan(1.25 * reference);

    gc.releaseResources();
  }
);
