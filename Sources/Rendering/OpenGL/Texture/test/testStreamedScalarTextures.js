import { describe, it, expect, vi, onTestFinished } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkImageResliceMapper from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderWindowInteractor from 'vtk.js/Sources/Rendering/Core/RenderWindowInteractor';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';

const size = 16;
const sliceExtent = (z) => [0, size - 1, 0, size - 1, z, z];
const wholeExtent = [0, size - 1, 0, size - 1, 0, size - 1];

// Spying on the prototype counts uploads through every context and proxy.
function trackRenders() {
  const [fullUploads, partialUploads] = ['texImage3D', 'texSubImage3D'].map(
    (method) => vi.spyOn(WebGL2RenderingContext.prototype, method)
  );
  onTestFinished(() => {
    fullUploads.mockRestore();
    partialUploads.mockRestore();
  });
  return async ({ renderWindow, view }) => {
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
}

function loadSlice(image, property, z, value) {
  const scalars = image.getPointData().getScalars();
  scalars.getData().fill(value, z * size ** 2, (z + 1) * size ** 2);
  scalars.dataChange();
  property.setUpdatedExtents([sliceExtent(z)]);
  image.modified();
}

function createVolume(gc, image, maxValue) {
  const mapper = gc.registerResource(vtkVolumeMapper.newInstance());
  mapper.setInputData(image);
  const actor = gc.registerResource(vtkVolume.newInstance());
  actor.setMapper(mapper);
  const color = gc.registerResource(vtkColorTransferFunction.newInstance());
  color.addRGBPoint(0, 0, 0, 0);
  color.addRGBPoint(maxValue, 1, 0.5, 0.3);
  const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
  opacity.addPoint(0, 0);
  opacity.addPoint(maxValue, 1);
  // Component 1 serves a duplicate input.
  [0, 1].forEach((component) => {
    actor.getProperty().setRGBTransferFunction(component, color);
    actor.getProperty().setScalarOpacity(component, opacity);
  });
  return { actor, recolor: () => color.addRGBPoint(maxValue / 2, 0, 1, 0) };
}

function createObliqueSlice(gc, image, maxValue) {
  const mapper = gc.registerResource(vtkImageResliceMapper.newInstance());
  mapper.setInputData(image);
  // The oblique plane intersects every z slice.
  mapper.setSlicePlane(
    gc.registerResource(
      vtkPlane.newInstance({
        origin: [size / 2, size / 2, size / 2],
        normal: [1, 1, 1],
      })
    )
  );
  const actor = gc.registerResource(vtkImageSlice.newInstance());
  actor.setMapper(mapper);
  const property = actor.getProperty();
  property.setColorWindow(maxValue);
  property.setColorLevel(maxValue / 2);
  return { actor, recolor: () => property.setColorWindow(maxValue / 2) };
}

describe.each([
  ['volume', createVolume],
  ['reslice', createObliqueSlice],
])('%s streaming', (name, createActor) => {
  it
    .skipIf(__VTK_TEST_NO_WEBGL__)
    .each([
      'first render',
      'resource release',
      'texture release',
      'scalar replacement',
      'duplicate input',
      ...(name === 'reslice' ? ['input removal'] : []),
    ])('streams scalar updates after %s', async (state) => {
    const gc = testUtils.createGarbageCollector();
    const scene = createTrackedRenderView(gc);
    const { renderer, renderWindow, view } = scene;
    const image = gc.registerResource(vtkImageData.newInstance());
    image.setDimensions(size, size, size);
    const scalars = gc.registerResource(
      vtkDataArray.newInstance({
        values: Float32Array.from(
          { length: size ** 3 },
          (_, i) => (i % size) / size
        ),
      })
    );
    image.getPointData().setScalars(scalars);
    const { actor, recolor } = createActor(gc, image, 1);
    const mapper = actor.getMapper();
    const property = actor.getProperty();
    renderer.addViewProp(actor);
    renderer.resetCamera();

    if (state === 'duplicate input') {
      mapper.addInputData(image);
      actor.setProperty(1, property);
    } else if (state !== 'first render') {
      renderWindow.render();
      if (state === 'resource release') {
        view.releaseGraphicsResources();
      } else if (state === 'texture release') {
        view
          .getGraphicsResourceForObject(scalars)
          .oglObject.releaseGraphicsResources(view);
      } else if (state === 'scalar replacement') {
        image
          .getPointData()
          .setScalars(
            gc.registerResource(
              vtkDataArray.newInstance({ values: scalars.getData().slice() })
            )
          );
      } else {
        mapper.setInputData(null);
        renderWindow.render();
        mapper.setInputData(image);
      }
    }

    const render = trackRenders();

    loadSlice(image, property, 3, 1);
    const first = await render(scene);
    expect(first.uploads).toEqual([wholeExtent]);
    expect(property.getUpdatedExtents()).toEqual([]);

    loadSlice(image, property, 5, 0);
    const streamed = await render(scene);
    expect(streamed.uploads).toEqual([sliceExtent(5)]);
    expect(property.getUpdatedExtents()).toEqual([]);
    expect(streamed.image).not.toBe(first.image);

    // A rebuild without pending extents keeps the patched texture.
    recolor();
    const recolored = await render(scene);
    expect(recolored.uploads).toEqual([]);
    expect(recolored.image).not.toBe(streamed.image);

    image.getPointData().getScalars().modified();
    image.modified();
    expect(await render(scene)).toEqual({
      image: recolored.image,
      uploads: [wholeExtent],
    });
  });
});

// Every view is a child of one root window that owns the context and the
// shared texture registry.
function createSharedContextViews(gc, count) {
  const rootRenderWindow = gc.registerResource(
    vtkRenderWindow.newInstance(),
    1
  );
  const rootView = gc.registerResource(vtkOpenGLRenderWindow.newInstance(), 2);
  rootRenderWindow.addView(rootView);
  rootView.initialize();

  return Array.from({ length: count }, () => {
    const renderWindow = gc.registerResource(vtkRenderWindow.newInstance(), 1);
    rootRenderWindow.addRenderWindow(renderWindow);
    const view = rootView.addMissingNode(renderWindow);
    renderWindow.addView(view);
    view.setContainer(testUtils.createRenderContainer(gc));
    view.setSize(200, 200);
    const renderer = gc.registerResource(vtkRenderer.newInstance(), 1);
    renderWindow.addRenderer(renderer);
    // The volume mapper asks the interactor whether the view is animating.
    const interactor = gc.registerResource(
      vtkRenderWindowInteractor.newInstance(),
      1
    );
    interactor.setView(view);
    interactor.initialize();
    return { renderWindow, renderer, view };
  });
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'streams into scalars that a volume and an oblique slice share across views',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const [volumeView, sliceView] = createSharedContextViews(gc, 2);
    const image = gc.registerResource(vtkImageData.newInstance());
    image.setDimensions(size, size, size);
    image
      .getPointData()
      .setScalars(
        gc.registerResource(
          vtkDataArray.newInstance({ values: new Int16Array(size ** 3) })
        )
      );
    const sliceValue = (z) => 100 * (z + 1);
    const maxValue = sliceValue(size - 1);

    const volume = createVolume(gc, image, maxValue).actor;
    volumeView.renderer.addVolume(volume);
    // Look across the slices so that each one shows.
    volumeView.renderer.getActiveCamera().azimuth(90);
    volumeView.renderer.resetCamera();
    sliceView.renderer.addActor(createObliqueSlice(gc, image, maxValue).actor);
    sliceView.renderer.resetCamera();

    const render = trackRenders();
    let volumeImage = await render(volumeView);
    let sliceImage = await render(sliceView);
    expect(volumeImage.uploads).toEqual([wholeExtent]);
    expect(sliceImage.uploads).toEqual([]);

    for (let z = 0; z < size; z++) {
      // Only the volume receives the extent. It renders first, so the slice
      // view can reuse the patched texture.
      loadSlice(image, volume.getProperty(), z, sliceValue(z));
      const streamedVolume = await render(volumeView);
      expect(streamedVolume.uploads).toEqual([sliceExtent(z)]);
      expect(streamedVolume.image).not.toBe(volumeImage.image);
      const streamedSlice = await render(sliceView);
      expect(streamedSlice.uploads).toEqual([]);
      expect(streamedSlice.image).not.toBe(sliceImage.image);
      volumeImage = streamedVolume;
      sliceImage = streamedSlice;
    }

    // A full upload of the final scalars draws the same images.
    image.getPointData().getScalars().modified();
    image.modified();
    expect(await render(volumeView)).toEqual({
      image: volumeImage.image,
      uploads: [wholeExtent],
    });
    expect(await render(sliceView)).toEqual({
      image: sliceImage.image,
      uploads: [],
    });
  }
);
