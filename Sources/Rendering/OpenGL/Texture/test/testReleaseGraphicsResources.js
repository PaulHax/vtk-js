import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkOpenGLTexture from 'vtk.js/Sources/Rendering/OpenGL/Texture';
import vtkPlaneSource from 'vtk.js/Sources/Filters/Sources/PlaneSource';
import vtkTexture from 'vtk.js/Sources/Rendering/Core/Texture';
import { VtkDataTypes } from 'vtk.js/Sources/Common/Core/DataArray/Constants';

function createTexturedActor(gc) {
  const image = vtkImageData.newInstance();
  image.setDimensions(2, 1, 1);
  image.getPointData().setScalars(
    vtkDataArray.newInstance({
      numberOfComponents: 3,
      values: Uint8Array.from([255, 0, 0, 0, 0, 255]),
    })
  );
  const texture = gc.registerResource(vtkTexture.newInstance());
  texture.setInputData(image);

  const plane = gc.registerResource(vtkPlaneSource.newInstance());
  const mapper = gc.registerResource(vtkMapper.newInstance());
  mapper.setInputConnection(plane.getOutputPort());
  const actor = gc.registerResource(vtkActor.newInstance());
  actor.setMapper(mapper);
  actor.addTexture(texture);
  return actor;
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'frees an actor texture when the actor leaves the view or the view is deleted',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow } = createTrackedRenderView(gc);

    renderer.addActor(createTexturedActor(gc));
    renderer.resetCamera();
    renderWindow.render();
    const oneActorObjects = tracker.count();

    const leaving = createTexturedActor(gc);
    renderer.addActor(leaving);
    renderWindow.render();
    expect(tracker.count()).toBeGreaterThan(oneActorObjects);

    renderer.removeActor(leaving);
    renderWindow.render();
    expect(tracker.count()).toBe(oneActorObjects);

    gc.releaseResources();
    expect(tracker.count()).toBe(0);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'frees a texture released without a render window and uploads it again',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, view } =
      createTrackedRenderView(gc);
    const background = view.captureNextImage();
    renderWindow.render();

    const actor = createTexturedActor(gc);
    renderer.addActor(actor);
    renderer.resetCamera();
    const beforeRelease = view.captureNextImage();
    renderWindow.render();
    const objectsInUse = tracker.count();
    expect(await beforeRelease).not.toBe(await background);

    view.getViewNodeFor(actor.getTextures()[0]).releaseGraphicsResources();
    expect(tracker.count()).toBe(objectsInUse - 1);

    const afterRelease = view.captureNextImage();
    renderWindow.render();
    expect(tracker.count()).toBe(objectsInUse);
    expect(await afterRelease).toBe(await beforeRelease);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'frees a texture deleted after its render window',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, view, emptySceneObjects } = createTrackedRenderView(gc);

    const texture = vtkOpenGLTexture.newInstance();
    texture.setOpenGLRenderWindow(view);
    texture.create2DFromRaw({
      width: 2,
      height: 2,
      numComps: 4,
      dataType: VtkDataTypes.UNSIGNED_CHAR,
      data: null,
    });
    expect(tracker.count()).toBe(emptySceneObjects + 1);

    gc.releaseResources();
    expect(() => texture.delete()).not.toThrow();
    expect(tracker.count()).toBe(0);
  }
);
