import { expect, it, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPoints from 'vtk.js/Sources/Common/Core/Points';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';

function makeScene(gc, polyData) {
  const container = document.querySelector('body');
  const renderWindowContainer = gc.registerDOMElement(
    document.createElement('div')
  );
  container.appendChild(renderWindowContainer);

  const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
  const renderer = gc.registerResource(vtkRenderer.newInstance());
  renderWindow.addRenderer(renderer);

  const mapper = gc.registerResource(vtkPointGaussianMapper.newInstance());
  mapper.setInputData(polyData);
  const actor = gc.registerResource(vtkActor.newInstance());
  actor.setMapper(mapper);
  renderer.addActor(actor);

  const view = gc.registerResource(renderWindow.newAPISpecificView());
  view.setContainer(renderWindowContainer);
  renderWindow.addView(view);
  view.setSize(32, 32);

  return { renderWindow, renderer, mapper, actor, view };
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'stages positions when the point array is shorter than the drawn count',
  () => {
    const gc = testUtils.createGarbageCollector();
    const polyData = gc.registerResource(vtkPolyData.newInstance());
    // Four points are reported and drawn, but the backing store only holds
    // three of them: the fast path must not hand this array to bufferData.
    polyData.setPoints(
      vtkPoints.newInstance({
        values: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        size: 12,
        numberOfComponents: 3,
      })
    );

    const { renderWindow, mapper, view } = makeScene(gc, polyData);
    mapper.setScalarVisibility(false);
    renderWindow.render();

    const points = polyData.getPoints();
    expect(points.getNumberOfPoints()).toBe(4);
    expect(points.getData().length).toBe(9);

    const bufferData = vi.spyOn(view.getContext(), 'bufferData');
    polyData.getPoints().modified();
    polyData.modified();
    renderWindow.render();

    const positionUploads = bufferData.mock.calls
      .map(([, data]) => data)
      .filter((data) => data instanceof Float32Array);
    expect(positionUploads).toHaveLength(1);
    expect(positionUploads[0]).not.toBe(points.getData());
    expect(positionUploads[0].length).toBe(12);

    bufferData.mockRestore();
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'stages colors when scalars are per cell rather than per point',
  () => {
    const gc = testUtils.createGarbageCollector();
    const polyData = gc.registerResource(vtkPolyData.newInstance());
    polyData
      .getPoints()
      .setData(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), 3);
    // One cell over four points: cell scalars yield one RGBA tuple, a quarter
    // of what the draw reads.
    polyData.getPolys().setData(Uint16Array.from([4, 0, 1, 2, 3]));
    const cellColors = gc.registerResource(
      vtkDataArray.newInstance({
        name: 'cellColors',
        numberOfComponents: 4,
        values: Uint8Array.from([10, 20, 30, 255]),
      })
    );
    polyData.getCellData().setScalars(cellColors);

    const { renderWindow, mapper, view } = makeScene(gc, polyData);
    mapper.setScalarVisibility(true);
    mapper.setScalarModeToUseCellData();
    mapper.setColorModeToDirectScalars();
    renderWindow.render();

    const colorMapColors = mapper.getColorMapColors();
    expect(colorMapColors.getNumberOfComponents()).toBe(4);
    expect(colorMapColors.getData().length).toBe(4);

    const bufferData = vi.spyOn(view.getContext(), 'bufferData');
    cellColors.setData(Uint8Array.from([40, 50, 60, 255]), 4);
    renderWindow.render();

    const colorUploads = bufferData.mock.calls
      .map(([, data]) => data)
      .filter(
        (data) =>
          data instanceof Uint8Array || data instanceof Uint8ClampedArray
      );
    expect(colorUploads).toHaveLength(1);
    expect(colorUploads[0].length).toBe(16);

    bufferData.mockRestore();
    gc.releaseResources();
  }
);
