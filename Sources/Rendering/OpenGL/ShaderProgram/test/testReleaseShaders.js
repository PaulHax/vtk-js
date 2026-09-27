import { expect, it, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createConeActor,
  createTrackedRenderView,
} from 'vtk.js/Sources/Testing/renderTestUtils';

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'deletes the shaders of released programs',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view } = createTrackedRenderView(gc);
    renderer.addActor(createConeActor(gc));
    renderer.resetCamera();
    const gl = view.getContext();
    const createShader = vi.spyOn(gl, 'createShader');
    renderWindow.render();
    const shaders = createShader.mock.results.map(({ value }) => value);
    createShader.mockRestore();
    expect(shaders).not.toHaveLength(0);
    expect(shaders.every((shader) => gl.isShader(shader))).toBe(true);

    view.releaseGraphicsResources();
    expect(shaders.filter((shader) => gl.isShader(shader))).toEqual([]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  }
);
