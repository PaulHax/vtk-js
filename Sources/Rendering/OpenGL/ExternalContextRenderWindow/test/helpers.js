import { expect } from 'vitest';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkConeSource from 'vtk.js/Sources/Filters/Sources/ConeSource';
import vtkExternalContextRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/ExternalContextRenderWindow';
import { GET_UNDERLYING_CONTEXT } from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow/ContextProxy';

/**
 * A stock vtk.js render window whose OpenGL view owns a real WebGL2 context.
 * It stands in for the host library that owns the context in production: the
 * external-context window is built from its canvas and gl, and the view is
 * swapped out so vtk.js no longer manages either.
 */
export function createHostContext(gc, { width = 400, height = 400 } = {}) {
  const renderWindowContainer = gc.registerDOMElement(
    document.createElement('div')
  );
  document.querySelector('body').appendChild(renderWindowContainer);

  const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
  const renderer = gc.registerResource(vtkRenderer.newInstance());
  renderWindow.addRenderer(renderer);

  const glWindow = gc.registerResource(renderWindow.newAPISpecificView());
  glWindow.setContainer(renderWindowContainer);
  renderWindow.addView(glWindow);
  glWindow.setSize(width, height);

  const gl = glWindow.get3DContext()?.[GET_UNDERLYING_CONTEXT]?.();
  expect(gl, 'WebGL context created').toBeTruthy();

  return { gl, glWindow, renderer, renderWindow };
}

export function attachExternalWindow(gc, { gl, glWindow, renderWindow }) {
  const externalWindow = gc.registerResource(
    vtkExternalContextRenderWindow.createFromContext(glWindow.getCanvas(), gl)
  );
  renderWindow.removeView(glWindow);
  renderWindow.addView(externalWindow);
  return externalWindow;
}

export default function createExternalContextWindow(
  gc,
  { width = 400, height = 400, background = [0.2, 0.3, 0.4] } = {}
) {
  const host = createHostContext(gc, { width, height });
  const { gl, renderer, renderWindow } = host;
  renderer.setBackground(...background);

  const actor = gc.registerResource(vtkActor.newInstance());
  renderer.addActor(actor);
  const mapper = gc.registerResource(vtkMapper.newInstance());
  actor.setMapper(mapper);
  const cone = gc.registerResource(vtkConeSource.newInstance());
  mapper.setInputConnection(cone.getOutputPort());

  const externalWindow = attachExternalWindow(gc, host);
  externalWindow.setAutoClear(true);
  externalWindow.setSize(width, height);
  renderer.resetCamera();

  return { gl, externalWindow, renderer, renderWindow };
}
