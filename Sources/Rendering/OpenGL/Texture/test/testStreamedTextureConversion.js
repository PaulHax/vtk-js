import { describe, it, expect, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkImageResliceMapper from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';

const size = 16;
const wholeExtent = [0, size - 1, 0, size - 1, 0, size - 1];
// Types the texture converts to floats on the CPU, the 16 bit ones only
// without norm16.
const scalarTypes = [
  { ArrayType: Int8Array, range: [-128, 127] },
  { ArrayType: Int16Array, range: [-1024, 3071] },
  { ArrayType: Uint16Array, range: [0, 4095] },
  { ArrayType: Int32Array, range: [-33792, 31743] },
  { ArrayType: Uint32Array, range: [0, 2 ** 32 - 1] },
  { ArrayType: Float64Array, range: [-1024.25, 3071.75] },
];

// Values across the whole range, varying within each slice.
function fillSlice(values, z, [min, max]) {
  const sliceLength = size * size;
  for (let i = 0; i < sliceLength; i++) {
    values[z * sliceLength + i] =
      min + ((max - min) * ((i * 7 + z * 3) % 16)) / 15;
  }
}

describe.each([
  ['volume', vtkVolume, vtkVolumeMapper],
  ['reslice', vtkImageSlice, vtkImageResliceMapper],
])('%s streaming', (name, Actor, Mapper) => {
  it.skipIf(__VTK_TEST_NO_WEBGL__).each(scalarTypes)(
    'draws $ArrayType.name slices streamed one at a time like a full upload',
    async ({ ArrayType, range }) => {
      const gc = testUtils.createGarbageCollector();
      const { renderer, renderWindow, view } = createTrackedRenderView(gc);
      const gl = view.getContext();
      const image = gc.registerResource(vtkImageData.newInstance());
      image.setDimensions(size, size, size);
      const values = new ArrayType(size ** 3);
      const scalars = gc.registerResource(vtkDataArray.newInstance({ values }));
      // A range known up front, as a DICOM loader knows it, keeps the texture
      // format from changing while the slices arrive.
      scalars.setRange({ min: range[0], max: range[1] }, 0);
      image.getPointData().setScalars(scalars);
      const mapper = gc.registerResource(Mapper.newInstance());
      mapper.setInputData(image);
      const actor = gc.registerResource(Actor.newInstance());
      actor.setMapper(mapper);
      const property = actor.getProperty();
      const color = gc.registerResource(vtkColorTransferFunction.newInstance());
      color.addRGBPoint(range[0], 0, 0, 0);
      color.addRGBPoint(range[1], 1, 0.5, 0.25);
      const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
      opacity.addPoint(range[0], 0);
      opacity.addPoint(range[1], 0.5);
      property.setRGBTransferFunction(0, color);
      property.setScalarOpacity(0, opacity);
      if (name === 'reslice') {
        property.setUseLookupTableScalarRange(true);
        mapper.setSlicePlane(
          gc.registerResource(
            vtkPlane.newInstance({
              origin: [7.5, 7.5, 7.5],
              normal: [1, 1, 1],
            })
          )
        );
      }
      renderer.addViewProp(actor);
      renderer.resetCamera();

      const fullUploads = vi.spyOn(gl, 'texImage3D');
      const partialUploads = vi.spyOn(gl, 'texSubImage3D');
      const render = async (capture) => {
        fullUploads.mockClear();
        partialUploads.mockClear();
        const captured = capture && view.captureNextImage();
        renderWindow.render();
        expect(gl.getError()).toBe(gl.NO_ERROR);
        const uploads = [
          ...fullUploads.mock.calls.map((a) => [0, 0, 0, ...a.slice(3, 6)]),
          ...partialUploads.mock.calls.map((a) => a.slice(2, 8)),
        ].map(([x, y, z, w, h, d]) => [
          x,
          x + w - 1,
          y,
          y + h - 1,
          z,
          z + d - 1,
        ]);
        return { image: await captured, uploads };
      };

      // The first render allocates the texture for an empty volume. Each
      // later one patches in the slice that arrived since the last.
      const empty = await render(true);
      let streamed = empty;
      for (let z = 0; z < size; z++) {
        fillSlice(values, z, range);
        scalars.modified();
        const slice = [0, size - 1, 0, size - 1, z, z];
        property.setUpdatedExtents([slice]);
        streamed = await render(z === size - 1);
        expect(streamed.uploads).toEqual([slice]);
      }
      expect(streamed.image).not.toBe(empty.image);

      scalars.modified();
      expect(await render(true)).toEqual({
        image: streamed.image,
        uploads: [wholeExtent],
      });
    }
  );
});
