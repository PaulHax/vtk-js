import { expect, it } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkViewProxy from 'vtk.js/Sources/Proxy/Core/ViewProxy';

// Resize observations are delivered after animation frame callbacks, so two
// frames guarantee any pending observation has run.
const nextFrames = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'Test vtkViewProxy draws a resized view before the browser paints it',
  async () => {
    const gc = testUtils.createGarbageCollector();

    const container = gc.registerDOMElement(document.createElement('div'));
    container.style.width = '300px';
    container.style.height = '300px';
    document.body.appendChild(container);

    const proxy = gc.registerResource(vtkViewProxy.newInstance());
    proxy.getRenderer().setBackground(1, 0, 0);
    proxy.setContainer(container);
    proxy.setOrientationAxesVisibility(false);
    proxy.resize();
    proxy.render();

    const resizeObserver = new ResizeObserver(() => proxy.resize());
    resizeObserver.observe(container);

    // Observers run in creation order, and the browser paints after the last
    // one, so this one sees the canvas the browser is about to paint.
    const view = proxy.getRenderWindow().getViews()[0];
    const paintedRed = [];
    const paintObserver = new ResizeObserver(() => {
      const [width, height] = view.getSize();
      const x = Math.floor(width / 2);
      const y = Math.floor(height / 2);
      paintedRed.push(view.getPixelData(x, y, x, y)[0]);
    });
    paintObserver.observe(container);
    paintObserver.observe(view.getCanvas());
    await nextFrames();
    paintedRed.length = 0;

    container.style.width = '400px';
    container.style.height = '200px';
    await nextFrames();
    resizeObserver.disconnect();
    paintObserver.disconnect();

    expect(paintedRed.length).toBeGreaterThan(0);
    expect(paintedRed.at(-1), 'The resized view shows its background').toBe(
      255
    );

    gc.releaseResources();
  }
);
