import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';

function imageDataFromDataURI(dataURI) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = reject;
    img.src = dataURI;
  });
}

async function countBrightPixels(openGLRenderWindow, renderWindow) {
  const promise = openGLRenderWindow
    .captureNextImage()
    .then(imageDataFromDataURI);
  renderWindow.render();
  const { data, width, height } = await promise;
  let count = 0;
  for (let i = 0; i < width * height; ++i) {
    if (data[i * 4] > 60) {
      ++count;
    }
  }
  return count;
}

function buildScene(gc) {
  const container = document.querySelector('body');
  const renderWindowContainer = gc.registerDOMElement(
    document.createElement('div')
  );
  container.appendChild(renderWindowContainer);

  const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
  const renderer = gc.registerResource(vtkRenderer.newInstance());
  renderer.setBackground(0, 0, 0);
  renderWindow.addRenderer(renderer);

  const polyData = gc.registerResource(vtkPolyData.newInstance());
  polyData.getPoints().setData(Float32Array.from([0, 0, 0]), 3);
  const mapper = gc.registerResource(vtkPointGaussianMapper.newInstance());
  const actor = gc.registerResource(vtkActor.newInstance());
  mapper.setInputData(polyData);
  mapper.setScalarVisibility(false);
  actor.setMapper(mapper);
  renderer.addActor(actor);

  const openGLRenderWindow = gc.registerResource(
    renderWindow.newAPISpecificView()
  );
  openGLRenderWindow.setContainer(renderWindowContainer);
  renderWindow.addView(openGLRenderWindow);
  openGLRenderWindow.setSize(50, 50);

  return { renderWindow, renderer, mapper, actor, openGLRenderWindow };
}

function placeCamera(renderer, distance) {
  const cam = renderer.getActiveCamera();
  cam.setPosition(0, 0, distance);
  cam.setFocalPoint(0, 0, 0);
  cam.setViewUp(0, 1, 0);
  renderer.resetCameraClippingRange();
  return cam;
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'worldSize scales splats with perspective distance; screen mode does not',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderWindow, renderer, mapper, actor, openGLRenderWindow } =
      buildScene(gc);

    // worldSize 1 at viewAngle 30 in a 50 px viewport: ~19 px across at
    // distance 5, ~9 px at distance 10 — covered area should shrink ~4x.
    mapper.setWorldSize(1);
    placeCamera(renderer, 5);
    const nearCount = await countBrightPixels(openGLRenderWindow, renderWindow);
    placeCamera(renderer, 10);
    const farCount = await countBrightPixels(openGLRenderWindow, renderWindow);

    expect(farCount, 'far splat still renders').toBeGreaterThan(0);
    expect(
      nearCount,
      'world-sized splat covers ~4x the area at half the distance'
    ).toBeGreaterThan(2.5 * farCount);
    expect(nearCount).toBeLessThan(6 * farCount);

    // Control: screen-space mode keeps the drawn size distance-independent.
    mapper.setWorldSize(0);
    actor.getProperty().setPointSize(10);
    placeCamera(renderer, 5);
    const screenNear = await countBrightPixels(
      openGLRenderWindow,
      renderWindow
    );
    placeCamera(renderer, 10);
    const screenFar = await countBrightPixels(openGLRenderWindow, renderWindow);
    expect(screenFar).toBeGreaterThan(0);
    expect(
      Math.abs(screenNear - screenFar),
      'screen-space size is unaffected by distance'
    ).toBeLessThan(0.25 * screenNear);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'sub-pixel world splats fall back to the actor point size floor',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderWindow, renderer, mapper, actor, openGLRenderWindow } =
      buildScene(gc);

    actor.getProperty().setPointSize(12);
    placeCamera(renderer, 5);

    // Screen-mode reference at 12 px.
    const screenCount = await countBrightPixels(
      openGLRenderWindow,
      renderWindow
    );

    // A world size that projects far below 1 px must not shrink the point
    // below the screen-space floor.
    mapper.setWorldSize(0.01);
    const flooredCount = await countBrightPixels(
      openGLRenderWindow,
      renderWindow
    );

    expect(screenCount).toBeGreaterThan(0);
    expect(
      Math.abs(flooredCount - screenCount),
      'sub-pixel world sizing renders at the actor point size'
    ).toBeLessThan(0.25 * screenCount + 3);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'worldSize folds the actor scale in (model units through the transform)',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderWindow, renderer, mapper, actor, openGLRenderWindow } =
      buildScene(gc);

    // A point at the origin is position-invariant under actor scaling, so
    // scaling the actor should only rescale the splat: 2x scale -> ~4x area.
    mapper.setWorldSize(0.5);
    placeCamera(renderer, 5);
    const unscaled = await countBrightPixels(openGLRenderWindow, renderWindow);
    actor.setScale(2, 2, 2);
    placeCamera(renderer, 5);
    const scaled = await countBrightPixels(openGLRenderWindow, renderWindow);

    expect(unscaled, 'unscaled splat renders').toBeGreaterThan(0);
    expect(
      scaled,
      'a 2x actor scale roughly quadruples the covered area'
    ).toBeGreaterThan(2.5 * unscaled);
    expect(scaled).toBeLessThan(6 * unscaled);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'worldSize under a parallel projection tracks parallelScale, not distance',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderWindow, renderer, mapper, openGLRenderWindow } =
      buildScene(gc);

    mapper.setWorldSize(1);
    const cam = placeCamera(renderer, 5);
    cam.setParallelProjection(true);
    cam.setParallelScale(5); // 1 world unit -> 5 px in a 50 px viewport

    const nearCount = await countBrightPixels(openGLRenderWindow, renderWindow);
    placeCamera(renderer, 10).setParallelProjection(true);
    const farCount = await countBrightPixels(openGLRenderWindow, renderWindow);
    expect(
      farCount,
      'parallel splat renders at both distances'
    ).toBeGreaterThan(0);
    expect(
      Math.abs(nearCount - farCount),
      'parallel-projection size is distance-independent'
    ).toBeLessThan(0.4 * nearCount + 3);

    // Halving parallelScale zooms in 2x: covered area grows ~4x.
    cam.setParallelScale(2.5);
    const zoomedCount = await countBrightPixels(
      openGLRenderWindow,
      renderWindow
    );
    expect(
      zoomedCount,
      'halving parallelScale roughly quadruples the covered area'
    ).toBeGreaterThan(2.5 * farCount);

    gc.releaseResources();
  }
);
