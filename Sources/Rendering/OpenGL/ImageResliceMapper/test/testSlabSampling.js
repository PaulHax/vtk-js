import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkImageResliceMapper from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper';
import { SlabTypes } from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper/Constants';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';

// Each XY plane has a constant value, so the center pixel measures only the
// depth sampling. Uint8 data and a [0,255] grayscale table make the framebuffer
// channels directly comparable to scalar values, including these small sums.
function createSlabScene(
  gc,
  values,
  {
    spacing = [1, 1, 1],
    center = (values.length - 1) / 2,
    normal = [0, 0, 1],
    width = 16,
  } = {}
) {
  const image = gc.registerResource(vtkImageData.newInstance());
  image.setDimensions(width, width, values.length);
  image.setSpacing(spacing);
  image.getPointData().setScalars(
    gc.registerResource(
      vtkDataArray.newInstance({
        name: 'scalars',
        values: Uint8Array.from(
          { length: width * width * values.length },
          (_, index) => values[Math.floor(index / (width * width))]
        ),
      })
    )
  );

  const plane = gc.registerResource(vtkPlane.newInstance());
  const midpoint = (width - 1) / 2;
  const origin = image.indexToWorld([midpoint, midpoint, center]);
  plane.setOrigin(origin);
  plane.setNormal(normal);
  const mapper = gc.registerResource(vtkImageResliceMapper.newInstance());
  mapper.setInputData(image);
  mapper.setSlicePlane(plane);

  const color = gc.registerResource(vtkColorTransferFunction.newInstance());
  color.addRGBPoint(0, 0, 0, 0);
  color.addRGBPoint(255, 1, 1, 1);
  const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
  opacity.addPoint(0, 1);
  opacity.addPoint(255, 1);
  const actor = gc.registerResource(vtkImageSlice.newInstance());
  actor.setMapper(mapper);
  const property = actor.getProperty();
  property.setInterpolationTypeToLinear();
  property.setColorWindow(255);
  property.setColorLevel(127.5);
  property.setRGBTransferFunction(0, color);
  property.setPiecewiseFunction(0, opacity);

  const { renderer, renderWindow, view } = createTrackedRenderView(gc);
  // An odd viewport puts pixel (32,32) on the exact central physical ray,
  // including when an oblique camera is rolled.
  view.setSize(65, 65);
  renderer.setBackground(0, 0, 1);
  renderer.addActor(actor);
  const camera = renderer.getActiveCamera();
  camera.setParallelProjection(true);
  camera.setFocalPoint(...origin);
  camera.setPosition(
    ...origin.map((value, axis) => value + 100 * normal[axis])
  );
  camera.setViewUp(0, 1, 0);
  camera.setParallelScale(8 * Math.abs(spacing[1]));
  renderer.resetCameraClippingRange();

  return {
    roll: (degrees) => camera.roll(degrees),
    expectProjection(type, thickness, expected, trapezoid = 0) {
      mapper.setSlabType(type);
      mapper.setSlabThickness(thickness);
      mapper.setSlabTrapezoidIntegration(trapezoid);
      renderWindow.render();
      const gl = view.getContext();
      const pixel = new Uint8Array(4);
      gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      for (let channel = 0; channel < 3; channel++) {
        expect(
          Math.abs(pixel[channel] - expected),
          `slab type ${type}, thickness ${thickness}, RGBA ${pixel}`
        ).toBeLessThanOrEqual(2);
      }
      expect(pixel[3]).toBe(255);
    },
  };
}

const slabTypes = [SlabTypes.MIN, SlabTypes.MAX, SlabTypes.MEAN, SlabTypes.SUM];

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'samples the selected slab without including bright neighboring slices',
  () => {
    const gc = testUtils.createGarbageCollector();
    // The selected range is [5,9]. Samples outside it would interpolate the
    // bright slices at indices 4 and 10 into every result except MIN.
    const scene = createSlabScene(
      gc,
      [0, 10, 10, 10, 110, 10, 10, 10, 10, 10, 110, 10, 10, 10, 0]
    );
    const expected = [10, 10, 10, 90];
    slabTypes.forEach((type, index) =>
      scene.expectProjection(type, 4, expected[index])
    );
    // SUM retains sample-sum units; trapezoid integration halves the two ends.
    scene.expectProjection(SlabTypes.SUM, 4, 80, 1);
    gc.releaseResources();
  }
);

