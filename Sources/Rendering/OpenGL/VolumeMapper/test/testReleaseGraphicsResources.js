import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createTrackedRenderView,
  createVolume,
} from 'vtk.js/Sources/Testing/renderTestUtils';

function createInteractiveVolume(gc) {
  const volume = createVolume(gc);
  // Scales above 1.5 make the mapper render through a framebuffer it owns
  // while interacting. renderPieceStart latches this on its first render.
  volume.getMapper().setInitialInteractionScale(2.0);
  return volume;
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'frees the volume mapper GPU objects when the volume leaves the scene',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, view, emptySceneObjects } =
      createTrackedRenderView(gc);

    const volume = createInteractiveVolume(gc);
    renderer.addVolume(volume);
    renderer.resetCamera();
    renderWindow.render();

    const objectsBeforeInteraction = tracker.count();
    const interactor = renderWindow.getInteractor();
    interactor.requestAnimation('test');
    // render() is a no-op while animating, so drive the passes directly
    view.traverseAllPasses();
    interactor.cancelAnimation('test');
    // the interaction framebuffer and its attachments
    expect(tracker.count()).toBeGreaterThan(objectsBeforeInteraction);

    renderer.removeVolume(volume);
    renderWindow.render();
    expect(tracker.count()).toBe(emptySceneObjects);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'still draws the volume after the mapper releases its resources',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, view, emptySceneObjects } =
      createTrackedRenderView(gc);

    const emptyImage = view.captureNextImage();
    renderWindow.render();

    const volume = createInteractiveVolume(gc);
    renderer.addVolume(volume);
    renderer.resetCamera();
    renderWindow.render();
    expect(tracker.count()).toBeGreaterThan(emptySceneObjects);

    view.getViewNodeFor(volume.getMapper()).releaseGraphicsResources();

    const afterRelease = view.captureNextImage();
    renderWindow.render();
    // The ray cast jitter texture is rebuilt from fresh noise, so the pixels
    // are not reproducible across a release. What has to hold is that the
    // mapper rebuilt what it gave up and still draws the volume.
    expect(await afterRelease).not.toBe(await emptyImage);
    expect(tracker.count()).toBeGreaterThan(emptySceneObjects);

    gc.releaseResources();
  }
);
