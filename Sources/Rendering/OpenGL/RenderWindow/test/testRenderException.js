import { it } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createConeActor,
  createFailingFilter,
  createTrackedRenderView,
  expectSameImageAfterRenderThrows,
} from 'vtk.js/Sources/Testing/renderTestUtils';

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'draws the same image after a translucent actor throws',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = createTrackedRenderView(gc);
    const filter = createFailingFilter(gc);
    // The translucent pass draws the second cone into a framebuffer it owns,
    // with a blend function of its own, and throws there. The opaque cone
    // shows what later renders draw with.
    scene.renderer.addActor(createConeActor(gc, { center: [-0.4, 0, 0] }));
    scene.renderer.addActor(
      createConeActor(gc, { center: [0.4, 0, 0], opacity: 0.5, filter })
    );
    scene.renderer.resetCamera();
    await expectSameImageAfterRenderThrows(scene, filter.setFailing);
  }
);
