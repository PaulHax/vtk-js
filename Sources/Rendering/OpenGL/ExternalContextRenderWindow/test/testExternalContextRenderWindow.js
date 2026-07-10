import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkConeSource from 'vtk.js/Sources/Filters/Sources/ConeSource';
import vtkPixelSpaceCallbackMapper from 'vtk.js/Sources/Rendering/Core/PixelSpaceCallbackMapper';
import vtkSphereSource from 'vtk.js/Sources/Filters/Sources/SphereSource';
import vtkCubeSource from 'vtk.js/Sources/Filters/Sources/CubeSource';
import vtkExternalContextRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/ExternalContextRenderWindow';
import { GET_UNDERLYING_CONTEXT } from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow/ContextProxy';
import createExternalContextWindow from './helpers';

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
  'Test external context render window honors layered renderer clear policies',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { gl, externalWindow, renderer, renderWindow } =
      createExternalContextWindow(gc);

    renderWindow.setNumberOfLayers(2);
    renderer.getActors()[0].setVisibility(false);
    renderer.setPreserveColorBuffer(true);
    renderer.setPreserveDepthBuffer(true);

    const overlayRenderer = gc.registerResource(vtkRenderer.newInstance());
    overlayRenderer.setLayer(1);
    overlayRenderer.setPreserveColorBuffer(true);
    overlayRenderer.setPreserveDepthBuffer(true);
    renderWindow.addRenderer(overlayRenderer);

    const overlayActor = gc.registerResource(vtkActor.newInstance());
    overlayActor.getProperty().setColor(1, 0, 0);
    overlayActor.getProperty().setAmbient(1);
    overlayActor.getProperty().setDiffuse(0);
    overlayRenderer.addActor(overlayActor);

    const overlayMapper = gc.registerResource(vtkMapper.newInstance());
    overlayActor.setMapper(overlayMapper);

    const overlaySource = gc.registerResource(vtkCubeSource.newInstance());
    overlayMapper.setInputConnection(overlaySource.getOutputPort());
    overlayRenderer.resetCamera();

    const seedHostFramebuffer = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.SCISSOR_TEST);
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.clearColor(0, 0, 1, 1);
      gl.clearDepth(0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.clear(gl.DEPTH_BUFFER_BIT);
    };
    const readPixel = (x, y) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return pixel;
    };
    const isBlue = (pixel) => pixel[2] > 200 && pixel[0] < 30 && pixel[1] < 30;
    const isRed = (pixel) => pixel[0] > 150 && pixel[1] < 80 && pixel[2] < 80;

    seedHostFramebuffer();
    externalWindow.renderExternal({ framebuffer: null });
    const preservedCenter = readPixel(200, 200);
    expect(
      isBlue(preservedCenter),
      `Preserved host depth occludes the overlay, got rgba(${preservedCenter.join(',')})`
    ).toBeTruthy();

    seedHostFramebuffer();
    overlayRenderer.setPreserveDepthBuffer(false);
    externalWindow.renderExternal({ framebuffer: null });
    const clearedCenter = readPixel(200, 200);
    expect(
      isRed(clearedCenter),
      `Overlay depth clear reveals its actor, got rgba(${clearedCenter.join(',')})`
    ).toBeTruthy();

    const preservedCorner = readPixel(10, 10);
    expect(
      isBlue(preservedCorner),
      `Both layers preserve host color outside the actor, got rgba(${preservedCorner.join(',')})`
    ).toBeTruthy();

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

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'Test external context render window defers re-entrant render requests',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { externalWindow, renderWindow, renderer } =
      createExternalContextWindow(gc);

    let hostRenderRequests = 0;
    externalWindow.setRenderCallback(() => {
      hostRenderRequests += 1;
    });

    // Fire a vtk render request from inside the in-progress external render:
    // a PixelSpaceCallbackMapper invokes its callback mid-traversal, standing
    // in for any observer that mutates state while a render is running.
    let requestedMidRender = false;
    const source = gc.registerResource(vtkConeSource.newInstance());
    const callbackMapper = gc.registerResource(
      vtkPixelSpaceCallbackMapper.newInstance()
    );
    callbackMapper.setInputConnection(source.getOutputPort());
    callbackMapper.setCallback(() => {
      if (!requestedMidRender) {
        requestedMidRender = true;
        renderWindow.render();
      }
    });
    const callbackActor = gc.registerResource(vtkActor.newInstance());
    callbackActor.setMapper(callbackMapper);
    renderer.addActor(callbackActor);

    externalWindow.renderExternal();
    expect(requestedMidRender, 'a render request fired mid-render').toBe(true);
    expect(
      hostRenderRequests,
      'the mid-render request is deferred and forwarded to the host once'
    ).toBe(1);

    externalWindow.renderExternal();
    expect(
      hostRenderRequests,
      'a render without mid-render requests forwards nothing'
    ).toBe(1);

    gc.releaseResources();
  }
);
