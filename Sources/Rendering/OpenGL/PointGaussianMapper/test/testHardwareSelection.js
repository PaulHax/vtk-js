import { it, expect, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import { FieldAssociations } from 'vtk.js/Sources/Common/DataModel/DataSet/Constants';
import { PassTypes } from 'vtk.js/Sources/Rendering/OpenGL/HardwareSelector/Constants';

function makeScene() {
  const gc = testUtils.createGarbageCollector();
  const container = document.querySelector('body');
  const renderWindowContainer = gc.registerDOMElement(
    document.createElement('div')
  );
  container.appendChild(renderWindowContainer);

  const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
  const renderer = gc.registerResource(vtkRenderer.newInstance());
  renderWindow.addRenderer(renderer);

  const polyData = gc.registerResource(vtkPolyData.newInstance());
  polyData.getPoints().setData(Float32Array.from([0, 0, 0]), 3);
  const mapper = gc.registerResource(vtkPointGaussianMapper.newInstance());
  const actor = gc.registerResource(vtkActor.newInstance());
  mapper.setInputData(polyData);
  mapper.setScalarVisibility(false);
  actor.setMapper(mapper);
  actor.getProperty().setPointSize(20);
  renderer.addActor(actor);
  renderer.resetCamera();

  const openGLRenderWindow = gc.registerResource(
    renderWindow.newAPISpecificView()
  );
  openGLRenderWindow.setContainer(renderWindowContainer);
  openGLRenderWindow.setSize(50, 50);
  renderWindow.addView(openGLRenderWindow);
  renderWindow.render();

  return {
    actor,
    gc,
    mapper,
    openGLMapper: openGLRenderWindow.getViewNodeFor(mapper),
    openGLRenderWindow,
    polyData,
    renderer,
  };
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper selects direct point ids and schedules the high-id pass',
  async () => {
    const scene = makeScene();
    const selector = scene.openGLRenderWindow.getSelector();
    selector.setFieldAssociation(FieldAssociations.FIELD_ASSOCIATION_POINTS);

    const selection = await selector.selectAsync(
      scene.renderer,
      24,
      24,
      26,
      26
    );
    expect(selection).toHaveLength(1);
    expect(selection[0].getProperties().attributeID).toBe(0);

    const originalPoints = scene.polyData.getPoints();
    scene.polyData.setPoints({
      getNumberOfPoints: () => 0x01000000 + 1,
    });
    const openGLRenderer = scene.openGLRenderWindow.getViewNodeFor(
      scene.renderer
    );
    openGLRenderer.setSelector(selector);
    scene.openGLMapper.updateMaximumPointCellIds();
    openGLRenderer.setSelector(null);
    expect(selector.getMaximumPointId()).toBe(0x01000000);
    expect(selector.passRequired(PassTypes.ID_HIGH24)).toBe(true);

    scene.mapper.setMaximumPointCount(7);
    openGLRenderer.setSelector(selector);
    scene.openGLMapper.updateMaximumPointCellIds();
    openGLRenderer.setSelector(null);
    expect(selector.getMaximumPointId()).toBe(6);
    expect(selector.passRequired(PassTypes.ID_HIGH24)).toBe(false);
    scene.polyData.setPoints(originalPoints);

    scene.gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper has no topology-free cell selection',
  async () => {
    const scene = makeScene();
    const selector = scene.openGLRenderWindow.getSelector();
    selector.setFieldAssociation(FieldAssociations.FIELD_ASSOCIATION_CELLS);

    await expect(
      selector.selectAsync(scene.renderer, 24, 24, 26, 26)
    ).resolves.toEqual([]);

    scene.gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper round splats select only their visible disc',
  async () => {
    const scene = makeScene();
    scene.mapper.setCircle(true);
    scene.openGLRenderWindow
      .getSelector()
      .setFieldAssociation(FieldAssociations.FIELD_ASSOCIATION_POINTS);

    await expect(
      scene.openGLRenderWindow
        .getSelector()
        .selectAsync(scene.renderer, 24, 24, 26, 26)
    ).resolves.toHaveLength(1);
    await expect(
      scene.openGLRenderWindow
        .getSelector()
        .selectAsync(scene.renderer, 16, 16, 16, 16)
    ).resolves.toEqual([]);

    scene.gc.releaseResources();
  }
);
