import { it, expect } from 'vitest';
import { mat4 } from 'gl-matrix';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import {
  capture,
  countLitPixels,
  createPolyData,
  createScene,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

function makeScene(gc, ordered) {
  const polyData = createPolyData(gc, [0.2, 0.1, -5]);
  for (const [name, values] of [
    ['scale', [0.4, 0.15, 0.3]],
    ['rotation', [Math.cos(Math.PI / 8), 0, 0, Math.sin(Math.PI / 8)]],
  ]) {
    polyData.getPointData().addArray(
      vtkDataArray.newInstance({
        name,
        numberOfComponents: values.length,
        values: Float32Array.from(values),
      })
    );
  }
  const mapper = vtkPointGaussianMapper.newInstance({
    anisotropic: true,
    scaleArray: 'scale',
    rotationArray: 'rotation',
    emissive: false,
  });
  if (ordered) {
    mapper.setPointOrder(
      gc.registerResource(
        vtkDataArray.newInstance({ values: Uint32Array.of(0) })
      )
    );
  }
  const scene = createScene(gc, mapper, polyData, 128);
  const camera = scene.renderer.getActiveCamera();
  camera.setPosition(0, 0, 0);
  camera.setFocalPoint(0, 0, -1);
  return { ...scene, camera };
}

function expectSameSplats(actual, expected) {
  expect(
    countLitPixels(expected),
    'the reference splat is visible'
  ).toBeGreaterThan(100);
  let different = 0;
  for (let i = 0; i < actual.data.length; i += 4) {
    if (Math.abs(actual.data[i] - expected.data[i]) > 2) different++;
  }
  expect(different, 'projection preserves splat support and opacity').toBe(0);
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper projects covariance through explicit oblique matrices',
  async () => {
    const transform = [
      1.3, 0.1, 0.25, 0, 0.25, 0.7, 0.15, 0, 0.12, 0.03, 1, 0, 0.3, -0.1, 0, 1,
    ];
    for (const ordered of [false, true]) {
      for (const perspective of [true, false]) {
        const gc = testUtils.createGarbageCollector();
        try {
          const scene = makeScene(gc, ordered);
          const projection = new Float64Array(16);
          if (perspective) {
            mat4.perspective(projection, Math.PI / 3, 1, 0.1, 100);
          } else {
            mat4.ortho(projection, -2, 2, -2, 2, 0.1, 100);
          }
          scene.camera.setExplicitProjectionMatrix(projection);
          scene.actor.setUserMatrix(transform);
          const reference = await capture(scene);

          // Moving an affine transform from the actor into the projection
          // preserves both centers and Gaussian covariance.
          const oblique = mat4.multiply(
            new Float64Array(16),
            projection,
            transform
          );
          scene.actor.setUserMatrix(mat4.create());
          scene.camera.setExplicitProjectionMatrix(oblique);
          expectSameSplats(await capture(scene), reference);
        } finally {
          gc.releaseResources();
        }
      }
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper transforms anisotropic covariance with actor scale and rotation',
  async () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const scene = makeScene(gc, true);
      const camera = scene.camera;
      camera.setParallelProjection(true);
      camera.setParallelScale(2);
      const original = await capture(scene);
      scene.actor.setScale(2, 1, 1);
      const stretched = await capture(scene);
      expect(countLitPixels(stretched)).toBeGreaterThan(
        1.8 * countLitPixels(original)
      );

      scene.actor.rotateZ(90);
      const rotated = await capture(scene);
      expect(countLitPixels(rotated)).toBeCloseTo(
        countLitPixels(stretched),
        -1
      );
      expect(rotated.data).not.toEqual(stretched.data);
    } finally {
      gc.releaseResources();
    }
  }
);
