import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createTrackedRenderView,
  expectSameImageAfterRelease,
} from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkConeSource from 'vtk.js/Sources/Filters/Sources/ConeSource';
import vtkGlyph3DMapper from 'vtk.js/Sources/Rendering/Core/Glyph3DMapper';
import vtkPlaneSource from 'vtk.js/Sources/Filters/Sources/PlaneSource';

function createGlyphActor(gc, planeOptions = {}) {
  const planeSource = gc.registerResource(
    vtkPlaneSource.newInstance(planeOptions)
  );
  const coneSource = gc.registerResource(vtkConeSource.newInstance());
  const mapper = gc.registerResource(vtkGlyph3DMapper.newInstance());
  mapper.setInputConnection(planeSource.getOutputPort(), 0);
  mapper.setInputConnection(coneSource.getOutputPort(), 1);
  const actor = gc.registerResource(vtkActor.newInstance());
  actor.setMapper(mapper);
  return actor;
}

// Glyphs add per-instance matrix, normal, color and pick buffers.
it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'frees the GPU objects of a glyph actor removed from a view',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, emptySceneObjects } =
      createTrackedRenderView(gc);

    const actor = createGlyphActor(gc);
    renderer.addActor(actor);
    renderer.resetCamera();
    renderWindow.render();
    expect(tracker.count()).toBeGreaterThan(emptySceneObjects);

    renderer.removeActor(actor);
    renderWindow.render();
    expect(tracker.count()).toBe(emptySceneObjects);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'rebuilds the same image after releaseGraphicsResources',
  () => expectSameImageAfterRelease(createGlyphActor)
);

// Large world coordinates require shifting and scaling the instance matrices.
function createShiftedGlyphActor(gc) {
  return createGlyphActor(gc, {
    origin: [100000, 100000, 0],
    point1: [100002, 100000, 0],
    point2: [100000, 100002, 0],
    xResolution: 1,
    yResolution: 1,
  });
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'rebuilds shifted glyphs after releaseGraphicsResources',
  () => expectSameImageAfterRelease(createShiftedGlyphActor)
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'rebuilds shifted glyphs after removing and re-adding the actor',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view } = createTrackedRenderView(gc);
    const actor = createShiftedGlyphActor(gc);
    renderer.addActor(actor);
    renderer.resetCamera();
    const before = view.captureNextImage();
    renderWindow.render();

    // Property changes rebuild the VBOs while retaining the glyph arrays.
    actor.getProperty().setEdgeVisibility(true);
    renderWindow.render();
    actor.getProperty().setEdgeVisibility(false);
    renderWindow.render();

    renderer.removeActor(actor);
    renderWindow.render();
    renderer.addActor(actor);
    const after = view.captureNextImage();
    renderWindow.render();

    expect(await after).toBe(await before);
    gc.releaseResources();
  }
);
