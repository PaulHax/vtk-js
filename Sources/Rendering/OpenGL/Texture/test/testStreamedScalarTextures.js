import { describe, it, expect, vi, afterEach } from 'vitest';
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
const sliceExtent = (z) => [0, size - 1, 0, size - 1, z, z];
const wholeExtent = [0, size - 1, 0, size - 1, 0, size - 1];

describe.each([
  ['volume', vtkVolume, vtkVolumeMapper],
  ['reslice', vtkImageSlice, vtkImageResliceMapper],
])('%s streaming', (name, Actor, Mapper) => {
  afterEach(() => vi.restoreAllMocks());

  it
    .skipIf(__VTK_TEST_NO_WEBGL__)
    .each([
      'first render',
      'resource release',
      'texture release',
      'scalar replacement',
      ...(name === 'reslice' ? ['input removal'] : []),
    ])('uploads the full image with pending extents: %s', async (state) => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view } = createTrackedRenderView(gc);
    const image = gc.registerResource(vtkImageData.newInstance());
    image.setDimensions(size, size, size);
    let scalars = gc.registerResource(
      vtkDataArray.newInstance({
        values: Float32Array.from(
          { length: size ** 3 },
          (_, i) => (i % size) / size
        ),
      })
    );
    image.getPointData().setScalars(scalars);
    const mapper = gc.registerResource(Mapper.newInstance());
    mapper.setInputData(image);
    const actor = gc.registerResource(Actor.newInstance());
    actor.setMapper(mapper);
    const property = actor.getProperty();

    if (name === 'reslice') {
      // The oblique plane intersects every streamed z slice.
      mapper.setSlicePlane(
        gc.registerResource(
          vtkPlane.newInstance({
            origin: [size / 2, size / 2, size / 2],
            normal: [1, 1, 1],
          })
        )
      );
      property.setColorWindow(1);
      property.setColorLevel(0.5);
    } else {
      const color = gc.registerResource(vtkColorTransferFunction.newInstance());
      color.addRGBPoint(0, 0, 0, 0);
      color.addRGBPoint(1, 1, 0.5, 0.3);
      const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
      opacity.addPoint(0, 0);
      opacity.addPoint(1, 1);
      property.setRGBTransferFunction(0, color);
      property.setScalarOpacity(0, opacity);
    }
    renderer.addViewProp(actor);
    renderer.resetCamera();

    if (state !== 'first render') {
      renderWindow.render();
      if (state === 'resource release') {
        view.releaseGraphicsResources();
      } else if (state === 'texture release') {
        view
          .getGraphicsResourceForObject(scalars)
          .oglObject.releaseGraphicsResources(view);
      } else if (state === 'scalar replacement') {
        scalars = gc.registerResource(
          vtkDataArray.newInstance({ values: scalars.getData().slice() })
        );
        image.getPointData().setScalars(scalars);
      } else {
        mapper.setInputData(null);
        renderWindow.render();
        mapper.setInputData(image);
      }
    }

    const fullUploads = vi.spyOn(view.getContext(), 'texImage3D');
    const partialUploads = vi.spyOn(view.getContext(), 'texSubImage3D');
    const render = async () => {
      fullUploads.mockClear();
      partialUploads.mockClear();
      const captured = view.captureNextImage();
      renderWindow.render();
      expect(view.getContext().getError()).toBe(0);
      const uploads = [
        ...fullUploads.mock.calls.map((args) => [0, 0, 0, ...args.slice(3, 6)]),
        ...partialUploads.mock.calls.map((args) => args.slice(2, 8)),
      ].map(([x, y, z, width, height, depth]) => [
        x,
        x + width - 1,
        y,
        y + height - 1,
        z,
        z + depth - 1,
      ]);
      return { image: await captured, uploads };
    };
    const loadSlice = (z, value) => {
      scalars.getData().fill(value, z * size ** 2, (z + 1) * size ** 2);
      scalars.dataChange();
      property.setUpdatedExtents([sliceExtent(z)]);
      image.modified();
    };

    loadSlice(3, 1);
    const first = await render();
    expect(first.uploads).toEqual([wholeExtent]);
    expect(property.getUpdatedExtents()).toEqual([]);

    loadSlice(5, 0);
    const streamed = await render();
    expect(streamed.uploads).toEqual([sliceExtent(5)]);
    expect(property.getUpdatedExtents()).toEqual([]);
    expect(streamed.image).not.toBe(first.image);

    scalars.modified();
    image.modified();
    expect(await render()).toEqual({
      image: streamed.image,
      uploads: [wholeExtent],
    });
  });
});
