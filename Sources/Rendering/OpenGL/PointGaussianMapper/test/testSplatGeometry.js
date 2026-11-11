import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkProperty from 'vtk.js/Sources/Rendering/Core/Property';
import {
  DISC,
  capture,
  countLitAlong,
  countLitPixels,
  createPolyData,
  createScene,
  lookDownZ,
  rgbaAt,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

// A 45 degree turn about z, as a quaternion with the real part first.
const TURN_45 = [Math.cos(Math.PI / 8), 0, 0, Math.sin(Math.PI / 8)];

// A disc-shaped splat at the origin, seen from +z at 5 px per unit in a
// 40 px view, with the given point data arrays.
function makeSplat(gc, initialValues, arrays = {}) {
  const polyData = createPolyData(gc, [0, 0, 0]);
  Object.entries(arrays).forEach(([name, values]) =>
    polyData.getPointData().addArray(
      vtkDataArray.newInstance({
        name,
        numberOfComponents: values.length,
        values: Float32Array.from(values),
      })
    )
  );
  const scene = createScene(
    gc,
    vtkPointGaussianMapper.newInstance({
      emissive: false,
      splatShaderCode: DISC,
      ...initialValues,
    }),
    polyData,
    40
  );
  lookDownZ(scene.renderer, 4);
  return scene;
}

// Lit pixels across the middle row and down the middle column.
async function measure(scene) {
  const image = await capture(scene);
  return [
    countLitAlong(image, { row: 20 }),
    countLitAlong(image, { column: 20 }),
  ];
}

// A measured width and height, give or take 5 px.
const roughly = (width, height) => [
  expect.closeTo(width, -1),
  expect.closeTo(height, -1),
];

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper draws the part of a splat that reaches into the view',
  async () => {
    const gc = testUtils.createGarbageCollector();
    // Half the width of the view at the origin, seen from a distance of 10
    // with the default 30 degree view angle.
    const halfWidth = 10 * Math.tan(Math.PI / 12);
    const scene = createScene(
      gc,
      vtkPointGaussianMapper.newInstance({ scaleFactor: 0.5 * halfWidth }),
      createPolyData(gc, [1.4 * halfWidth, 0, 0]),
      40
    );
    scene.actor.getProperty().setColor(0.3, 0, 0);
    lookDownZ(scene.renderer);

    const image = await capture(scene);
    const red = (x) => rgbaAt(image, x, 19)[0];
    expect(red(39), 'the right edge, within one deviation').toBeGreaterThan(
      0.5 * 0.3 * 255
    );
    expect(red(0), 'the left edge, beyond the splat').toBe(0);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper stretches anisotropic splats and switches back to isotropic ones',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeSplat(
      gc,
      { anisotropic: true, scaleArray: 'scale' },
      { scale: [1, 2, 1] }
    );
    expect(await measure(scene)).toEqual(roughly(10, 20));

    // The first component of the scale array sizes an isotropic splat.
    scene.mapper.setAnisotropic(false);
    expect(await measure(scene)).toEqual(roughly(10, 10));

    scene.mapper.setScaleArrayComponent(1.5);
    expect(await measure(scene), 'a fractional component rounds down').toEqual(
      roughly(20, 20)
    );

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper draws rotated splats as front faces that culling keeps',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeSplat(
      gc,
      { anisotropic: true, scaleArray: 'scale', rotationArray: 'rotation' },
      { scale: [1, 2, 1], rotation: TURN_45 }
    );
    const drawn = countLitPixels(await capture(scene));
    expect(drawn, 'an ellipse of 5 by 10 px half axes').toBeGreaterThan(120);

    scene.actor.setBackfaceProperty(
      gc.registerResource(vtkProperty.newInstance())
    );
    expect(countLitPixels(await capture(scene)), 'no back faces').toBe(drawn);
    const property = scene.actor.getProperty();
    property.setBackfaceCulling(true);
    expect(countLitPixels(await capture(scene)), 'back faces culled').toBe(
      drawn
    );
    property.setBackfaceCulling(false);
    property.setFrontfaceCulling(true);
    expect(countLitPixels(await capture(scene)), 'front faces culled').toBe(
      drawn
    );
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper treats a zero quaternion as no rotation',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeSplat(
      gc,
      { anisotropic: true, scaleArray: 'scale', rotationArray: 'rotation' },
      { scale: [1, 2, 1], rotation: [0, 0, 0, 0] }
    );
    expect(await measure(scene)).toEqual(roughly(10, 20));
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper treats a null low-pass filter as none',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeSplat(gc, { lowpassMatrix: [0.01, 0, 0.01] });
    const filtered = countLitPixels(await capture(scene));
    scene.mapper.setLowpassMatrix(null);
    const unfiltered = countLitPixels(await capture(scene));
    expect(unfiltered, 'a disc of 5 px radius').toBeCloseTo(25 * Math.PI, -1);
    expect(filtered, 'the filter widens the splat').toBeGreaterThan(unfiltered);
    gc.releaseResources();
  }
);
