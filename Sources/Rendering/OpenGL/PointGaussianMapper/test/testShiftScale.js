import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import {
  capture,
  countLitAlong,
  createPolyData,
  createScene,
  lookDownZ,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

// Two points seen from +z with a parallel projection of 20 px per unit, the
// camera centred between them: they land on columns 20 and 40 of a 60 px
// view wherever they are. Returns the lit columns among every tenth.
function makeScene(gc) {
  const polyData = createPolyData(gc, [0, 0, 0, 1, 0, 0]);
  const scene = createScene(
    gc,
    vtkPointGaussianMapper.newInstance({ scaleFactor: 0 }),
    polyData,
    60
  );
  scene.actor.getProperty().setPointSize(4);
  const camera = lookDownZ(scene.renderer, 1.5);

  return async (x) => {
    polyData.getPoints().setData(Float64Array.of(x, 0, 0, x + 1, 0, 0), 3);
    camera.setFocalPoint(x + 0.5, 0, 0);
    camera.setPosition(x + 0.5, 0, 10);
    const image = await capture(scene);
    return [10, 20, 30, 40, 50].filter(
      (column) => countLitAlong(image, { column }) > 0
    );
  };
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper draws points in place far from the origin and back',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const drawAt = makeScene(gc);
    expect(await drawAt(10000000)).toEqual([20, 40]);
    expect(await drawAt(-0.5)).toEqual([20, 40]);
    expect(await drawAt(10000000)).toEqual([20, 40]);
    gc.releaseResources();
  }
);

// Coordinates this far out reuse the VBO shift of the previous upload when
// the new one is within its tolerance.
it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper keeps far points in place when they move a little',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const drawAt = makeScene(gc);
    expect(await drawAt(10000000)).toEqual([20, 40]);
    expect(await drawAt(10000004)).toEqual([20, 40]);
    gc.releaseResources();
  }
);

// Splat sizes come from the model-space covariance, which must not pick up
// the VBO scale that brings far coordinates back into float range.
it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper draws far splats like the same splats at the origin',
  async () => {
    const offset = [5000000, -3000000, 1000000];
    const coords = [-2, 0, 0, 0, 1, 0, 3, -1, 0];
    const scales = [0.3, 0.6, 0.9];

    const render = async (shift) => {
      const gc = testUtils.createGarbageCollector();
      const polyData = createPolyData(gc, []);
      polyData
        .getPoints()
        .setData(
          Float64Array.from(coords.map((value, i) => value + shift[i % 3])),
          3
        );
      polyData.getPointData().addArray(
        vtkDataArray.newInstance({
          name: 'scale',
          values: Float32Array.from(scales),
        })
      );
      const scene = createScene(
        gc,
        vtkPointGaussianMapper.newInstance({
          scaleArray: 'scale',
          emissive: false,
        }),
        polyData,
        64
      );
      const camera = scene.renderer.getActiveCamera();
      camera.setFocalPoint(shift[0], shift[1], shift[2]);
      camera.setPosition(shift[0], shift[1], shift[2] + 12);
      camera.setClippingRange(1, 100);
      const { data } = await capture(scene);
      gc.releaseResources();
      return data;
    };

    const near = await render([0, 0, 0]);
    const far = await render(offset);
    let lit = 0;
    let different = 0;
    for (let i = 0; i < near.length; i += 4) {
      lit += near[i] > 32 ? 1 : 0;
      different += Math.abs(near[i] - far[i]) > 48 ? 1 : 0;
    }
    expect(lit, 'the splats are visible').toBeGreaterThan(100);
    expect(different, 'far splats keep their place and size').toBeLessThan(
      0.05 * lit
    );
  }
);
