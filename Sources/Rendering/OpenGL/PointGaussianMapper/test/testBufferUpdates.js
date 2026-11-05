import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import {
  DISC,
  capture,
  countLitAlong,
  createPolyData,
  createScene,
  lookDownZ,
  renderUploads,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

// Two points with RGB colours and a scale array: positions upload as 6
// floats, colours as 8 bytes and radii as 2 floats.
function makeScene(gc) {
  const polyData = createPolyData(
    gc,
    [0, 0, 0, 1, 0, 0],
    [255, 0, 0, 0, 255, 0]
  );
  polyData.getPointData().addArray(
    vtkDataArray.newInstance({
      name: 'scale',
      values: Float64Array.from([0.5, 1]),
    })
  );
  const scene = createScene(
    gc,
    vtkPointGaussianMapper.newInstance({ scaleArray: 'scale' }),
    polyData,
    32
  );
  scene.renderer.resetCamera();
  scene.renderWindow.render();
  return { ...scene, rgb: polyData.getPointData().getScalars() };
}

// Counts, by buffer, what a change uploads on the next render.
function countUploads(scene) {
  return (change) => {
    change();
    const uploads = renderUploads(scene);
    return {
      positions: uploads.filter(
        (data) => data instanceof Float32Array && data.length === 6
      ).length,
      colors: uploads.filter((data) => data instanceof Uint8Array).length,
      radii: uploads.filter(
        (data) => data instanceof Float32Array && data.length === 2
      ).length,
    };
  };
}

const NONE = { positions: 0, colors: 0, radii: 0 };

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper changes that no buffer depends on upload nothing',
  () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);
    const { mapper, actor } = scene;
    const uploadsSince = countUploads(scene);

    expect(uploadsSince(() => actor.getProperty().setPointSize(9))).toEqual(
      NONE
    );
    expect(
      uploadsSince(() =>
        actor.setUserMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1])
      )
    ).toEqual(NONE);
    expect(uploadsSince(() => mapper.setScaleFactor(2))).toEqual(NONE);
    expect(uploadsSince(() => mapper.setBoundScale(1.5))).toEqual(NONE);
    expect(uploadsSince(() => mapper.setLowpassMatrix(1e-4, 0, 1e-4))).toEqual(
      NONE
    );
    expect(uploadsSince(() => mapper.setEmissive(false))).toEqual(NONE);
    expect(uploadsSince(() => mapper.setSplatShaderCode(DISC))).toEqual(NONE);

    const unread = vtkDataArray.newInstance({
      name: 'unread',
      values: Float32Array.of(1, 2),
    });
    scene.polyData.getPointData().addArray(unread);
    expect(
      uploadsSince(() => unread.modified()),
      'an array no buffer reads'
    ).toEqual(NONE);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper uploads only the buffer whose source changed',
  () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);
    const { polyData, rgb, mapper } = scene;
    const uploadsSince = countUploads(scene);

    expect(
      uploadsSince(() => mapper.setScaleFactor(0)),
      'simple points need no radii'
    ).toEqual(NONE);
    expect(
      uploadsSince(() => mapper.setScaleFactor(1)),
      'splats need their radii back'
    ).toEqual({ ...NONE, radii: 1 });
    expect(
      uploadsSince(() =>
        polyData.getPoints().setData(Float32Array.from([0, 0, 0, 2, 0, 0]), 3)
      )
    ).toEqual({ ...NONE, positions: 1 });
    expect(
      uploadsSince(() =>
        rgb.setData(Uint8Array.from([0, 0, 255, 255, 255, 0]), 3)
      )
    ).toEqual({ ...NONE, colors: 1 });

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper frees the colour buffer when scalars are hidden',
  () => {
    const gc = testUtils.createGarbageCollector();
    const tracker = testUtils.trackWebGLObjects();
    const { mapper, renderWindow } = makeScene(gc);

    const withColours = tracker.count();
    mapper.setScalarVisibility(false);
    renderWindow.render();
    expect(tracker.count()).toBe(withColours - 1);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper redraws points edited in place once the polydata is modified',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const polyData = createPolyData(gc, [-1, 0, 0]);
    const scene = createScene(
      gc,
      vtkPointGaussianMapper.newInstance({ scaleFactor: 0 }),
      polyData,
      40
    );
    scene.actor.getProperty().setPointSize(4);
    lookDownZ(scene.renderer, 2);

    // 10 px per unit: x = -1 and x = 1 land on columns 10 and 30.
    expect(countLitAlong(await capture(scene), { column: 10 })).toBeGreaterThan(
      0
    );
    polyData.getPoints().getData()[0] = 1;
    polyData.modified();
    const image = await capture(scene);
    expect(countLitAlong(image, { column: 10 })).toBe(0);
    expect(countLitAlong(image, { column: 30 })).toBeGreaterThan(0);

    gc.releaseResources();
  }
);
