import { describe, it, expect } from 'vitest';
import macro from 'vtk.js/Sources/macros';
import vtkViewProxy from 'vtk.js/Sources/Proxy/Core/ViewProxy';
import vtkView2DProxy from 'vtk.js/Sources/Proxy/Core/View2DProxy';

function expectVector(actual, expected) {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]));
}

function expectMarkerOrientation(view) {
  const markerRenderer = view
    .getRenderWindow()
    .getRenderers()
    .find((renderer) => renderer !== view.getRenderer());
  const markerCamera = markerRenderer.getActiveCamera();
  const camera = view.getCamera();
  expectVector(
    markerCamera.getDirectionOfProjection(),
    camera.getDirectionOfProjection()
  );
  expectVector(markerCamera.getViewUp(), camera.getViewUp());
}

async function withView(factory, options, callback) {
  const warnings = [];
  macro.setLoggerFunction('warn', (...args) => warnings.push(args));
  let view;
  try {
    view = factory.newInstance(options);
    await callback(view);
  } finally {
    view?.delete();
    macro.setLoggerFunction('warn', console.warn);
  }
  expect(warnings).toEqual([]);
}

describe.each([
  ['vtkViewProxy', vtkViewProxy],
  ['vtkView2DProxy', vtkView2DProxy],
])('%s camera orientation', (name, factory) => {
  it('starts with a separated focal point and orthogonal view-up', () =>
    withView(factory, {}, (view) => {
      const camera = view.getCamera();
      expectVector(camera.getPosition(), [0, 1, 0]);
      expectVector(camera.getFocalPoint(), [0, 0, 0]);
      expectVector(camera.getDirectionOfProjection(), [0, -1, 0]);
      expectVector(camera.getViewUp(), [0, 0, 1]);
      expectMarkerOrientation(view);
    }));

  it('uses the requested initial axis, sign, and view-up', () =>
    withView(
      factory,
      { axis: 2, orientation: -1, viewUp: [0, 1, 0] },
      (view) => {
        const camera = view.getCamera();
        expectVector(camera.getPosition(), [0, 0, -1]);
        expectVector(camera.getFocalPoint(), [0, 0, 0]);
        expectVector(camera.getDirectionOfProjection(), [0, 0, 1]);
        expectVector(camera.getViewUp(), [0, 1, 0]);
        expectMarkerOrientation(view);
      }
    ));

  it('keeps the marker aligned when switching viewing axes', () =>
    withView(factory, {}, async (view) => {
      const orientations = [
        [0, 1, [0, 0, 1]],
        [2, 1, [0, 1, 0]],
        [1, -1, [0, 0, 1]],
        [0, -1, [0, 0, 1]],
        [2, -1, [0, 1, 0]],
        [1, 1, [0, 0, 1]],
      ];
      for (const [axis, orientation, viewUp] of orientations) {
        await view.updateOrientation(axis, orientation, viewUp);
        const position = [0, 0, 0];
        position[axis] = orientation;
        const direction = position.map((value) => -value);
        expectVector(view.getCamera().getPosition(), position);
        expectVector(view.getCamera().getDirectionOfProjection(), direction);
        expectVector(view.getCamera().getViewUp(), viewUp);
        expectMarkerOrientation(view);
      }
    }));

  it('updates the marker when only view-up changes', () =>
    withView(factory, {}, async (view) => {
      await view.moveCamera([1, 2, 3], [1, 2, 8], [0, 1, 0]);
      expectVector(view.getCamera().getFocalPoint(), [1, 2, 3]);
      expectVector(view.getCamera().getPosition(), [1, 2, 8]);
      expectMarkerOrientation(view);

      await view.moveCamera([1, 2, 3], [1, 2, 8], [0, -1, 0]);
      expectVector(view.getCamera().getViewUp(), [0, -1, 0]);
      expectMarkerOrientation(view);
    }));

  it('aligns the marker after an animated camera move', () =>
    withView(factory, {}, async (view) => {
      view.getInteractor().initialize();
      await view.moveCamera([0, 0, 0], [0, 0, 1], [0, 1, 0], 4);
      expectVector(view.getCamera().getPosition(), [0, 0, 1]);
      expectVector(view.getCamera().getDirectionOfProjection(), [0, 0, -1]);
      expectVector(view.getCamera().getViewUp(), [0, 1, 0]);
      expectMarkerOrientation(view);
    }));
});
