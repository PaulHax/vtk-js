import { it, expect, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import {
  DISC,
  capture,
  createPolyData,
  createScene,
  lookDownZ,
  rgbaAt,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

function changeColors(mapper, colors, first, values) {
  const fromMTime = colors.getMTime();
  colors.getData().set(values, first * 4);
  colors.modified();
  mapper.setPointAttributeUpdateRanges({
    colors: {
      source: colors,
      fromMTime,
      toMTime: colors.getMTime(),
      ranges: [[first, values.length / 4]],
    },
  });
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper uploads exact changed texture tuples across rows',
  async () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const poly = createPolyData(gc, [0, 0, 0]);
      const colors = gc.registerResource(
        vtkDataArray.newInstance({
          name: 'appearance',
          numberOfComponents: 4,
          values: new Float32Array([1, 0, 0, 1]),
        })
      );
      poly.getPointData().addArray(colors);
      const mapper = vtkPointGaussianMapper.newInstance({
        emissive: false,
        scaleFactor: 0.15,
        splatShaderCode: DISC,
        directColorArray: 'appearance',
        coordinateShiftAndScaleEnabled: false,
      });
      const scene = createScene(gc, mapper, poly, 60);
      lookDownZ(scene.renderer, 1.5);
      scene.renderWindow.render();
      const gl = scene.view.getContext();
      const width = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const count = width + 3;
      const positions = new Float32Array(count * 3);
      positions[0] = 10000;
      positions[(width - 1) * 3] = -0.5;
      positions[width * 3] = 0.5;
      poly.getPoints().setData(positions, 3);
      colors.setData(new Float32Array(count * 4), 4);
      for (let point = 0; point < count; point++) {
        colors.getData().set([1, 0, 0, 1], point * 4);
      }
      mapper.setPointOrder(
        gc.registerResource(
          vtkDataArray.newInstance({
            values: new Uint32Array([width - 1, width]),
          })
        )
      );
      expect(rgbaAt(await capture(scene), 20, 30)[0]).toBe(255);
      const uploads = vi.spyOn(gl, 'texSubImage2D');
      try {
        changeColors(mapper, colors, width - 1, [0, 1, 0, 1]);
        changeColors(mapper, colors, width, [0, 0, 1, 1]);
        const changed = await capture(scene);
        expect(rgbaAt(changed, 20, 30)[1]).toBe(255);
        expect(rgbaAt(changed, 40, 30)[2]).toBe(255);
        expect(uploads.mock.calls).toHaveLength(2);
        expect(uploads.mock.calls.map((call) => call.slice(2, 6))).toEqual([
          [width - 1, 0, 1, 1],
          [0, 1, 1, 1],
        ]);
        expect(uploads.mock.calls.map((call) => call.at(-1).length)).toEqual([
          4, 4,
        ]);

        uploads.mockClear();
        colors.getData().set([1, 1, 0, 1], (width - 1) * 4);
        colors.modified();
        expect(rgbaAt(await capture(scene), 20, 30)[0]).toBe(255);
        expect(
          uploads.mock.calls.reduce(
            (bytes, call) => bytes + call.at(-1).byteLength,
            0
          )
        ).toBe(colors.getData().byteLength);

        uploads.mockClear();
        for (let edit = 0; edit < 65; edit++) {
          changeColors(mapper, colors, width - 1, [0, 1, 0, 1]);
        }
        expect(rgbaAt(await capture(scene), 20, 30)[1]).toBe(255);
        expect(
          uploads.mock.calls.reduce(
            (bytes, call) => bytes + call.at(-1).byteLength,
            0
          )
        ).toBe(colors.getData().byteLength);

        uploads.mockClear();
        const points = poly.getPoints();
        const fromMTime = points.getMTime();
        points.getData()[(width - 1) * 3] = -0.75;
        points.modified();
        mapper.setPointAttributeUpdateRanges({
          positions: {
            source: points,
            fromMTime,
            toMTime: points.getMTime(),
            ranges: [[width - 1, 1]],
          },
        });
        const moved = await capture(scene);
        expect(rgbaAt(moved, 15, 30)[1]).toBe(255);
        expect(rgbaAt(moved, 20, 30)[1]).toBe(0);
        expect(uploads.mock.calls).toHaveLength(1);
        expect(uploads.mock.calls[0].at(-1).length).toBe(3);
      } finally {
        uploads.mockRestore();
      }
    } finally {
      gc.releaseResources();
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper restores full textures after release with recorded edits',
  async () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const poly = createPolyData(gc, [-0.5, 0, 0, 0.5, 0, 0]);
      const colors = gc.registerResource(
        vtkDataArray.newInstance({
          name: 'appearance',
          numberOfComponents: 4,
          values: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1]),
        })
      );
      poly.getPointData().addArray(colors);
      const mapper = vtkPointGaussianMapper.newInstance({
        emissive: false,
        scaleFactor: 0.15,
        splatShaderCode: DISC,
        directColorArray: 'appearance',
        pointOrder: gc.registerResource(
          vtkDataArray.newInstance({ values: new Uint32Array([0, 1]) })
        ),
      });
      const scene = createScene(gc, mapper, poly, 60);
      lookDownZ(scene.renderer, 1.5);
      await capture(scene);
      changeColors(mapper, colors, 0, [0, 1, 0, 1]);
      scene.view.releaseGraphicsResources();
      const image = await capture(scene);
      expect(rgbaAt(image, 20, 30)[1]).toBe(255);
      expect(rgbaAt(image, 40, 30)[0]).toBe(255);
    } finally {
      gc.releaseResources();
    }
  }
);
