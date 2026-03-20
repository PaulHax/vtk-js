import macro from 'vtk.js/Sources/macros';
import { extend as extendOpenGLRenderWindow } from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import { createContextProxyHandler } from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow/ContextProxy';
import { registerOverride } from 'vtk.js/Sources/Rendering/OpenGL/ViewNodeFactory';
import vtkSharedRenderer from 'vtk.js/Sources/Rendering/OpenGL/SharedRenderer';

const TEXTURE_BINDING_STATE = [
  ['texture2D', 'TEXTURE_BINDING_2D', 'TEXTURE_2D'],
  ['textureCubeMap', 'TEXTURE_BINDING_CUBE_MAP', 'TEXTURE_CUBE_MAP'],
  ['texture3D', 'TEXTURE_BINDING_3D', 'TEXTURE_3D'],
  ['texture2DArray', 'TEXTURE_BINDING_2D_ARRAY', 'TEXTURE_2D_ARRAY'],
];

const BUFFER_BINDING_STATE = [
  ['arrayBufferBinding', 'ARRAY_BUFFER_BINDING', 'ARRAY_BUFFER'],
  [
    'elementArrayBufferBinding',
    'ELEMENT_ARRAY_BUFFER_BINDING',
    'ELEMENT_ARRAY_BUFFER',
  ],
];

const PIXEL_STORE_STATE = [
  ['packAlignment', 'PACK_ALIGNMENT', 4],
  ['unpackAlignment', 'UNPACK_ALIGNMENT', 4],
  ['unpackFlipY', 'UNPACK_FLIP_Y_WEBGL', false],
  ['unpackPremultiplyAlpha', 'UNPACK_PREMULTIPLY_ALPHA_WEBGL', false],
  [
    'unpackColorspaceConversion',
    'UNPACK_COLORSPACE_CONVERSION_WEBGL',
    'BROWSER_DEFAULT_WEBGL',
  ],
  ['packRowLength', 'PACK_ROW_LENGTH', 0],
  ['packSkipRows', 'PACK_SKIP_ROWS', 0],
  ['packSkipPixels', 'PACK_SKIP_PIXELS', 0],
  ['unpackRowLength', 'UNPACK_ROW_LENGTH', 0],
  ['unpackImageHeight', 'UNPACK_IMAGE_HEIGHT', 0],
  ['unpackSkipRows', 'UNPACK_SKIP_ROWS', 0],
  ['unpackSkipPixels', 'UNPACK_SKIP_PIXELS', 0],
  ['unpackSkipImages', 'UNPACK_SKIP_IMAGES', 0],
];

function getSupportedState(gl, stateSpecs) {
  return stateSpecs.filter(([, valueName]) => gl[valueName] !== undefined);
}

