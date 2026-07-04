import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkConeSource from 'vtk.js/Sources/Filters/Sources/ConeSource';
import vtkSphereSource from 'vtk.js/Sources/Filters/Sources/SphereSource';
import vtkCubeSource from 'vtk.js/Sources/Filters/Sources/CubeSource';
import vtkExternalContextRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/ExternalContextRenderWindow';
import { GET_UNDERLYING_CONTEXT } from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow/ContextProxy';

import baseline from '../../../Core/RenderWindow/test/testMultipleRenderers.png';
import baseline2 from '../../../Core/RenderWindow/test/testMultipleRenderers2.png';

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'Test external context render window from existing context',
  () => {
    const gc = testUtils.createGarbageCollector();

    // Create some control UI
    const container = document.querySelector('body');
    const renderWindowContainer = gc.registerDOMElement(
      document.createElement('div')
    );
    container.appendChild(renderWindowContainer);

    // create what we will view
    const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());

    // Upper renderer
    const upperRenderer = gc.registerResource(vtkRenderer.newInstance());
    upperRenderer.setViewport(0, 0.5, 1, 1);
    renderWindow.addRenderer(upperRenderer);
    upperRenderer.setBackground(0.32, 0.34, 0.43);

    const coneActor = gc.registerResource(vtkActor.newInstance());
    upperRenderer.addActor(coneActor);

    const coneMapper = gc.registerResource(vtkMapper.newInstance());
    coneActor.setMapper(coneMapper);

    const coneSource = gc.registerResource(
      vtkConeSource.newInstance({ height: 1.0 })
    );
    coneMapper.setInputConnection(coneSource.getOutputPort());

    // Lower left renderer
    const lowerLeftRenderer = gc.registerResource(vtkRenderer.newInstance());
    lowerLeftRenderer.setViewport(0, 0, 0.5, 0.5);
    renderWindow.addRenderer(lowerLeftRenderer);
    lowerLeftRenderer.setBackground(0, 0.5, 0);

    const sphereActor = gc.registerResource(vtkActor.newInstance());
    lowerLeftRenderer.addActor(sphereActor);

    const sphereMapper = gc.registerResource(vtkMapper.newInstance());
    sphereActor.setMapper(sphereMapper);

    const sphereSource = gc.registerResource(vtkSphereSource.newInstance());
    sphereMapper.setInputConnection(sphereSource.getOutputPort());

    // Lower right renderer
    const lowerRightRenderer = gc.registerResource(vtkRenderer.newInstance());
    lowerRightRenderer.setViewport(0.5, 0, 1, 0.5);
    renderWindow.addRenderer(lowerRightRenderer);
    lowerRightRenderer.setBackground(0, 0, 0.5);

    const cubeActor = gc.registerResource(vtkActor.newInstance());
    lowerRightRenderer.addActor(cubeActor);

    const cubeMapper = gc.registerResource(vtkMapper.newInstance());
    cubeActor.setMapper(cubeMapper);

    const cubeSource = gc.registerResource(vtkCubeSource.newInstance());
    cubeMapper.setInputConnection(cubeSource.getOutputPort());

    const glWindow = gc.registerResource(renderWindow.newAPISpecificView());
    glWindow.setContainer(renderWindowContainer);
    renderWindow.addView(glWindow);
    glWindow.setSize(400, 400);

    // Force context creation on the OpenGL render window
    const glProxy = glWindow.get3DContext();
    const gl = glProxy?.[GET_UNDERLYING_CONTEXT]?.();
    expect(gl, 'Shared WebGL context created').toBeTruthy();

    const externalWindow = gc.registerResource(
      vtkExternalContextRenderWindow.createFromContext(glWindow.getCanvas(), gl)
    );
    externalWindow.setAutoClear(true);
    externalWindow.setSize(400, 400);

    renderWindow.removeView(glWindow);
    renderWindow.addView(externalWindow);

    upperRenderer.resetCamera();
    lowerLeftRenderer.resetCamera();
    lowerRightRenderer.resetCamera();

    const promise = externalWindow
      .captureNextImage()
      .then((image) =>
        testUtils.compareImages(
          image,
          [baseline, baseline2],
          'Rendering/OpenGL/ExternalContextRenderWindow/testExternalContextRenderWindow',
          5
        )
      )
      .finally(gc.releaseResources);
    externalWindow.renderExternal();
    return promise;
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'Test external context render window keeps vtkExternalContextRenderer local to its factory',
  () => {
    const gc = testUtils.createGarbageCollector();
    const container = document.querySelector('body');

    const sourceContainer = gc.registerDOMElement(
      document.createElement('div')
    );
    container.appendChild(sourceContainer);

    const sourceRenderWindow = gc.registerResource(
      vtkRenderWindow.newInstance()
    );
    const sourceRenderer = gc.registerResource(vtkRenderer.newInstance());
    sourceRenderWindow.addRenderer(sourceRenderer);

    const sourceGlWindow = gc.registerResource(
      sourceRenderWindow.newAPISpecificView()
    );
    sourceGlWindow.setContainer(sourceContainer);
    sourceRenderWindow.addView(sourceGlWindow);
    sourceGlWindow.setSize(200, 200);

    const sourceGlProxy = sourceGlWindow.get3DContext();
    const sourceGl = sourceGlProxy?.[GET_UNDERLYING_CONTEXT]?.();
    expect(sourceGl, 'Source window context created').toBeTruthy();

    const externalWindow = gc.registerResource(
      vtkExternalContextRenderWindow.createFromContext(
        sourceGlWindow.getCanvas(),
        sourceGl
      )
    );
    sourceRenderWindow.removeView(sourceGlWindow);
    sourceRenderWindow.addView(externalWindow);
    sourceRenderWindow.render();

    const sourceRendererNode = externalWindow.getViewNodeFor(sourceRenderer);
    expect(
      sourceRendererNode?.isA('vtkExternalContextRenderer'),
      'Shared window uses vtkExternalContextRenderer'
    ).toBeTruthy();

    const normalContainer = gc.registerDOMElement(
      document.createElement('div')
    );
    container.appendChild(normalContainer);

    const normalRenderWindow = gc.registerResource(
      vtkRenderWindow.newInstance()
    );
    const normalRenderer = gc.registerResource(vtkRenderer.newInstance());
    normalRenderWindow.addRenderer(normalRenderer);

    const normalGlWindow = gc.registerResource(
      normalRenderWindow.newAPISpecificView()
    );
    normalGlWindow.setContainer(normalContainer);
    normalRenderWindow.addView(normalGlWindow);
    normalGlWindow.setSize(200, 200);
    normalRenderWindow.render();

    const normalRendererNode = normalGlWindow.getViewNodeFor(normalRenderer);
    expect(
      normalRendererNode?.isA('vtkOpenGLRenderer'),
      'Normal window keeps vtkOpenGLRenderer'
    ).toBeTruthy();
    expect(
      normalRendererNode?.isA('vtkExternalContextRenderer'),
      'Normal window does not inherit vtkExternalContextRenderer'
    ).toBeFalsy();

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'Test external context render window rejects WebGL1 contexts',
  () => {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) {
      expect(true, 'WebGL1 unavailable in this environment').toBe(true);
      return;
    }

    expect(
      () => vtkExternalContextRenderWindow.createFromContext(canvas, gl),
      'createFromContext rejects WebGL1 contexts'
    ).toThrow(/WebGL2 context/);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'Test external context render window does not manage external canvas DOM state',
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

    const glWindow = gc.registerResource(renderWindow.newAPISpecificView());
    glWindow.setContainer(renderWindowContainer);
    renderWindow.addView(glWindow);
    glWindow.setSize(200, 200);

    const glProxy = glWindow.get3DContext();
    const gl = glProxy?.[GET_UNDERLYING_CONTEXT]?.();
    expect(gl, 'Shared WebGL context created').toBeTruthy();

    const canvas = glWindow.getCanvas();
    canvas.style.display = 'inline-block';
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;
    const originalDisplay = canvas.style.display;

    const externalWindow = gc.registerResource(
      vtkExternalContextRenderWindow.createFromContext(canvas, gl)
    );
    renderWindow.removeView(glWindow);
    renderWindow.addView(externalWindow);

    externalWindow.setSize(123, 77);
    externalWindow.setUseOffScreen(true);

    expect(canvas.width, 'External canvas width preserved').toBe(originalWidth);
    expect(canvas.height, 'External canvas height preserved').toBe(
      originalHeight
    );
    expect(canvas.style.display, 'External canvas display preserved').toBe(
      originalDisplay
    );

    const rejection = expect(
      externalWindow.captureNextImage('image/png', {
        size: [100, 100],
      }),
      'Resize capture rejects when canvas management is disabled'
    ).rejects.toThrow(/manageCanvas=true/);

    return rejection.finally(gc.releaseResources);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'Test external context render window redirects vtk render requests to the host',
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

    const glWindow = gc.registerResource(renderWindow.newAPISpecificView());
    glWindow.setContainer(renderWindowContainer);
    renderWindow.addView(glWindow);
    glWindow.setSize(200, 200);

    const glProxy = glWindow.get3DContext();
    const gl = glProxy?.[GET_UNDERLYING_CONTEXT]?.();
    expect(gl, 'Shared WebGL context created').toBeTruthy();

    const externalWindow = gc.registerResource(
      vtkExternalContextRenderWindow.createFromContext(glWindow.getCanvas(), gl)
    );
    renderWindow.removeView(glWindow);
    renderWindow.addView(externalWindow);

    let hostRenderRequests = 0;
    externalWindow.setRenderCallback(() => {
      hostRenderRequests += 1;
    });

    renderWindow.render();
    expect(
      hostRenderRequests,
      'renderWindow.render() is redirected to the host callback'
    ).toBe(1);

    externalWindow.renderExternal();
    expect(
      hostRenderRequests,
      'renderExternal() draws without re-entering the host callback'
    ).toBe(1);

    externalWindow.setRenderCallback(null);
    renderWindow.render();
    expect(
      hostRenderRequests,
      'clearing the callback restores direct rendering'
    ).toBe(1);

    gc.releaseResources();
  }
);
