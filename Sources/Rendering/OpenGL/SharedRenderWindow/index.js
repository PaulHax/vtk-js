import macro from 'vtk.js/Sources/macros';
import { extend as extendOpenGLRenderWindow } from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import { createContextProxyHandler } from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow/ContextProxy';
import { registerOverride } from 'vtk.js/Sources/Rendering/OpenGL/ViewNodeFactory';
import vtkSharedRenderer from 'vtk.js/Sources/Rendering/OpenGL/SharedRenderer';

function resetGLState(gl, shaderCache) {
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.STENCIL_TEST);
  if (gl.SAMPLE_ALPHA_TO_COVERAGE) {
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  }

  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ZERO);
  gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ZERO);
  gl.blendColor(0, 0, 0, 0);

  gl.colorMask(true, true, true, true);
  gl.clearColor(0, 0, 0, 0);

  gl.depthMask(true);
  gl.depthFunc(gl.LESS);
  gl.clearDepth(1);

  gl.stencilMask(0xffffffff);
  gl.stencilFunc(gl.ALWAYS, 0, 0xffffffff);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  gl.clearStencil(0);

  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);

  gl.polygonOffset(0, 0);

  gl.activeTexture(gl.TEXTURE0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (gl.DRAW_FRAMEBUFFER) {
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }

  gl.useProgram(null);

  gl.lineWidth(1);

  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  gl.scissor(0, 0, width, height);
  gl.viewport(0, 0, width, height);

  if (gl.bindVertexArray) {
    gl.bindVertexArray(null);
  }

  if (shaderCache) {
    shaderCache.setLastShaderProgramBound(null);
  }
}

function vtkSharedRenderWindow(publicAPI, model) {
  model.classHierarchy.push('vtkSharedRenderWindow');
  let renderEventSubscription = null;
  let renderCallback = null;
  let suppressRenderEvent = false;
  let savedEnableRender = null;
  const superGet3DContext = publicAPI.get3DContext;
  let cachingContextHandler;

  function getCachingContextHandler() {
    if (!cachingContextHandler) {
      cachingContextHandler = createContextProxyHandler();
    }
    return cachingContextHandler;
  }

  function getInteractor() {
    return model.renderable?.getInteractor?.();
  }

  function clearRenderEventSubscription() {
    if (renderEventSubscription) {
      renderEventSubscription.unsubscribe();
      renderEventSubscription = null;
    }
  }

  function bindRenderEvent(interactor) {
    if (!interactor?.onRenderEvent || !renderCallback) {
      return;
    }

    renderEventSubscription = interactor.onRenderEvent(() => {
      if (!suppressRenderEvent) {
        renderCallback?.();
      }
    });
  }

  publicAPI.renderShared = (options = {}) => {
    publicAPI.prepareSharedRender(options);
    if (model.renderable) {
      if (renderCallback && !renderEventSubscription) {
        publicAPI.setRenderCallback(renderCallback);
      }

      const interactor = getInteractor();
      let previousEnableRender;
      if (interactor?.getEnableRender) {
        previousEnableRender = interactor.getEnableRender();
        if (!previousEnableRender) {
          interactor.setEnableRender(true);
        }
      }

      suppressRenderEvent = true;
      model.renderable.preRender?.();
      if (interactor) {
        interactor.render();
      } else {
        const views = model.renderable.getViews?.() || [];
        views.forEach((view) => view.traverseAllPasses());
      }
      suppressRenderEvent = false;

      if (interactor?.setEnableRender && previousEnableRender !== undefined) {
        interactor.setEnableRender(previousEnableRender);
      }
    }
    publicAPI.restoreSharedState();
  };

  publicAPI.get3DContext = (options) => {
    if (model.context) {
      model.webgl2 = model.context instanceof WebGL2RenderingContext;
      return new Proxy(model.context, getCachingContextHandler());
    }
    return superGet3DContext(options);
  };

  /**
   * Sync internal size state from the canvas's actual drawing buffer dimensions.
   * Use this when sharing a WebGL context with another library (like MapLibre)
   * that manages the canvas size. Returns true if size changed.
   */
  publicAPI.syncSizeFromCanvas = () => {
    if (!model.context) return false;
    const width = model.context.drawingBufferWidth;
    const height = model.context.drawingBufferHeight;
    return publicAPI.setSize(width, height);
  };

  /**
   * Prepare for rendering when sharing a WebGL context with another library.
   * Call this before renderWindow.render() to reset shader cache state that
   * may have been modified by the other library. Also syncs size from canvas.
   */
  publicAPI.prepareExternalRender = () => {
    publicAPI.syncSizeFromCanvas();
    // Unbind any shader from the external library so VTK binds its own
    const gl = model.context;
    if (gl) {
      gl.useProgram(null);
    }
    // Reset shader cache so VTK rebinds its shaders
    const shaderCache = publicAPI.getShaderCache();
    if (shaderCache) {
      shaderCache.setLastShaderProgramBound(null);
    }
  };

  publicAPI.prepareSharedRender = () => {
    publicAPI.syncSizeFromCanvas();
    const gl = model.context;
    if (!gl) return;

    resetGLState(gl, publicAPI.getShaderCache());
  };

  publicAPI.restoreSharedState = () => {
    const gl = model.context;
    if (!gl) return;

    resetGLState(gl, publicAPI.getShaderCache());
  };

  publicAPI.setRenderCallback = (callback) => {
    renderCallback = callback || null;
    clearRenderEventSubscription();

    const interactor = getInteractor();
    if (renderCallback && interactor?.onRenderEvent) {
      // Render requests flow through the interactor RenderEvent; redirect those
      // to the host render loop while keeping draw calls inside renderShared().
      if (savedEnableRender === null && interactor.getEnableRender) {
        savedEnableRender = interactor.getEnableRender();
      }
      interactor?.setEnableRender?.(false);
      bindRenderEvent(interactor);
      return;
    }

    if (!renderCallback && interactor && savedEnableRender !== null) {
      interactor.setEnableRender?.(savedEnableRender);
      savedEnableRender = null;
    }
  };
}

const DEFAULT_VALUES = {
  autoClear: false,
  autoClearColor: true,
  autoClearDepth: true,
  useExternalCanvas: true,
};

export function extend(publicAPI, model, initialValues = {}) {
  const mergedValues = { ...DEFAULT_VALUES, ...initialValues };
  extendOpenGLRenderWindow(publicAPI, model, mergedValues);
  macro.setGet(publicAPI, model, [
    'autoClear',
    'autoClearColor',
    'autoClearDepth',
    'useExternalCanvas',
  ]);
  vtkSharedRenderWindow(publicAPI, model);
  registerOverride('vtkRenderer', vtkSharedRenderer.newInstance);
}

export const newInstance = macro.newInstance(extend, 'vtkSharedRenderWindow');

export function createFromContext(canvas, gl, options = {}) {
  return newInstance({ canvas, context: gl, ...options });
}

export default { newInstance, extend, createFromContext };
