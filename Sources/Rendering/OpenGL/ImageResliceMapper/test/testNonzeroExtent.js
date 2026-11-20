import { it, expect } from 'vitest';
import { mat3, quat, vec3 } from 'gl-matrix';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkImageResliceMapper from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';

const dimensions = [32, 32, 15];
const minimum = [9, -7, 3];
const imageSize = 64;

function readImage(view) {
  const gl = view.getContext();
  const pixels = new Uint8Array(imageSize * imageSize * 4);
  gl.readPixels(0, 0, imageSize, imageSize, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

for (const configuration of [
  {
    name: 'unit spacing',
    origin: [0, 0, 0],
    spacing: [1, 1, 1],
    direction: mat3.create(),
  },
  {
    name: 'rotation, signed spacing, and large world coordinates',
    origin: [1000000, -2000000, 3000000],
    spacing: [0.5, -1.5, 2],
    direction: mat3.fromQuat(
      mat3.create(),
      quat.fromEuler(quat.create(), 30, 20, 10)
    ),
  },
]) {
  it.skipIf(__VTK_TEST_NO_WEBGL__)(
    `renders equivalent nonzero extents without modifying input geometry (${configuration.name})`,
    () => {
      const gc = testUtils.createGarbageCollector();
      const reference = gc.registerResource(vtkImageData.newInstance());
      reference.setDimensions(dimensions);
      reference.setOrigin(configuration.origin);
      reference.setSpacing(configuration.spacing);
      reference.setDirection(configuration.direction);
      // A ramp in all three axes makes a misplaced texture sample visible,
      // even when the incorrect coordinates remain inside the texture.
      const scalars = gc.registerResource(
        vtkDataArray.newInstance({
          name: 'scalars',
          values: Uint8Array.from(
            { length: dimensions.reduce((product, size) => product * size, 1) },
            (_, index) => {
              const x = index % dimensions[0];
              const y = Math.floor(index / dimensions[0]) % dimensions[1];
              const z = Math.floor(index / (dimensions[0] * dimensions[1]));
              return x + y + 3 * z;
            }
          ),
        })
      );
      reference.getPointData().setScalars(scalars);

      const shifted = gc.registerResource(vtkImageData.newInstance());
      shifted.setExtent(
        minimum.flatMap((value, axis) => [value, value + dimensions[axis] - 1])
      );
      shifted.setSpacing(configuration.spacing);
      shifted.setDirection(configuration.direction);
      // These metadata describe exactly the same physical voxel positions.
      // Rendering either image must preserve its original indexing convention.
      shifted.setOrigin(reference.indexToWorld(minimum.map((value) => -value)));
      shifted.getPointData().setScalars(scalars);
      const originalExtent = [...shifted.getExtent()];
      const originalOrigin = [...shifted.getOrigin()];
      const originalSpacing = [...shifted.getSpacing()];
      const originalDirection = [...shifted.getDirection()];
      const originalValues = scalars.getData().slice();

      const centerIndex = dimensions.map((size) => (size - 1) / 2);
      const center = reference.indexToWorld(centerIndex);
      const alongY = [...centerIndex];
      alongY[1] += 1;
      const alongZ = [...centerIndex];
      alongZ[2] += 1;
      const up = vec3.subtract([], reference.indexToWorld(alongY), center);
      const normal = vec3.normalize(
        [],
        vec3.subtract([], reference.indexToWorld(alongZ), center)
      );
      const plane = gc.registerResource(vtkPlane.newInstance());
      plane.setOrigin(center);
      plane.setNormal(normal);
      const mapper = gc.registerResource(vtkImageResliceMapper.newInstance());
      mapper.setInputData(reference);
      mapper.setSlicePlane(plane);
      const actor = gc.registerResource(vtkImageSlice.newInstance());
      actor.setMapper(mapper);
      const color = gc.registerResource(vtkColorTransferFunction.newInstance());
      color.addRGBPoint(0, 0, 0, 0);
      color.addRGBPoint(255, 1, 1, 1);
      const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
      opacity.addPoint(0, 1);
      opacity.addPoint(255, 1);
      actor.getProperty().setRGBTransferFunction(0, color);
      actor.getProperty().setPiecewiseFunction(0, opacity);

      const { renderer, renderWindow, view } = createTrackedRenderView(gc);
      view.setSize(imageSize, imageSize);
      renderer.setBackground(0, 0, 1);
      renderer.addActor(actor);
      const camera = renderer.getActiveCamera();
      camera.setParallelProjection(true);
      camera.setFocalPoint(...center);
      camera.setPosition(...vec3.scaleAndAdd([], center, normal, 100));
      camera.setViewUp(up);
      // Crop inside the slice so edge rasterization does not affect comparison.
      camera.setParallelScale(
        0.4 * Math.min(...configuration.spacing.slice(0, 2).map(Math.abs)) * 31
      );
      camera.setClippingRange(1, 200);
      renderWindow.render();
      const referencePixels = readImage(view);
      // A nonuniform grayscale image proves that a slice was actually drawn.
      expect(referencePixels[0]).toBe(referencePixels[2]);
      let lowest = 255;
      let highest = 0;
      for (let offset = 0; offset < referencePixels.length; offset += 4) {
        lowest = Math.min(lowest, referencePixels[offset]);
        highest = Math.max(highest, referencePixels[offset]);
      }
      expect(highest - lowest).toBeGreaterThan(10);

      mapper.setInputData(shifted);
      renderWindow.render();
      const shiftedPixels = readImage(view);
      let maximumDifference = 0;
      for (let offset = 0; offset < referencePixels.length; offset++) {
        maximumDifference = Math.max(
          maximumDifference,
          Math.abs(referencePixels[offset] - shiftedPixels[offset])
        );
      }
      expect(maximumDifference).toBeLessThanOrEqual(2);
      expect(shifted.getExtent()).toEqual(originalExtent);
      expect(shifted.getOrigin()).toEqual(originalOrigin);
      expect(shifted.getSpacing()).toEqual(originalSpacing);
      expect(shifted.getDirection()).toEqual(originalDirection);
      expect(shifted.getPointData().getScalars()).toBe(scalars);
      expect(scalars.getData()).toEqual(originalValues);
      gc.releaseResources();
    }
  );
}
