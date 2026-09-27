import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkPointSet from 'vtk.js/Sources/Common/DataModel/PointSet';
import {
  DISC,
  capture,
  countLitAlong,
  countLitPixels,
  createPointSelector,
  createPolyData,
  createScene,
  lookDownZ,
  rgbaAt,
} from './pointGaussianTestUtils';

it('vtkPointGaussianMapper has the VTK defaults', () => {
  const mapper = vtkPointGaussianMapper.newInstance();
  expect(mapper.getScaleArray()).toBe(null);
  expect(mapper.getScaleArrayComponent()).toBe(0);
  expect(mapper.getScaleFunction()).toBe(null);
  expect(mapper.getScaleTableSize()).toBe(1024);
  expect(mapper.getOpacityArray()).toBe(null);
  expect(mapper.getOpacityArrayComponent()).toBe(0);
  expect(mapper.getScalarOpacityFunction()).toBe(null);
  expect(mapper.getOpacityTableSize()).toBe(1024);
  expect(mapper.getScaleFactor()).toBe(1.0);
  expect(mapper.getSplatShaderCode()).toBe(null);
  expect(mapper.getEmissive()).toBe(true);
  expect(mapper.getBoundScale()).toBe(3.0);
  expect(mapper.getAnisotropic()).toBe(false);
  expect(mapper.getRotationArray()).toBe(null);
  expect(mapper.getLowpassMatrix()).toEqual([0, 0, 0]);

  const other = vtkPointGaussianMapper.newInstance();
  mapper.getLowpassMatrixByReference()[0] = 1;
  expect(other.getLowpassMatrix()).toEqual([0, 0, 0]);
  mapper.delete();
  other.delete();
});

