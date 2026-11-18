import { it, expect, onTestFinished, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkPointSpriteMapper from 'vtk.js/Sources/Rendering/Core/PointSpriteMapper';
import {
  DISC,
  attributeIds,
  capture,
  countLitPixels,
  createPointSelector,
  createPolyData,
  createScene,
  lookDownZ,
  rgbaAt,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

// Five coloured points 10 px apart along the middle row of a 60 px view.
const POINT_X = [10, 20, 30, 40, 50];

function makeScene(gc, initialValues) {
  const scene = createScene(
    gc,
    vtkPointSpriteMapper.newInstance(initialValues),
    createPolyData(
      gc,
      [-2, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0],
      [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 255, 0, 255]
    ),
    60
  );
  scene.actor.getProperty().setPointSize(4);
  lookDownZ(scene.renderer, 3);
  return scene;
}

// The columns of the points that are drawn.
async function drawnPoints(scene) {
  const image = await capture(scene);
  return POINT_X.filter((x) =>
    rgbaAt(image, x, 30)
      .slice(0, 3)
      .some((value) => value > 0)
  );
}

it('vtkPointSpriteMapper draws opaque simple points by default', () => {
  const mapper = vtkPointSpriteMapper.newInstance();
  expect(mapper.isA('vtkPointGaussianMapper')).toBe(true);
  expect(mapper.getScaleFactor()).toBe(0);
  expect(mapper.getEmissive()).toBe(false);
  expect(mapper.getPointSizeScale()).toBe(1);
  expect(mapper.getCircle()).toBe(false);
  expect(mapper.getWorldSize()).toBe(0);
  expect(mapper.getMaximumPointCount()).toBe(-1);
  expect(mapper.getBoundScale(), 'other settings keep VTK defaults').toBe(3);
  mapper.delete();
});

it('vtkPointSpriteMapper normalizes its progressive draw count', () => {
  const mapper = vtkPointSpriteMapper.newInstance({ maximumPointCount: 4.5 });
  expect(mapper.getMaximumPointCount()).toBe(4);
  expect(mapper.setMaximumPointCount(3.8)).toBe(true);
  expect(mapper.getMaximumPointCount()).toBe(3);
  expect(mapper.setMaximumPointCount(Number.NaN)).toBe(false);
  expect(mapper.getMaximumPointCount()).toBe(3);
  expect(mapper.setMaximumPointCount(-20)).toBe(true);
  expect(mapper.getMaximumPointCount()).toBe(-1);
  mapper.delete();
});

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointSpriteMapper changes its draw prefix without uploading buffers',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);
    expect(await drawnPoints(scene)).toEqual(POINT_X);
    const bufferData = vi.spyOn(scene.view.getContext(), 'bufferData');
    onTestFinished(() => bufferData.mockRestore());

    scene.mapper.setMaximumPointCount(2);
    expect(await drawnPoints(scene)).toEqual([10, 20]);

    scene.mapper.setSplatShaderCode(DISC);
    scene.mapper.setScaleFactor(0.2);
    scene.mapper.setMaximumPointCount(3);
    expect(await drawnPoints(scene), 'a prefix of splats').toEqual([
      10, 20, 30,
    ]);

    scene.mapper.setScaleFactor(0);
    scene.mapper.setMaximumPointCount(-1);
    expect(await drawnPoints(scene)).toEqual(POINT_X);
    expect(bufferData).not.toHaveBeenCalled();

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointSpriteMapper selects only the points it draws',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc, { maximumPointCount: 2 });
    const selector = createPointSelector(scene);
    const selectPixel = (x) =>
      selector.selectAsync(scene.renderer, x, 30, x, 30);
    expect(attributeIds(await selectPixel(20))).toEqual([1]);
    expect(await selectPixel(30), 'beyond the prefix').toEqual([]);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointSpriteMapper scales the actor point size by pointSizeScale',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);
    const unscaled = countLitPixels(await capture(scene));
    scene.mapper.setPointSizeScale(2);
    const scaled = countLitPixels(await capture(scene));
    expect(unscaled, 'five 4 px points').toBe(80);
    expect(scaled, 'twice the diameter, four times the area').toBe(320);
    gc.releaseResources();
  }
);
