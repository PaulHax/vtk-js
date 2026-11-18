import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkPointSpriteMapper from 'vtk.js/Sources/Rendering/Core/PointSpriteMapper';
import vtkPolyDataFS from 'vtk.js/Sources/Rendering/OpenGL/glsl/vtkPolyDataFS.glsl';
import {
  capture,
  createPointSelector,
  createPolyData,
  createScene,
  lookDownZ,
  rgbaAt,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

// One 20 px point in the middle of a 50 px view: its square spans pixels
// 15 to 34, and the corner at (16, 16) lies outside the inscribed disc.
function makeScene(gc) {
  const scene = createScene(
    gc,
    vtkPointSpriteMapper.newInstance(),
    createPolyData(gc, [0, 0, 0]),
    50
  );
  scene.actor.getProperty().setPointSize(20);
  lookDownZ(scene.renderer, 1);
  return scene;
}

async function isLit(scene, x, y) {
  return rgbaAt(await capture(scene), x, y)[0] > 128;
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointSpriteMapper circle draws a round point',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);
    expect(await isLit(scene, 16, 16), 'square corner').toBe(true);
    scene.mapper.setCircle(true);
    expect(await isLit(scene, 16, 16), 'outside the disc').toBe(false);
    expect(await isLit(scene, 25, 25), 'centre').toBe(true);

    // A custom fragment shader template built from the polydata one.
    scene.mapper.setViewSpecificProperties({
      OpenGL: { FragmentShaderCode: vtkPolyDataFS },
    });
    expect(await isLit(scene, 16, 16), 'with a custom template').toBe(false);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointSpriteMapper round points select only their visible disc',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);
    scene.mapper.setCircle(true);
    const selector = createPointSelector(scene);
    await expect(
      selector.selectAsync(scene.renderer, 24, 24, 26, 26)
    ).resolves.toHaveLength(1);
    await expect(
      selector.selectAsync(scene.renderer, 16, 16, 16, 16)
    ).resolves.toEqual([]);
    gc.releaseResources();
  }
);
