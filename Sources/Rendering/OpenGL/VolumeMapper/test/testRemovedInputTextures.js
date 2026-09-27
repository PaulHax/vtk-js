import { it, expect, vi, afterEach } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';

afterEach(() => vi.restoreAllMocks());

// Both inputs share their transfer functions, so only scalar textures differ.
function createScene(gc, images) {
  const { renderer, renderWindow, view } = createTrackedRenderView(gc);
  const mapper = gc.registerResource(vtkVolumeMapper.newInstance());
  images.forEach((image, port) =>
    port ? mapper.addInputData(image) : mapper.setInputData(image)
  );
  const volume = gc.registerResource(vtkVolume.newInstance());
  volume.setMapper(mapper);
  const color = gc.registerResource(vtkColorTransferFunction.newInstance());
  color.addRGBPoint(0, 0, 0, 1);
  color.addRGBPoint(255, 1, 0.5, 0);
  const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
  opacity.addPoint(0, 0);
  opacity.addPoint(255, 1);
  [0, 1].forEach((port) => {
    const property = volume.getProperty(port);
    [0, 1].forEach((component) => {
      property.setRGBTransferFunction(component, color);
      property.setScalarOpacity(component, opacity);
    });
  });
  renderer.addVolume(volume);
  renderer.resetCamera();
  const render = () => {
    const image = view.captureNextImage();
    renderWindow.render();
    return image;
  };
  return { view, mapper, render };
}

const createImage = () => testUtils.createImage([8, 8, 8], [1, 1, 1]);
const textureOf = (view, image) =>
  view.getGraphicsResourceForObject(image.getPointData().getScalars())
    ?.oglObject.getHandle();

// Images are compared within one view: each view jitters its rays randomly.
it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'frees the texture of a removed input',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const [first, second] = [createImage(), createImage()];
    const scene = createScene(gc, [first]);
    const oneInput = await scene.render();
    scene.mapper.addInputData(second);
    await scene.render();
    const gl = scene.view.getContext();
    const removedTexture = textureOf(scene.view, second);
    expect(gl.isTexture(removedTexture)).toBe(true);

    scene.mapper.setInputData(null, 1);
    expect(await scene.render()).toBe(oneInput);
    expect(gl.isTexture(removedTexture)).toBe(false);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'renders a volume whose first input slot is empty',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const [first, second] = [createImage(), createImage()];
    const scene = createScene(gc, [second]);
    const secondOnly = await scene.render();
    scene.mapper.setInputData(first, 0);
    scene.mapper.addInputData(second);
    scene.mapper.setInputData(null, 0);
    expect(await scene.render()).toBe(secondOnly);
    expect(scene.view.getContext().getError()).toBe(0);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'keeps the textures of reordered inputs',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const [first, second] = [createImage(), createImage()];
    const scene = createScene(gc, [first, second]);
    const drawn = await scene.render();
    const uploads = vi.spyOn(scene.view.getContext(), 'texStorage3D');

    scene.mapper.setInputData(second, 0);
    scene.mapper.setInputData(first, 1);
    await scene.render();
    scene.mapper.setInputData(first, 0);
    scene.mapper.setInputData(second, 1);
    expect(await scene.render()).toBe(drawn);
    expect(uploads).not.toHaveBeenCalled();
  }
);