function resetGLState(gl, shaderCache) {
  const pixelStoreState = getSupportedState(gl, PIXEL_STORE_STATE);

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

  pixelStoreState.forEach(([, paramName, defaultValue]) => {
    const value =
      typeof defaultValue === 'string' ? gl[defaultValue] : defaultValue;
    gl.pixelStorei(gl[paramName], value);
  });

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (gl.DRAW_FRAMEBUFFER) {
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }
  if (gl.bindRenderbuffer) {
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
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

function saveGLState(gl) {
  const bufferBindingState = getSupportedState(gl, BUFFER_BINDING_STATE);
  const pixelStoreState = getSupportedState(gl, PIXEL_STORE_STATE);
  const textureBindingState = getSupportedState(gl, TEXTURE_BINDING_STATE);
  const state = {
    blend: gl.isEnabled(gl.BLEND),
    cullFace: gl.isEnabled(gl.CULL_FACE),
    depthTest: gl.isEnabled(gl.DEPTH_TEST),
    polygonOffsetFill: gl.isEnabled(gl.POLYGON_OFFSET_FILL),
    scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
    stencilTest: gl.isEnabled(gl.STENCIL_TEST),

    blendEquationRgb: gl.getParameter(gl.BLEND_EQUATION_RGB),
    blendEquationAlpha: gl.getParameter(gl.BLEND_EQUATION_ALPHA),
    blendSrcRgb: gl.getParameter(gl.BLEND_SRC_RGB),
    blendDstRgb: gl.getParameter(gl.BLEND_DST_RGB),
    blendSrcAlpha: gl.getParameter(gl.BLEND_SRC_ALPHA),
    blendDstAlpha: gl.getParameter(gl.BLEND_DST_ALPHA),
    blendColor: gl.getParameter(gl.BLEND_COLOR),

    colorMask: gl.getParameter(gl.COLOR_WRITEMASK),
    clearColor: gl.getParameter(gl.COLOR_CLEAR_VALUE),

    depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
    depthFunc: gl.getParameter(gl.DEPTH_FUNC),
    clearDepth: gl.getParameter(gl.DEPTH_CLEAR_VALUE),

    stencilFunc: gl.getParameter(gl.STENCIL_FUNC),
    stencilRef: gl.getParameter(gl.STENCIL_REF),
    stencilValueMask: gl.getParameter(gl.STENCIL_VALUE_MASK),
    stencilFail: gl.getParameter(gl.STENCIL_FAIL),
    stencilPassDepthFail: gl.getParameter(gl.STENCIL_PASS_DEPTH_FAIL),
    stencilPassDepthPass: gl.getParameter(gl.STENCIL_PASS_DEPTH_PASS),
    stencilMask: gl.getParameter(gl.STENCIL_WRITEMASK),
    clearStencil: gl.getParameter(gl.STENCIL_CLEAR_VALUE),

    stencilBackFunc: gl.getParameter(gl.STENCIL_BACK_FUNC),
    stencilBackRef: gl.getParameter(gl.STENCIL_BACK_REF),
    stencilBackValueMask: gl.getParameter(gl.STENCIL_BACK_VALUE_MASK),
    stencilBackFail: gl.getParameter(gl.STENCIL_BACK_FAIL),
    stencilBackPassDepthFail: gl.getParameter(gl.STENCIL_BACK_PASS_DEPTH_FAIL),
    stencilBackPassDepthPass: gl.getParameter(gl.STENCIL_BACK_PASS_DEPTH_PASS),
    stencilBackMask: gl.getParameter(gl.STENCIL_BACK_WRITEMASK),

    cullFaceMode: gl.getParameter(gl.CULL_FACE_MODE),
    frontFace: gl.getParameter(gl.FRONT_FACE),

    polygonOffsetFactor: gl.getParameter(gl.POLYGON_OFFSET_FACTOR),
    polygonOffsetUnits: gl.getParameter(gl.POLYGON_OFFSET_UNITS),

    activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),

    framebufferBinding: gl.getParameter(gl.FRAMEBUFFER_BINDING),
    renderbufferBinding: gl.getParameter(gl.RENDERBUFFER_BINDING),

    currentProgram: gl.getParameter(gl.CURRENT_PROGRAM),
    lineWidth: gl.getParameter(gl.LINE_WIDTH),

    scissorBox: gl.getParameter(gl.SCISSOR_BOX),
    viewport: gl.getParameter(gl.VIEWPORT),
    textureBindings: [],
  };

  bufferBindingState.forEach(([stateKey, paramName]) => {
    state[stateKey] = gl.getParameter(gl[paramName]);
  });

  pixelStoreState.forEach(([stateKey, paramName]) => {
    state[stateKey] = gl.getParameter(gl[paramName]);
  });

  const textureUnitCount = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
  for (let unit = 0; unit < textureUnitCount; unit += 1) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    const unitBindings = {};
    textureBindingState.forEach(([stateKey, bindingName]) => {
      unitBindings[stateKey] = gl.getParameter(gl[bindingName]);
    });
    state.textureBindings.push(unitBindings);
  }
  gl.activeTexture(state.activeTexture);

  if (gl.SAMPLE_ALPHA_TO_COVERAGE) {
    state.sampleAlphaToCoverage = gl.isEnabled(gl.SAMPLE_ALPHA_TO_COVERAGE);
  }
  if (gl.DRAW_FRAMEBUFFER) {
    state.drawFramebufferBinding = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    state.readFramebufferBinding = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  }
  if (gl.bindVertexArray) {
    state.vertexArrayBinding = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  }

  return state;
}

