import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import 'vtk.js/Sources/Rendering/Profiles/Volume';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkRenderWindowInteractor from 'vtk.js/Sources/Rendering/Core/RenderWindowInteractor';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import {
  DISC,
  capture,
  createPolyData,
  createScene,
  lookDownZ,
  rgbaAt,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

const RED = [80, 0, 0];
const GREEN = [0, 80, 0];

// Points, given as [position, colour] pairs in drawing order, seen from +z
// in a 40 px view.
function makeScene(gc, points, initialValues) {
  const scene = createScene(
    gc,
    vtkPointGaussianMapper.newInstance(initialValues),
    createPolyData(
      gc,
      points.flatMap(([position]) => position),
      points.flatMap(([, colour]) => colour)
    ),
    40
  );
  scene.actor.getProperty().setPointSize(10);
  lookDownZ(scene.renderer);
  return scene;
}

// The RGB at the centre of the view.
async function renderCentre(points, initialValues) {
  const gc = testUtils.createGarbageCollector();
  const image = await capture(makeScene(gc, points, initialValues));
  gc.releaseResources();
  return rgbaAt(image, 20, 20).slice(0, 3);
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper emissive points add up and do not occlude',
  async () => {
    for (const scaleFactor of [0, 0.5]) {
      const initialValues = { scaleFactor, emissive: true };
      const [single] = await renderCentre([[[0, 0, 0], RED]], initialValues);
      const [stacked] = await renderCentre(
        [
          [[0, 0, 1], RED],
          [[0, 0, 0], RED],
        ],
        initialValues
      );
      expect(single, `one point, scaleFactor ${scaleFactor}`).toBeCloseTo(
        RED[0],
        -1
      );
      expect(stacked, 'the nearer point adds to the other').toBeCloseTo(
        2 * single,
        -1
      );
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper opaque points and hard-edged splats hide what is behind them',
  async () => {
    for (const initialValues of [
      { scaleFactor: 0 },
      { scaleFactor: 0.5, splatShaderCode: DISC },
    ]) {
      const [red, green] = await renderCentre(
        [
          [[0, 0, 1], RED],
          [[0, 0, 0], GREEN],
        ],
        { ...initialValues, emissive: false }
      );
      expect(red, `scaleFactor ${initialValues.scaleFactor}`).toBeCloseTo(
        RED[0],
        -1
      );
      expect(green, 'the nearer point, drawn first, hides the other').toBe(0);
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper opacity array replaces the alpha of translucent colours',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(
      gc,
      [
        [
          [0, 0, 1],
          [...RED, 128],
        ],
        [
          [0, 0, 0],
          [...GREEN, 128],
        ],
      ],
      { scaleFactor: 0, emissive: false, opacityArray: 'opacity' }
    );
    scene.polyData.getPointData().addArray(
      vtkDataArray.newInstance({
        name: 'opacity',
        values: Float32Array.of(1, 1),
      })
    );
    const [red, green] = rgbaAt(await capture(scene), 20, 20);
    expect(red).toBeCloseTo(RED[0], -1);
    expect(green, 'opaque, the nearer point hides the other').toBe(0);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper shows splats through the faded edge of nearer ones',
  async () => {
    // The nearer splat, drawn first, covers the centre two deviations from
    // its own centre, where it is nearly transparent.
    const [red, green] = await renderCentre(
      [
        [[-1, 0, 1], RED],
        [[0, 0, 0], GREEN],
      ],
      { scaleFactor: 0.5, emissive: false }
    );
    expect(green).toBeGreaterThan(0.75 * GREEN[1]);
    expect(red).toBeLessThan(0.25 * RED[0]);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper emissive splats keep their colour as they fade over a transparent background',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc, [[[0, 0, 0], RED]], {
      scaleFactor: 0.5,
      emissive: true,
    });
    scene.renderer.setBackground(0, 0, 0, 0);
    // About one and a half deviations from the centre, the coverage, in
    // alpha, is what scales the colour.
    const [red, , , alpha] = rgbaAt(await capture(scene), 26, 20);
    expect(alpha).toBeGreaterThan(20);
    expect(alpha).toBeLessThan(128);
    expect(red, 'the colour without the coverage').toBeCloseTo(RED[0], -1);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper emissive splats let volumes behind them show',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc, [[[0, 0, 0], RED]], {
      scaleFactor: 1,
      emissive: true,
    });

    // A green slab behind the splat, filling the view.
    const image = gc.registerResource(vtkImageData.newInstance());
    image.setDimensions(2, 2, 2);
    image.setSpacing(8, 8, 2);
    image.setOrigin(-4, -4, -3);
    image
      .getPointData()
      .setScalars(
        vtkDataArray.newInstance({ values: new Float32Array(8).fill(1) })
      );
    const volumeMapper = gc.registerResource(vtkVolumeMapper.newInstance());
    volumeMapper.setInputData(image);
    const volume = gc.registerResource(vtkVolume.newInstance());
    volume.setMapper(volumeMapper);
    const colour = gc.registerResource(vtkColorTransferFunction.newInstance());
    colour.addRGBPoint(0, 0, 1, 0);
    colour.addRGBPoint(2, 0, 1, 0);
    const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
    opacity.addPoint(0, 0.5);
    opacity.addPoint(2, 0.5);
    volume.getProperty().setRGBTransferFunction(0, colour);
    volume.getProperty().setScalarOpacity(0, opacity);
    scene.renderer.addVolume(volume);
    // The volume mapper reads the interaction state.
    const interactor = gc.registerResource(
      vtkRenderWindowInteractor.newInstance()
    );
    interactor.setView(scene.view);
    interactor.initialize();

    // A corner of the view is inside the splat's quad but more than three
    // deviations from its centre.
    const [, green] = rgbaAt(await capture(scene), 2, 2);
    expect(green).toBeGreaterThan(100);
    gc.releaseResources();
  }
);