it('vtkPointGaussianMapper reports translucency from emissive, splat shape and opacities', () => {
  const gc = testUtils.createGarbageCollector();
  const polyData = createPolyData(gc, [0, 0, 0, 1, 0, 0]);
  const opacities = vtkDataArray.newInstance({
    name: 'opacity',
    values: Float32Array.from([0.25, 1]),
  });
  polyData.getPointData().addArray(opacities);
  const mapper = gc.registerResource(
    vtkPointGaussianMapper.newInstance({ opacityArray: 'opacity' })
  );
  mapper.setInputData(polyData);

  expect(mapper.getIsOpaque(), 'emissive').toBe(true);
  mapper.setEmissive(false);
  expect(mapper.getIsOpaque(), 'Gaussian splats fade out').toBe(false);
  mapper.setSplatShaderCode(DISC);
  expect(mapper.getIsOpaque(), 'opacity array below one').toBe(false);

  opacities.setData(Float32Array.from([1, 1]));
  expect(mapper.getIsOpaque(), 'opacity array at one').toBe(true);
  mapper.setSplatShaderCode(null);
  mapper.setScaleFactor(0);
  expect(mapper.getIsOpaque(), 'simple points').toBe(true);

  const opacityFunction = vtkPiecewiseFunction.newInstance();
  opacityFunction.addPoint(0, 1);
  opacityFunction.addPoint(1, 0.5);
  mapper.setScalarOpacityFunction(opacityFunction);
  expect(mapper.getIsOpaque(), 'opacity function below one').toBe(false);

  opacities.setData(Float32Array.from([0, 0]));
  expect(
    mapper.getIsOpaque(),
    'the data only reaches the opaque part of the function'
  ).toBe(true);

  mapper.setOpacityArray('missing');
  expect(mapper.getIsOpaque(), 'no such array').toBe(true);

  gc.releaseResources();
});

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper sizes splats through the scale function, clamped to its range',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const polyData = createPolyData(gc, [0, 0, 0]);
    const scales = vtkDataArray.newInstance({
      name: 'scale',
      values: Float32Array.of(0),
    });
    polyData.getPointData().addArray(scales);
    const scaleFunction = vtkPiecewiseFunction.newInstance();
    scaleFunction.addPoint(0, 1);
    scaleFunction.addPoint(1, 4);
    // A linear function needs two samples; a fractional count rounds down.
    const scene = createScene(
      gc,
      vtkPointGaussianMapper.newInstance({
        emissive: false,
        splatShaderCode: DISC,
        scaleArray: 'scale',
        scaleFunction,
        scaleTableSize: 2.5,
      }),
      polyData,
      50
    );
    // 5 px per unit: a disc of radius r units is 10 r px wide.
    lookDownZ(scene.renderer, 5);
    const discWidth = async (scale) => {
      scales.setData(Float32Array.of(scale));
      return countLitAlong(await capture(scene), { row: 25 });
    };

    expect(await discWidth(0.5)).toBeCloseTo(25, -1);
    expect(await discWidth(-0.25), 'clamped below').toBeCloseTo(10, -1);
    expect(await discWidth(7), 'clamped above').toBeCloseTo(40, -1);

    // The function edited in place, the data unchanged.
    scaleFunction.removeAllPoints();
    scaleFunction.addPoint(2, 2);
    expect(
      countLitAlong(await capture(scene), { row: 25 }),
      'a single-point function'
    ).toBeCloseTo(20, -1);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper draws every point of the input without cells',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = createScene(
      gc,
      vtkPointGaussianMapper.newInstance({ scaleFactor: 0 }),
      createPolyData(
        gc,
        [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, 0, 0, 1]
      ),
      50
    );
    scene.actor.getProperty().setPointSize(4);
    lookDownZ(scene.renderer, 1);
    const [node] = await createPointSelector(scene).selectAsync(
      scene.renderer,
      0,
      0,
      49,
      49
    );
    expect([...node.getSelectionList()].sort()).toEqual([0, 1, 2, 3, 4]);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper draws the points of a point set',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const pointSet = gc.registerResource(vtkPointSet.newInstance());
    pointSet.getPoints().setData(Float32Array.of(0, 0, 0), 3);
    const scene = createScene(
      gc,
      vtkPointGaussianMapper.newInstance({ scaleFactor: 0 }),
      pointSet,
      20
    );
    scene.actor.getProperty().setPointSize(4);
    lookDownZ(scene.renderer, 1);
    expect(countLitPixels(await capture(scene))).toBe(16);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper refuses custom shader attributes and keeps drawing',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const polyData = createPolyData(gc, [0, 0, 0]);
    polyData
      .getPointData()
      .addArray(
        vtkDataArray.newInstance({ name: 'a', values: Float32Array.of(1) })
      );
    const scene = createScene(
      gc,
      vtkPointGaussianMapper.newInstance({
        scaleFactor: 0,
        customShaderAttributes: ['a'],
      }),
      polyData,
      20
    );
    scene.actor.getProperty().setPointSize(4);
    lookDownZ(scene.renderer, 1);
    expect(scene.mapper.setCustomShaderAttributes(['a'])).toBe(false);
    expect(countLitPixels(await capture(scene))).toBe(16);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper renders full-range direct RGB above 127',
  async () => {
    const gc = testUtils.createGarbageCollector();
    // Colours above the signed-byte midpoint would wrap dark if the colour
    // path ever read Uint8 as Int8.
    const scene = createScene(
      gc,
      vtkPointGaussianMapper.newInstance({ scaleFactor: 0, emissive: false }),
      createPolyData(gc, [0, 0, 0], [10, 200, 250]),
      50
    );
    scene.actor.getProperty().setPointSize(40);
    lookDownZ(scene.renderer, 1);
    const [red, green, blue] = rgbaAt(await capture(scene), 25, 25);
    expect(red).toBeLessThan(90);
    expect(green).toBeGreaterThan(150);
    expect(blue).toBeGreaterThan(150);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper colours each point even when scalars would interpolate',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const polyData = createPolyData(gc, [0, 0, 0]);
    polyData
      .getPointData()
      .setScalars(
        vtkDataArray.newInstance({ name: 's', values: Float32Array.of(1) })
      );
    const lookupTable = gc.registerResource(
      vtkColorTransferFunction.newInstance()
    );
    lookupTable.addRGBPoint(0, 0, 0, 1);
    lookupTable.addRGBPoint(1, 0, 1, 0);
    const mapper = vtkPointGaussianMapper.newInstance({
      scaleFactor: 0,
      emissive: false,
    });
    const scene = createScene(gc, mapper, polyData, 50);
    mapper.setColorModeToDefault();
    mapper.setLookupTable(lookupTable);
    mapper.setInterpolateScalarsBeforeMapping(true);
    scene.actor.getProperty().setPointSize(20);
    lookDownZ(scene.renderer, 1);
    const [red, green] = rgbaAt(await capture(scene), 25, 25);
    expect(green, 'the mapped colour, not the white actor').toBe(255);
    expect(red).toBe(0);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper colours points from cell scalars only through the verts cells that draw them',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const polyData = createPolyData(gc, [-1, 0, 0, 1, 0, 0]);
    polyData.getLines().setData(Uint16Array.from([2, 0, 1]));
    const cellColors = vtkDataArray.newInstance({
      numberOfComponents: 3,
      values: Uint8Array.from([255, 0, 0]),
    });
    polyData.getCellData().setScalars(cellColors);
    const scene = createScene(
      gc,
      vtkPointGaussianMapper.newInstance({ scaleFactor: 0, emissive: false }),
      polyData,
      40
    );
    scene.mapper.setScalarModeToUseCellData();
    scene.actor.getProperty().setColor(0, 0, 1);
    scene.actor.getProperty().setPointSize(10);
    // 10 px per unit: points 0 and 1 land on columns 10 and 30.
    lookDownZ(scene.renderer, 2);
    const colourAt = async (column) =>
      rgbaAt(await capture(scene), column, 20).slice(0, 3);

    expect(
      await colourAt(10),
      'a line colour belongs to no single point'
    ).toEqual([0, 0, 255]);

    // Two verts cells draw points 1 and 0, in that order.
    polyData.getLines().setData(new Uint16Array(0));
    polyData.getVerts().setData(Uint16Array.from([1, 1, 1, 0]));
    cellColors.setData(Uint8Array.from([255, 0, 0, 0, 255, 0]), 3);
    expect(await colourAt(10)).toEqual([0, 255, 0]);
    expect(await colourAt(30)).toEqual([255, 0, 0]);

    gc.releaseResources();
  }
);
