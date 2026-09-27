import { describe, expect, it, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createConeActor,
  createTrackedRenderView,
} from 'vtk.js/Sources/Testing/renderTestUtils';

// Tracks the programs and shaders created on gl. The returned function stops
// tracking and counts those GL still holds, which includes a deleted shader
// that a program keeps attached.
function trackLiveObjects(gl) {
  const createProgram = vi.spyOn(gl, 'createProgram');
  const createShader = vi.spyOn(gl, 'createShader');
  return () => {
    const created = (create) => create.mock.results.map(({ value }) => value);
    const counts = {
      programs: created(createProgram).filter((p) => gl.isProgram(p)).length,
      shaders: created(createShader).filter((s) => gl.isShader(s)).length,
    };
    createProgram.mockRestore();
    createShader.mockRestore();
    return counts;
  };
}

describe.skipIf(__VTK_TEST_NO_WEBGL__)('failed shader link', () => {
  // The next render retries the build, so the failed link must leave nothing
  // behind for it.
  it('leaves no GL objects behind once the retry succeeds', async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view } = createTrackedRenderView(gc);
    renderer.addActor(createConeActor(gc));
    renderer.resetCamera();
    const gl = view.getContext();

    const stopTrackingRetry = trackLiveObjects(gl);
    vi.spyOn(gl, 'getProgramParameter').mockReturnValueOnce(false);
    const failed = view.captureNextImage();
    renderWindow.render();
    const recovered = view.captureNextImage();
    renderWindow.render();
    const afterRetry = stopTrackingRetry();
    const glError = gl.getError();

    view.releaseGraphicsResources();
    const stopTrackingBuild = trackLiveObjects(gl);
    const reference = view.captureNextImage();
    renderWindow.render();
    const afterSingleBuild = stopTrackingBuild();

    expect(afterRetry).toEqual(afterSingleBuild);
    expect(glError).toBe(gl.NO_ERROR);
    expect(await failed).not.toBe(await reference);
    expect(await recovered).toBe(await reference);
    gc.releaseResources();
  });
});
