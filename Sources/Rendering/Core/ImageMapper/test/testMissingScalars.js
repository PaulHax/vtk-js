import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import vtkRenderWindowInteractor from 'vtk.js/Sources/Rendering/Core/RenderWindowInteractor';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';
import vtkImageMapper from 'vtk.js/Sources/Rendering/Core/ImageMapper';
import vtkImageResliceMapper from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';

const webGPU = __VTK_TEST_WEBGPU__;

async function createScene(gc) {
  const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
  const renderer = gc.registerResource(vtkRenderer.newInstance());
  renderWindow.addRenderer(renderer);
  const view = gc.registerResource(
    renderWindow.newAPISpecificView(webGPU ? 'WebGPU' : 'WebGL')
  );
  view.setContainer(testUtils.createRenderContainer(gc));
  view.setSize(128, 128);
  renderWindow.addView(view);
  await view.initialize();
  if (!webGPU) {
    const interactor = gc.registerResource(
      vtkRenderWindowInteractor.newInstance()
    );
    interactor.setView(view);
    renderWindow.setInteractor(interactor);
    interactor.initialize();
  }
  return { renderer, renderWindow, view };
}

function createProp(gc, kind, images) {
  const Mapper = {
    image: vtkImageMapper,
    reslice: vtkImageResliceMapper,
    volume: vtkVolumeMapper,
  }[kind];
  const mapper = gc.registerResource(Mapper.newInstance());
  images.forEach((image) => mapper.addInputData(image));
  if (kind === 'image') mapper.setKSlice(4);
  if (kind === 'reslice') {
    mapper.setSlicePlane(
      gc.registerResource(
        vtkPlane.newInstance({
          origin: [4, 4, 4],
          normal: [0, 0, 1],
        })
      )
    );
  }
  const prop = gc.registerResource(
    (kind === 'volume' ? vtkVolume : vtkImageSlice).newInstance()
  );
  prop.setMapper(mapper);
  // Create the per-input properties before rendering multiple inputs.
  const color = gc.registerResource(vtkColorTransferFunction.newInstance());
  color.addRGBPoint(0, 0, 0, 1);
  color.addRGBPoint(255, 1, 0.5, 0);
  const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
  opacity.addPoint(0, 0.2);
  opacity.addPoint(255, 1);
  images.forEach((_, index) => {
    const property = prop.getProperty(index);
    if (kind === 'volume') {
      [0, 1].forEach((component) => {
        property.setRGBTransferFunction(component, color);
        property.setScalarOpacity(component, opacity);
      });
    }
  });
  return prop;
}

it
  .skipIf(__VTK_TEST_NO_WEBGL__ && !webGPU)
  .each(webGPU ? ['image', 'reslice'] : ['image', 'reslice', 'volume'])(
  '%s draws nothing without scalars and resumes when scalars return',
  async (kind) => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view } = await createScene(gc);
    const capture = () => {
      const image = view.captureNextImage();
      renderWindow.render();
      return image;
    };
    const empty = await capture();
    const image = gc.registerResource(
      testUtils.createImage([8, 8, 8], [1, 1, 1])
    );
    const scalars = image.getPointData().getScalars();
    image.getPointData().setScalars(null);
    renderer.addViewProp(createProp(gc, kind, [image]));
    renderer.resetCamera();
    expect(await capture()).toBe(empty);
    image.getPointData().setScalars(scalars);
    expect(await capture()).not.toBe(empty);
    image.getPointData().setScalars(null);
    expect(await capture()).toBe(empty);
    image.getPointData().setScalars(scalars);
    expect(await capture()).not.toBe(empty);
    if (!webGPU) expect(view.getContext().getError()).toBe(0);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__ || webGPU).each(['reslice', 'volume'])(
  '%s keeps drawing valid inputs when another input loses its scalars',
  async (kind) => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view } = await createScene(gc);
    const capture = () => {
      const image = view.captureNextImage();
      renderWindow.render();
      return image;
    };
    const empty = await capture();
    const images = [0, 1].map(() =>
      gc.registerResource(testUtils.createImage([8, 8, 8], [1, 1, 1]))
    );
    const arrays = images.map((image) => image.getPointData().getScalars());
    const prop = createProp(gc, kind, images);
    renderer.addViewProp(prop);
    renderer.resetCamera();
    expect(await capture()).not.toBe(empty);
    for (const index of [0, 1]) {
      images[index].getPointData().setScalars(null);
      expect(await capture()).not.toBe(empty);
      if (!webGPU) expect(view.getContext().getError()).toBe(0);
      images[index].getPointData().setScalars(arrays[index]);
      expect(await capture()).not.toBe(empty);
    }
  }
);
