import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createTrackedRenderView,
  expectSameImageAfterRelease,
} from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkImageResliceMapper from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';

const size = 16;

function createResliceActor(
  gc,
  { transferFunctions = false, labelOutline = false } = {}
) {
  const slicePlane = gc.registerResource(vtkPlane.newInstance());
  slicePlane.setNormal(1, 1, 1);
  slicePlane.setOrigin(size / 2, size / 2, size / 2);

  const mapper = gc.registerResource(vtkImageResliceMapper.newInstance());
  mapper.setInputData(testUtils.createImage([size, size, size], [1, 1, 1]));
  mapper.setSlicePlane(slicePlane);

  const actor = gc.registerResource(vtkImageSlice.newInstance());
  actor.setMapper(mapper);
  const property = actor.getProperty();
  if (transferFunctions) {
    const color = gc.registerResource(vtkColorTransferFunction.newInstance());
    color.addRGBPoint(0, 0, 0, 1);
    color.addRGBPoint(255, 1, 0.5, 0);
    const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
    opacity.addPoint(0, 0.5);
    opacity.addPoint(255, 1);
    property.setRGBTransferFunction(color);
    property.setPiecewiseFunction(opacity);
  }
  property.setUseLabelOutline(labelOutline);
  return actor;
}

function renderResliceActor(gc, options) {
  const view = createTrackedRenderView(gc);
  const actor = createResliceActor(gc, options);
  view.renderer.addActor(actor);
  view.renderer.resetCamera();
  view.renderWindow.render();
  return { ...view, actor };
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'releases default lookup textures when the slice moves',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderWindow, actor } = renderResliceActor(gc);
    const firstSliceObjects = tracker.count();

    actor.getMapper().getSlicePlane().setOrigin(6, 6, 6);
    renderWindow.render();
    expect(tracker.count()).toBe(firstSliceObjects);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'releases default lookup textures when adopting shared ones',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow } = createTrackedRenderView(gc);
    const other = createResliceActor(gc, { transferFunctions: true });
    const actor = createResliceActor(gc);
    // Draw the owner first so it cannot rebuild a wrongly freed shared texture.
    renderer.addActor(other);
    renderer.addActor(actor);
    renderer.resetCamera();
    renderWindow.render();
    const defaultLookupObjects = tracker.count();

    const property = actor.getProperty();
    const otherProperty = other.getProperty();
    property.setRGBTransferFunction(otherProperty.getRGBTransferFunction());
    property.setPiecewiseFunction(otherProperty.getPiecewiseFunction());
    renderWindow.render();
    property.setRGBTransferFunction(null);
    property.setPiecewiseFunction(null);
    renderWindow.render();
    expect(tracker.count()).toBe(defaultLookupObjects);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'releases GPU objects when removed from a view',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, actor, emptySceneObjects } =
      renderResliceActor(gc, { transferFunctions: true });
    expect(tracker.count()).toBeGreaterThan(emptySceneObjects);

    renderer.removeActor(actor);
    renderWindow.render();
    expect(tracker.count()).toBe(emptySceneObjects);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'rebuilds label outlines after resource release',
  () =>
    expectSameImageAfterRelease((gc) =>
      createResliceActor(gc, { labelOutline: true })
    )
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'keeps shared textures in use after resource release',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, view, actor } = renderResliceActor(
      gc,
      { transferFunctions: true }
    );
    const aloneObjects = tracker.count();

    const other = createResliceActor(gc);
    other.getMapper().setInputData(actor.getMapper().getInputData());
    other.setProperty(actor.getProperty());
    renderer.addActor(other);
    renderWindow.render();
    view.getViewNodeFor(actor.getMapper()).releaseGraphicsResources(view);
    renderWindow.render();

    // Keep this mapper from rebuilding textures released by the other mapper.
    actor.setVisibility(false);
    renderer.removeActor(other);
    renderWindow.render();
    expect(tracker.count()).toBe(aloneObjects);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'releases replaced label outline textures before deleting the slice',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, actor, emptySceneObjects } =
      renderResliceActor(gc, { labelOutline: true });
    const objectsInUse = tracker.count();

    actor.getProperty().setLabelOutlineThickness([2]);
    renderWindow.render();
    expect(tracker.count()).toBe(objectsInUse);

    actor.getProperty().setLabelOutlineOpacity([0.5]);
    renderWindow.render();
    expect(tracker.count()).toBe(objectsInUse);

    renderer.removeActor(actor);
    renderWindow.render();
    expect(tracker.count()).toBe(emptySceneObjects);
  }
);
