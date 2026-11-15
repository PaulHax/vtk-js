import { expect, it } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkAxesActor from 'vtk.js/Sources/Rendering/Core/AxesActor';
import vtkGenericRenderWindow from 'vtk.js/Sources/Rendering/Misc/GenericRenderWindow';
import vtkOrientationMarkerWidget from 'vtk.js/Sources/Interaction/Widgets/OrientationMarkerWidget';

// Resize observations are delivered after animation frame callbacks, so two
// frames guarantee any pending observation has run.
const nextFrames = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'Test vtkOrientationMarkerWidget fits the marker before the resized view renders',
  async () => {
    const gc = testUtils.createGarbageCollector();

    const container = gc.registerDOMElement(document.createElement('div'));
    container.style.width = '300px';
    container.style.height = '300px';
    document.body.appendChild(container);

    const grw = gc.registerResource(
      vtkGenericRenderWindow.newInstance({ listenWindowResize: false })
    );
    grw.setContainer(container);
    grw.resize();

    const interactor = grw.getInteractor();
    // Without pixel clamps the marker size is a fraction of the view whatever
    // the device pixel ratio.
    const widget = gc.registerResource(
      vtkOrientationMarkerWidget.newInstance({
        actor: vtkAxesActor.newInstance(),
        interactor,
        minPixelSize: 0,
        maxPixelSize: Number.MAX_VALUE,
      })
    );
    widget.setEnabled(true);
    interactor.render();
    await nextFrames();

    const renderedViewports = [];
    const renderSub = interactor.onRenderEvent(() => {
      renderedViewports.push([...widget.getRenderer().getViewport()]);
    });

    container.style.width = '400px';
    container.style.height = '200px';
    grw.resize();
    await nextFrames();
    renderSub.unsubscribe();

    expect(renderedViewports.length, 'Resizing renders the view once').toBe(1);
    const [left, bottom, right, top] = renderedViewports[0];
    expect(left).toBe(0);
    expect(bottom).toBe(0);
    expect(right).toBeCloseTo(0.1);
    expect(top).toBeCloseTo(0.2);

    gc.releaseResources();
  }
);
