import { expect, it } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkPoints from 'vtk.js/Sources/Common/Core/Points';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import {
  createPolyData,
  createScene,
  renderUploads,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

function makeScene(gc, polyData, initialValues = { scaleFactor: 0 }) {
  const scene = createScene(
    gc,
    vtkPointGaussianMapper.newInstance(initialValues),
    polyData,
    32
  );
  scene.renderer.resetCamera();
  scene.view.initialize();
  return scene;
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'uploads float positions and RGBA byte colours as they are, also through verts drawing every point in order',
  () => {
    const gc = testUtils.createGarbageCollector();
    const polyData = createPolyData(
      gc,
      [0, 0, 0, 1, 0, 0, 0, 1, 0],
      [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]
    );
    const rgba = polyData.getPointData().getScalars();
    const scene = makeScene(gc, polyData);
    const points = polyData.getPoints();

    const direct = renderUploads(scene);
    expect(direct).toContain(points.getData());
    expect(direct).toContain(rgba.getData());

    for (const verts of [
      [3, 0, 1, 2],
      [1, 0, 1, 1, 1, 2],
    ]) {
      polyData.getVerts().setData(Uint16Array.from(verts));
      const throughVerts = renderUploads(scene);
      expect(throughVerts, `verts ${verts}`).toContain(points.getData());
      expect(throughVerts, `verts ${verts}`).toContain(rgba.getData());
    }

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'stages positions when the point array is shorter than the drawn count',
  () => {
    const gc = testUtils.createGarbageCollector();
    const polyData = createPolyData(gc, []);
    // Four points are reported and drawn, but the backing store only holds
    // three of them: the fast path must not hand this array to bufferData.
    polyData.setPoints(
      vtkPoints.newInstance({
        values: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        size: 12,
        numberOfComponents: 3,
      })
    );
    const scene = makeScene(gc, polyData);
    scene.renderWindow.render();

    const points = polyData.getPoints();
    expect(points.getNumberOfPoints()).toBe(4);
    expect(points.getData().length).toBe(9);

    points.modified();
    const positionUploads = renderUploads(scene).filter(
      (data) => data instanceof Float32Array
    );
    expect(positionUploads).toHaveLength(1);
    expect(positionUploads[0]).not.toBe(points.getData());
    expect(positionUploads[0].length).toBe(12);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'uploads float scale and opacity arrays directly unless a table maps them',
  () => {
    const gc = testUtils.createGarbageCollector();
    const polyData = createPolyData(gc, [0, 0, 0, 1, 0, 0]);
    const scales = vtkDataArray.newInstance({
      name: 'scale',
      values: Float32Array.from([0.5, 1]),
    });
    const opacities = vtkDataArray.newInstance({
      name: 'opacity',
      values: Float32Array.from([0.25, 1]),
    });
    polyData.getPointData().addArray(scales);
    polyData.getPointData().addArray(opacities);

    const scene = makeScene(gc, polyData, {
      scaleArray: 'scale',
      opacityArray: 'opacity',
    });
    const direct = renderUploads(scene);
    expect(direct).toContain(scales.getData());
    expect(direct).toContain(opacities.getData());

    const scaleFunction = vtkPiecewiseFunction.newInstance();
    scaleFunction.addPoint(0, 0);
    scaleFunction.addPoint(1, 2);
    scene.mapper.setScaleFunction(scaleFunction);
    const radiusUploads = renderUploads(scene).filter(
      (data) => data instanceof Float32Array
    );
    expect(radiusUploads, 'only the radius buffer changes').toHaveLength(1);
    expect(radiusUploads[0]).not.toBe(scales.getData());
    expect(radiusUploads[0][0]).toBeCloseTo(1, 5);
    expect(radiusUploads[0][1]).toBeCloseTo(2, 5);

    gc.releaseResources();
  }
);
