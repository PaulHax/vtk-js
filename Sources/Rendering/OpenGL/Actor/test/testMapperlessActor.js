import { expect, it } from 'vitest';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'renders a mapperless actor as an inert prop',
  () => {
    const gc = testUtils.createGarbageCollector();
    const container = gc.registerDOMElement(document.createElement('div'));
    document.body.appendChild(container);

    const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
    const renderer = gc.registerResource(vtkRenderer.newInstance());
    const view = gc.registerResource(vtkOpenGLRenderWindow.newInstance());
    const actor = gc.registerResource(vtkActor.newInstance());

    renderWindow.addRenderer(renderer);
    renderWindow.addView(view);
    view.setContainer(container);
    view.setSize(32, 32);
    renderer.addActor(actor);

    expect(actor.getMapper()).toBeNull();
    expect(() => renderWindow.render()).not.toThrow();

    gc.releaseResources();
  }
);
