import { it, expect, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';

// Deliberately NO verts cell array: the mapper must draw straight from the
// points. Three non-collinear points so the render is not degenerate.
function makePointCloud(coords, rgb) {
  const polyData = vtkPolyData.newInstance();
  polyData.getPoints().setData(Float32Array.from(coords), 3);
  if (rgb) {
    polyData.getPointData().setScalars(
      vtkDataArray.newInstance({
        name: 'RGB',
        numberOfComponents: 3,
        values: Uint8Array.from(rgb),
      })
    );
  }
  return polyData;
}

function getActivePrimitiveCABOs(openGLRenderWindow, mapper) {
  const openGLMapper = openGLRenderWindow.getViewNodeFor(mapper);
  const primitives = openGLMapper.getReferenceByName('primitives');
  return primitives
    .map((primitive) => primitive.getCABO())
    .filter((cabo) => cabo.getElementCount() > 0);
}

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

it('vtkPointGaussianMapper normalizes its progressive draw count', () => {
  const mapper = vtkPointGaussianMapper.newInstance();
  expect(mapper.getMaximumPointCount()).toBe(-1);
  expect(mapper.setMaximumPointCount(3.8)).toBe(true);
  expect(mapper.getMaximumPointCount()).toBe(3);
  expect(mapper.setMaximumPointCount(Number.NaN)).toBe(false);
  expect(mapper.getMaximumPointCount()).toBe(3);
  expect(mapper.setMaximumPointCount(-20)).toBe(true);
  expect(mapper.getMaximumPointCount()).toBe(-1);
  mapper.delete();
});

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper uploads one vertex per input point (not 3N)',
  () => {
    const gc = testUtils.createGarbageCollector();
    const container = document.querySelector('body');
    const renderWindowContainer = gc.registerDOMElement(
      document.createElement('div')
    );
    container.appendChild(renderWindowContainer);

    const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
    const renderer = gc.registerResource(vtkRenderer.newInstance());
    renderWindow.addRenderer(renderer);

    const numPoints = 5;
    const coords = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0.5, 0.5, 1];
    const polyData = gc.registerResource(
      makePointCloud(
        coords,
        [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 255, 0, 255]
      )
    );
    const mapper = gc.registerResource(vtkPointGaussianMapper.newInstance());
    const actor = gc.registerResource(vtkActor.newInstance());

    mapper.setInputData(polyData);
    mapper.setColorModeToDirectScalars();
    mapper.setScalarVisibility(true);
    actor.setMapper(mapper);
    renderer.addActor(actor);
    renderer.resetCamera();

    const openGLRenderWindow = gc.registerResource(
      renderWindow.newAPISpecificView()
    );
    openGLRenderWindow.setContainer(renderWindowContainer);
    renderWindow.addView(openGLRenderWindow);
    openGLRenderWindow.setSize(50, 50);
    renderWindow.render();

    const cabos = getActivePrimitiveCABOs(openGLRenderWindow, mapper);
    expect(cabos.length, 'exactly one active (Points) VBO').toBe(1);
    expect(
      cabos[0].getElementCount(),
      'N input points upload N vertices, not 3N'
    ).toBe(numPoints);

    const openGLMapper = openGLRenderWindow.getViewNodeFor(mapper);
    const pointCABO = cabos[0];
    const positionHandle = pointCABO.getHandle();
    const colorBO = pointCABO.getColorBO();
    const colorHandle = colorBO.getHandle();
    const deleteBuffer = vi.spyOn(
      openGLRenderWindow.getContext(),
      'deleteBuffer'
    );

    // Exercise the normal scene-graph lifecycle rather than reaching into a
    // primitive. Removing the actor makes its mapper view node release both
    // the point and color allocations as it is pruned on the next traversal.
    renderer.removeActor(actor);
    renderWindow.render();

    expect(
      deleteBuffer.mock.calls.map(([handle]) => handle),
      'scene removal deletes the point and color buffer handles'
    ).toEqual(expect.arrayContaining([positionHandle, colorHandle]));
    expect(pointCABO.getAllocatedGPUMemoryInBytes()).toBe(0);
    deleteBuffer.mockRestore();

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper changes its draw prefix without rebuilding VBOs',
  () => {
    const gc = testUtils.createGarbageCollector();
    const container = document.querySelector('body');
    const renderWindowContainer = gc.registerDOMElement(
      document.createElement('div')
    );
    container.appendChild(renderWindowContainer);

    const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
    const renderer = gc.registerResource(vtkRenderer.newInstance());
    renderWindow.addRenderer(renderer);
    const polyData = gc.registerResource(
      makePointCloud(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0.5, 0.5, 1],
        [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0, 255, 0, 255]
      )
    );
    const mapper = gc.registerResource(vtkPointGaussianMapper.newInstance());
    const actor = gc.registerResource(vtkActor.newInstance());
    mapper.setInputData(polyData);
    mapper.setColorModeToDirectScalars();
    actor.setMapper(mapper);
    renderer.addActor(actor);
    renderer.resetCamera();

    const openGLRenderWindow = gc.registerResource(
      renderWindow.newAPISpecificView()
    );
    openGLRenderWindow.setContainer(renderWindowContainer);
    renderWindow.addView(openGLRenderWindow);
    openGLRenderWindow.setSize(50, 50);
    renderWindow.render();

    const gl = openGLRenderWindow.getContext();
    const drawArrays = vi.spyOn(gl, 'drawArrays');
    const bufferData = vi.spyOn(gl, 'bufferData');

    mapper.setMaximumPointCount(2);
    renderWindow.render();
    expect(
      drawArrays.mock.calls.some(
        ([mode, first, count]) =>
          mode === gl.POINTS && first === 0 && count === 2
      )
    ).toBe(true);
    expect(bufferData).not.toHaveBeenCalled();

    drawArrays.mockClear();
    mapper.setMaximumPointCount(-1);
    renderWindow.render();
    expect(
      drawArrays.mock.calls.some(
        ([mode, first, count]) =>
          mode === gl.POINTS && first === 0 && count === 5
      )
    ).toBe(true);
    expect(bufferData).not.toHaveBeenCalled();

    drawArrays.mockRestore();
    bufferData.mockRestore();
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper renders full-range direct RGB above 127',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const container = document.querySelector('body');
    const renderWindowContainer = gc.registerDOMElement(
      document.createElement('div')
    );
    container.appendChild(renderWindowContainer);

    const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
    const renderer = gc.registerResource(vtkRenderer.newInstance());
    renderer.setBackground(0, 0, 0);
    renderWindow.addRenderer(renderer);

    // A single point coloured well above the signed-byte midpoint. If the color
    // path ever misread Uint8 as Int8, 200/250 would wrap dark; we assert bright.
    const polyData = gc.registerResource(
      makePointCloud([0, 0, 0], [10, 200, 250])
    );
    const mapper = gc.registerResource(vtkPointGaussianMapper.newInstance());
    const actor = gc.registerResource(vtkActor.newInstance());

    mapper.setInputData(polyData);
    mapper.setColorModeToDirectScalars();
    mapper.setScalarVisibility(true);
    actor.setMapper(mapper);
    actor.getProperty().setPointSize(40);
    renderer.addActor(actor);

    const cam = renderer.getActiveCamera();
    cam.setPosition(0, 0, 10);
    cam.setFocalPoint(0, 0, 0);
    cam.setViewUp(0, 1, 0);
    renderer.resetCameraClippingRange();

    const openGLRenderWindow = gc.registerResource(
      renderWindow.newAPISpecificView()
    );
    openGLRenderWindow.setContainer(renderWindowContainer);
    renderWindow.addView(openGLRenderWindow);
    openGLRenderWindow.setSize(50, 50);

    const promise = openGLRenderWindow
      .captureNextImage()
      .then(imageDataFromDataURI)
      .then(({ data, width, height }) => {
        const center =
          (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
        const [r, g, b] = [data[center], data[center + 1], data[center + 2]];
        expect(
          g,
          'green channel 200 renders bright, not wrapped dark'
        ).toBeGreaterThan(150);
        expect(
          b,
          'blue channel 250 renders bright, not wrapped dark'
        ).toBeGreaterThan(150);
        expect(r, 'red channel 10 stays dark').toBeLessThan(90);
      })
      .finally(gc.releaseResources);
    renderWindow.render();
    return promise;
  }
);
