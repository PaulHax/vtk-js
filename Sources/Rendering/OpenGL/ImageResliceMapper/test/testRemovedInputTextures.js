import { it, expect, vi, afterEach } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkImageProperty from 'vtk.js/Sources/Rendering/Core/ImageProperty';
import vtkImageResliceMapper from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';

// Shared transfer functions keep lookup texture counts constant.
function createMultiInputActor(gc) {
  const color = gc.registerResource(vtkColorTransferFunction.newInstance());
  color.addRGBPoint(0, 0, 0, 1);
  color.addRGBPoint(255, 1, 0.5, 0);
  const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
  opacity.addPoint(0, 0.5);
  opacity.addPoint(255, 1);
  const property = gc.registerResource(vtkImageProperty.newInstance());
  property.setIndependentComponents(true);
  property.setRGBTransferFunction(color);
  property.setPiecewiseFunction(opacity);

  const slicePlane = gc.registerResource(
    vtkPlane.newInstance({ origin: [7, 7, 7] })
  );
  const mapper = gc.registerResource(vtkImageResliceMapper.newInstance());
  mapper.setSlicePlane(slicePlane);

  const actor = gc.registerResource(vtkImageSlice.newInstance());
  actor.setMapper(mapper);
  actor.setProperties([property, property, property]);
  return actor;
}

afterEach(() => vi.restoreAllMocks());

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'frees the texture of a removed input once no other input uses it',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, view } =
      createTrackedRenderView(gc);
    const render = async () => {
      const image = view.captureNextImage();
      renderWindow.render();
      return { objects: tracker.count(), image: await image };
    };

    const actor = createMultiInputActor(gc);
    const mapper = actor.getMapper();
    const firstImage = testUtils.createImage([16, 16, 16], [1, 1, 1]);
    const secondImage = testUtils.createImage([8, 8, 8], [2, 2, 2]);
    mapper.setInputData(firstImage, 0);
    renderer.addActor(actor);
    renderer.resetCamera();
    const oneInput = await render();

    mapper.addInputData(secondImage);
    const twoInputs = await render();
    mapper.addInputData(secondImage);
    renderWindow.render();

    mapper.setInputData(null, 2);
    expect(await render()).toEqual(twoInputs);
    mapper.setInputData(null, 1);
    expect(await render()).toEqual(oneInput);
    mapper.setInputData(null, 0);
    renderWindow.render();
    expect(tracker.count()).toBe(oneInput.objects - 1);

    // Reordering inputs must retain the second image's texture.
    mapper.setInputData(secondImage, 1);
    renderWindow.render();
    mapper.setInputData(firstImage, 0);
    const image = view.captureNextImage();
    const uploads = ['texImage3D', 'texStorage3D'].map((method) =>
      vi.spyOn(view.getContext(), method)
    );
    renderWindow.render();
    expect(uploads.flatMap((spy) => spy.mock.calls)).toHaveLength(1);
    expect({ objects: tracker.count(), image: await image }).toEqual(twoInputs);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'keeps a shared scalar texture when another mapper removes its input',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view } = createTrackedRenderView(gc);
    const image = testUtils.createImage([16, 16, 16], [1, 1, 1]);
    const actors = [createMultiInputActor(gc), createMultiInputActor(gc)];
    actors.forEach((actor) => {
      actor.getMapper().setInputData(image);
      renderer.addActor(actor);
    });
    renderer.resetCamera();
    renderWindow.render();
    view.releaseGraphicsResources();
    renderWindow.render();

    const gl = view.getContext();
    const texture = view
      .getGraphicsResourceForObject(image.getPointData().getScalars())
      .oglObject.getHandle();
    actors[0].getMapper().setInputData(null);
    renderWindow.render();
    expect(gl.isTexture(texture)).toBe(true);
    actors[1].getMapper().setInputData(null);
    renderWindow.render();
    expect(gl.isTexture(texture)).toBe(false);
  }
);
