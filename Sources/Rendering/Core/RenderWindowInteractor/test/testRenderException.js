import { it, expect, onTestFinished } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createFailingScene,
  expectSameImageAfterRenderThrows,
  renderToImage,
} from 'vtk.js/Sources/Testing/renderTestUtils';

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

// An exception out of an animation frame is uncaught, so it reaches window
// error listeners, where an application reports it.
function collectUncaughtErrors() {
  const messages = [];
  const onError = (event) => {
    messages.push(event.error.message);
    event.preventDefault();
  };
  window.addEventListener('error', onError);
  onTestFinished(() => window.removeEventListener('error', onError));
  return messages;
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'draws the scene again after a render throws',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = createFailingScene(gc);
    await expectSameImageAfterRenderThrows(scene, scene.filter.setFailing);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'keeps drawing an animation after one of its frames throws',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderWindow, view, filter } = createFailingScene(gc);
    const expected = view.captureNextImage();
    renderWindow.render();
    const errors = collectUncaughtErrors();

    const interactor = renderWindow.getInteractor();
    filter.setFailing(true);
    interactor.requestAnimation('test');
    onTestFinished(() => interactor.cancelAnimation('test', true));
    await nextFrame();
    expect(errors).toEqual(['filter failed']);

    filter.setFailing(false);
    expect(await renderToImage(view, nextFrame)).toBe(await expected);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'ends an animation whose last frame throws',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderWindow, view, filter } = createFailingScene(gc);
    const expected = view.captureNextImage();
    renderWindow.render();
    const errors = collectUncaughtErrors();

    const interactor = renderWindow.getInteractor();
    let endedAnimations = 0;
    const subscription = interactor.onEndAnimation(() => {
      endedAnimations += 1;
    });
    onTestFinished(() => subscription.unsubscribe());
    filter.setFailing(true);
    // Without a requester to hold it open, the first frame is also the last,
    // as when the interactor animates on after a mouse wheel.
    interactor.extendAnimation(0);
    await nextFrame();
    expect(errors).toEqual(['filter failed']);
    expect(endedAnimations).toBe(1);
    // the error that surfaces is the frame's own, not one from rendering again
    expect(filter.getFailures()).toBe(1);

    filter.setFailing(false);
    expect(await renderToImage(view)).toBe(await expected);
  }
);