function restoreGLState(gl, state) {
  const bufferBindingState = getSupportedState(gl, BUFFER_BINDING_STATE);
  const pixelStoreState = getSupportedState(gl, PIXEL_STORE_STATE);
  const textureBindingState = getSupportedState(gl, TEXTURE_BINDING_STATE);
  const setFlag = (flag, enabled) => {
    if (enabled) gl.enable(flag);
    else gl.disable(flag);
  };

  setFlag(gl.BLEND, state.blend);
  setFlag(gl.CULL_FACE, state.cullFace);
  setFlag(gl.DEPTH_TEST, state.depthTest);
  setFlag(gl.POLYGON_OFFSET_FILL, state.polygonOffsetFill);
  setFlag(gl.SCISSOR_TEST, state.scissorTest);
  setFlag(gl.STENCIL_TEST, state.stencilTest);
  if (gl.SAMPLE_ALPHA_TO_COVERAGE && state.sampleAlphaToCoverage != null) {
    setFlag(gl.SAMPLE_ALPHA_TO_COVERAGE, state.sampleAlphaToCoverage);
  }

  gl.blendEquationSeparate(state.blendEquationRgb, state.blendEquationAlpha);
  gl.blendFuncSeparate(
    state.blendSrcRgb,
    state.blendDstRgb,
    state.blendSrcAlpha,
    state.blendDstAlpha
  );
  const bc = state.blendColor;
  gl.blendColor(bc[0], bc[1], bc[2], bc[3]);

  const cm = state.colorMask;
  gl.colorMask(cm[0], cm[1], cm[2], cm[3]);
  const cc = state.clearColor;
  gl.clearColor(cc[0], cc[1], cc[2], cc[3]);

  gl.depthMask(state.depthMask);
  gl.depthFunc(state.depthFunc);
  gl.clearDepth(state.clearDepth);

  gl.stencilFuncSeparate(
    gl.FRONT,
    state.stencilFunc,
    state.stencilRef,
    state.stencilValueMask
  );
  gl.stencilFuncSeparate(
    gl.BACK,
    state.stencilBackFunc,
    state.stencilBackRef,
    state.stencilBackValueMask
  );
  gl.stencilOpSeparate(
    gl.FRONT,
    state.stencilFail,
    state.stencilPassDepthFail,
    state.stencilPassDepthPass
  );
  gl.stencilOpSeparate(
    gl.BACK,
    state.stencilBackFail,
    state.stencilBackPassDepthFail,
    state.stencilBackPassDepthPass
  );
  gl.stencilMaskSeparate(gl.FRONT, state.stencilMask);
  gl.stencilMaskSeparate(gl.BACK, state.stencilBackMask);
  gl.clearStencil(state.clearStencil);

  gl.cullFace(state.cullFaceMode);
  gl.frontFace(state.frontFace);

  gl.polygonOffset(state.polygonOffsetFactor, state.polygonOffsetUnits);

  if (gl.DRAW_FRAMEBUFFER && state.drawFramebufferBinding !== undefined) {
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, state.drawFramebufferBinding);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.readFramebufferBinding);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebufferBinding);
  }
  if (gl.bindRenderbuffer && state.renderbufferBinding !== undefined) {
    gl.bindRenderbuffer(gl.RENDERBUFFER, state.renderbufferBinding);
  }

  gl.useProgram(state.currentProgram);
  gl.lineWidth(state.lineWidth);

  const sb = state.scissorBox;
  gl.scissor(sb[0], sb[1], sb[2], sb[3]);
  const vp = state.viewport;
  gl.viewport(vp[0], vp[1], vp[2], vp[3]);

  if (gl.bindVertexArray && state.vertexArrayBinding !== undefined) {
    gl.bindVertexArray(state.vertexArrayBinding);
  }

  bufferBindingState.forEach(([stateKey, , targetName]) => {
    if (state[stateKey] !== undefined) {
      gl.bindBuffer(gl[targetName], state[stateKey]);
    }
  });

  if (state.textureBindings?.length) {
    state.textureBindings.forEach((unitBindings, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      textureBindingState.forEach(([stateKey, , targetName]) => {
        gl.bindTexture(gl[targetName], unitBindings[stateKey]);
      });
    });
  }
  gl.activeTexture(state.activeTexture);

  pixelStoreState.forEach(([stateKey, paramName]) => {
    if (state[stateKey] !== undefined) {
      gl.pixelStorei(gl[paramName], state[stateKey]);
    }
  });
}

function vtkSharedRenderWindow(publicAPI, model) {
  model.classHierarchy.push('vtkSharedRenderWindow');
  let renderEventSubscription = null;
  let renderCallback = null;
  let suppressRenderEvent = false;
  let savedEnableRender = null;
  let savedHostState = null;
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
    try {
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
        try {
          model.renderable.preRender?.();
          if (interactor) {
            interactor.render();
          } else {
            const views = model.renderable.getViews?.() || [];
            views.forEach((view) => view.traverseAllPasses());
          }
        } finally {
          suppressRenderEvent = false;
          if (
            interactor?.setEnableRender &&
            previousEnableRender !== undefined
          ) {
            interactor.setEnableRender(previousEnableRender);
          }
        }
      }
    } finally {
      publicAPI.restoreSharedState();
    }
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

    savedHostState = saveGLState(gl);
    resetGLState(gl, publicAPI.getShaderCache());
  };

  publicAPI.restoreSharedState = () => {
    const gl = model.context;
    if (!gl || !savedHostState) return;

    restoreGLState(gl, savedHostState);
    savedHostState = null;

    const shaderCache = publicAPI.getShaderCache();
    if (shaderCache) {
      shaderCache.setLastShaderProgramBound(null);
    }
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