for (const { thickness, expected, trapezoidExpected } of [
  {
    thickness: 0,
    expected: [40, 40, 40, 40],
    trapezoidExpected: [40, 40, 40, 40],
  },
  // A half-unit slab includes the center (40) and endpoints at +/-0.25 (30).
  {
    thickness: 0.5,
    expected: [30, 40, 100 / 3, 100],
    trapezoidExpected: [30, 40, 35, 70],
  },
  // Uniform intervals put the interior samples at +/-0.3 (28), with endpoints
  // at +/-0.6 (16). The trapezoidal MEAN equals the linear-profile average, 28.
  {
    thickness: 1.2,
    expected: [16, 40, 128 / 5, 128],
    trapezoidExpected: [16, 40, 28, 112],
  },
]) {
  it.skipIf(__VTK_TEST_NO_WEBGL__)(
    `includes the center and endpoints of a slab with thickness ${thickness}`,
    () => {
      const gc = testUtils.createGarbageCollector();
      const values = Array.from({ length: 15 }, (_, index) =>
        index === 7 ? 40 : 0
      );
      const scene = createSlabScene(gc, values);
      slabTypes.forEach((type, index) => {
        scene.expectProjection(type, thickness, expected[index]);
        scene.expectProjection(type, thickness, trapezoidExpected[index], 1);
      });
      gc.releaseResources();
    }
  );
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'uses spacing magnitudes when selecting the slab sample distance',
  () => {
    const gc = testUtils.createGarbageCollector();
    // The smallest magnitude is 1, although the most negative component is -2.
    const scene = createSlabScene(gc, Array(15).fill(10), {
      spacing: [-2, 1, 1],
    });
    scene.expectProjection(SlabTypes.MEAN, 4, 10);
    scene.expectProjection(SlabTypes.SUM, 4, 90);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'preserves uniform intensity with trapezoid integration, including clipped slabs',
  () => {
    const gc = testUtils.createGarbageCollector();
    for (const { depth, center, thicknesses } of [
      { depth: 15, center: 7, thicknesses: [0, 0.5, 1, 1.2, 4] },
      { depth: 4, center: 0.25, thicknesses: [4, 100] },
    ]) {
      const scene = createSlabScene(gc, Array(depth).fill(90), { center });
      thicknesses.forEach((thickness) =>
        scene.expectProjection(SlabTypes.MEAN, thickness, 90, 1)
      );
    }
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'keeps stepping independently of rejected samples near a volume edge',
  () => {
    const gc = testUtils.createGarbageCollector();
    const scene = createSlabScene(gc, Array(4).fill(10), { center: 0.25 });
    // Center and -0.5 are valid, followed by four valid positive offsets.
    scene.expectProjection(SlabTypes.SUM, 4, 60);
    scene.expectProjection(SlabTypes.MEAN, 4, 10);
    // Weight the first/last accepted samples, even when an end is clipped.
    scene.expectProjection(SlabTypes.SUM, 4, 50, 1);
    // A much larger slab has eight samples inside the image's half-voxel box.
    scene.expectProjection(SlabTypes.SUM, 100, 80);
    scene.expectProjection(SlabTypes.MEAN, 100, 10);
    scene.expectProjection(SlabTypes.SUM, 100, 70, 1);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'does not duplicate endpoints when slab thickness and spacing round differently',
  () => {
    const gc = testUtils.createGarbageCollector();
    const scene = createSlabScene(gc, Array(21).fill(10), {
      spacing: [1, 1, 0.01],
    });
    // Ten intervals on either side of the center give 21 samples. In Float32,
    // 10 * (0.01 / 2) is slightly less than 0.1 / 2; this is still the endpoint.
    scene.expectProjection(SlabTypes.SUM, 0.1, 210);
    scene.expectProjection(SlabTypes.SUM, 0.1, 200, 1);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'keeps anisotropic oblique sampling independent of camera roll',
  () => {
    const gc = testUtils.createGarbageCollector();
    const scene = createSlabScene(
      gc,
      Array.from({ length: 15 }, (_, z) => (z === 6 || z === 8 ? 100 : 0)),
      {
        width: 32,
        spacing: [0.1, 5, 1],
        normal: [Math.SQRT1_2, 0, Math.SQRT1_2],
      }
    );
    // The +/-1.4 world-unit samples nearly hit the two bright slices. Rolling
    // changes neither the central ray nor the physical sampling positions.
    scene.expectProjection(SlabTypes.MAX, 4, 99);
    scene.roll(90);
    scene.expectProjection(SlabTypes.MAX, 4, 99);
    gc.releaseResources();
  }
);
