import { afterEach, expect, it } from 'vitest';
import macro from 'vtk.js/Sources/macros';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createConeActor,
  createTrackedRenderView,
} from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkLight from 'vtk.js/Sources/Rendering/Core/Light';

afterEach(() => macro.setLoggerFunction('error', console.error));

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'skips rendering without errors while the WebGL context is lost',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view } = createTrackedRenderView(gc);
    renderer.addActor(createConeActor(gc));
    renderer.resetCamera();
    renderWindow.render();
    view.getContext().getExtension('WEBGL_lose_context').loseContext();

    const errors = [];
    macro.setLoggerFunction('error', (...args) => errors.push(args));
    // A new light needs shaders the lost context cannot compile
    renderer.addLight(gc.registerResource(vtkLight.newInstance()));
    const capture = view.captureNextImage();
    renderWindow.render();
    expect(errors).toEqual([]);
    expect(await capture).toMatch(/^data:image\/png/);

    gc.releaseResources();
  }
);
