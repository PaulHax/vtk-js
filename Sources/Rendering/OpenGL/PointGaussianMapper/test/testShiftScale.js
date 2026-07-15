import { it, expect, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';

function makePolyDataFromPoints(coords) {
  const polyData = vtkPolyData.newInstance();
  polyData.getPoints().setData(Float32Array.from(coords), 3);
  return polyData;
}

function updatePoints(polyData, coords) {
  polyData.getPoints().setData(Float32Array.from(coords), 3);
  polyData.getPoints().modified();
  polyData.modified();
}

function addRGB(polyData, values) {
  const rgb = vtkDataArray.newInstance({
    name: 'RGB',
    numberOfComponents: 3,
    values: Uint8Array.from(values),
  });
  polyData.getPointData().setScalars(rgb);
  return rgb;
}

function getActivePrimitiveCABOs(openGLRenderWindow, mapper) {
  const openGLMapper = openGLRenderWindow.getViewNodeFor(mapper);
  const primitives = openGLMapper.getReferenceByName('primitives');
  return primitives
    .map((primitive) => primitive.getCABO())
    .filter((cabo) => cabo.getElementCount() > 0);
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper enables VBO shift/scale for far points and clears it near the origin',
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
      makePolyDataFromPoints([10000000, 0, 0, 10000001, 0, 0])
    );
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
    openGLRenderWindow.setSize(1, 1);

    renderWindow.render();

    const shiftedCABOs = getActivePrimitiveCABOs(openGLRenderWindow, mapper);
    expect(shiftedCABOs.length, 'point VBO was built').toBe(1);
    expect(
      shiftedCABOs.every((cabo) => cabo.getCoordShiftAndScaleEnabled()),
      'far points enable shift/scale on the VBO'
    ).toBeTruthy();

    updatePoints(polyData, [-0.5, 0, 0, 0.5, 0, 0]);
    renderWindow.render();

    const unshiftedCABOs = getActivePrimitiveCABOs(openGLRenderWindow, mapper);
    expect(
      unshiftedCABOs.every((cabo) => !cabo.getCoordShiftAndScaleEnabled()),
      'VBO shift/scale is cleared once points no longer need it'
    ).toBeTruthy();

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper only rebuilds VBOs for point or color data',
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
      makePolyDataFromPoints([0, 0, 0, 1, 0, 0])
    );
    const rgb = gc.registerResource(addRGB(polyData, [255, 0, 0, 0, 255, 0]));
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

    const bufferData = vi.spyOn(openGLRenderWindow.getContext(), 'bufferData');
    const pointOrColorUploads = () =>
      bufferData.mock.calls.filter(
        ([, data]) => data.length === 6 || data.length === 8
      );
    const renderWithoutUpload = (change) => {
      change();
      renderWindow.render();
      expect(pointOrColorUploads()).toHaveLength(0);
    };

    renderWithoutUpload(() => actor.getProperty().setPointSize(9));
    renderWithoutUpload(() =>
      actor.setUserMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1])
    );
    renderWithoutUpload(() => actor.getProperty().setOpacity(0.5));
    renderWithoutUpload(() => mapper.setScaleFactor(2));
    renderWithoutUpload(() => mapper.setCircle(true));

    updatePoints(polyData, [0, 0, 0, 2, 0, 0]);
    renderWindow.render();
    expect(pointOrColorUploads()).toHaveLength(2);
    bufferData.mockClear();

    rgb.setData(Uint8Array.from([0, 0, 255, 255, 255, 0]), 3);
    renderWindow.render();
    expect(pointOrColorUploads()).toHaveLength(2);

    const pointCABO = getActivePrimitiveCABOs(openGLRenderWindow, mapper)[0];
    const colorHandle = pointCABO.getColorBO().getHandle();
    const deleteBuffer = vi.spyOn(
      openGLRenderWindow.getContext(),
      'deleteBuffer'
    );
    mapper.setScalarVisibility(false);
    renderWindow.render();
    expect(pointCABO.getColorBO()).toBeNull();
    expect(deleteBuffer.mock.calls.map(([handle]) => handle)).toContain(
      colorHandle
    );

    bufferData.mockRestore();
    deleteBuffer.mockRestore();
    gc.releaseResources();
  }
);
