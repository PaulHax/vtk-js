import macro from 'vtk.js/Sources/macros';
import { extend as extendOpenGLRenderWindow } from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import vtkExternalContextRenderer from 'vtk.js/Sources/Rendering/OpenGL/ExternalContextRenderer';

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

// Supported pixel-store params and MAX_DRAW_BUFFERS never change for a given
// context; resetGLState runs in the host's render loop, so compute them once.
const contextConstantsCache = new WeakMap();

function getContextConstants(gl) {
  let constants = contextConstantsCache.get(gl);
  if (!constants) {
    constants = {
      pixelStoreState: PIXEL_STORE_STATE.filter(
        ([, valueName]) => gl[valueName] !== undefined
      ),
      maxDrawBuffers: gl.drawBuffers ? gl.getParameter(gl.MAX_DRAW_BUFFERS) : 0,
    };
    contextConstantsCache.set(gl, constants);
  }
  return constants;
}

function isWebGL2Context(gl) {
  return (
    typeof WebGL2RenderingContext !== 'undefined' &&
    gl instanceof WebGL2RenderingContext
  );
}

function getDefaultDrawBuffers(gl, framebuffer, max) {
  if (!framebuffer) return [gl.BACK];
  const buffers = [];
  for (let i = 0; i < max; i += 1) {
    buffers.push(gl.getParameter(gl.DRAW_BUFFER0 + i));
  }
  // gl.drawBuffers requires bufs[i] to be NONE or COLOR_ATTACHMENTi, so
  // dropping a NONE in the middle of the array would shift later attachments
  // to the wrong slots. Trim trailing NONEs only.
  while (buffers.length > 1 && buffers[buffers.length - 1] === gl.NONE) {
    buffers.pop();
  }
  return buffers[0] === gl.NONE ? [gl.COLOR_ATTACHMENT0] : buffers;
}

function applyVTKRenderDefaults(gl) {
  gl.blendFuncSeparate(
    gl.SRC_ALPHA,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA
  );
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
}

function resetGLState(gl, shaderCache, hostState) {
  const { pixelStoreState, maxDrawBuffers } = getContextConstants(gl);
  // Every gl.getParameter is a synchronous CPU/GPU sync point that stalls the
  // calling thread until prior GPU work drains. A host that declares its
  // framebuffer binding (and, for FBO targets, its draw-buffer list) makes
  // this reset — and thus the whole render — free of GL readbacks.
  const framebuffer =
    hostState && 'framebuffer' in hostState
      ? hostState.framebuffer
      : gl.getParameter(gl.FRAMEBUFFER_BINDING);

  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.STENCIL_TEST);
  if (gl.SAMPLE_ALPHA_TO_COVERAGE) {
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  }
  // Hosts using transform feedback can leave RASTERIZER_DISCARD enabled,
  // which silently produces blank vtk frames. Force-clear it.
  gl.disable(gl.RASTERIZER_DISCARD);
  // Reset SAMPLE_COVERAGE — a non-default value would cull vtk fragments in
  // multisampled contexts.
  gl.disable(gl.SAMPLE_COVERAGE);
  gl.sampleCoverage(1, false);

  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ZERO);
  gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ZERO);
  gl.blendColor(0, 0, 0, 0);

  gl.colorMask(true, true, true, true);
  gl.clearColor(0, 0, 0, 0);

  gl.depthMask(true);
  gl.depthFunc(gl.LESS);
  gl.clearDepth(1);
  gl.depthRange(0, 1);

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

  if (gl.bindRenderbuffer) {
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  // Unbind PBOs. A bound PIXEL_UNPACK_BUFFER turns texImage2D's data argument
  // into a buffer offset (silent corruption); a bound PIXEL_PACK_BUFFER
  // routes readPixels into the buffer instead of returning data.
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);

  // Reset readBuffer to the default for the bound framebuffer.
  gl.readBuffer(framebuffer ? gl.COLOR_ATTACHMENT0 : gl.BACK);

  gl.useProgram(null);

  gl.lineWidth(1);

  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  gl.scissor(0, 0, width, height);
  gl.viewport(0, 0, width, height);

  if (gl.bindVertexArray) {
    gl.bindVertexArray(null);
  }

  if (gl.drawBuffers) {
    gl.drawBuffers(
      hostState?.drawBuffers ??
        getDefaultDrawBuffers(gl, framebuffer, maxDrawBuffers)
    );
  }

  applyVTKRenderDefaults(gl);

  if (shaderCache) {
    shaderCache.setLastShaderProgramBound(null);
  }
}

function vtkExternalContextRenderWindow(publicAPI, model) {
  model.classHierarchy.push('vtkExternalContextRenderWindow');

  publicAPI
    .getViewNodeFactory()
    .registerOverride('vtkRenderer', vtkExternalContextRenderer.newInstance);

  let renderCallback = null;
  let inExternalRender = false;
  let renderRequestedDuringExternal = false;
  const superGet3DContext = publicAPI.get3DContext;
  const superTraverseAllPasses = publicAPI.traverseAllPasses;

  // Every vtk-side render request — interactor forceRender, widget updates,
  // renderWindow.render() — reaches this view as a traverseAllPasses call.
  // Redirecting here (rather than at the interactor RenderEvent) keeps all
  // external-context draws inside renderExternal() with or without an interactor.
  //
  // A request that arrives while renderExternal is drawing must not start a
  // nested render pass, and bouncing it straight to the host would schedule
  // a redundant repaint of the frame being painted right now. Defer it: at
  // most one deferred request is forwarded to the host after the in-progress
  // render completes.
  publicAPI.traverseAllPasses = () => {
    if (inExternalRender) {
      renderRequestedDuringExternal = true;
      return;
    }
    if (renderCallback) {
      renderCallback();
      return;
    }
    superTraverseAllPasses();
  };

  publicAPI.setRenderCallback = (callback) => {
    renderCallback = callback || null;
  };

  publicAPI.renderExternal = (hostState) => {
    publicAPI.prepareExternalRender(hostState);
    inExternalRender = true;
    renderRequestedDuringExternal = false;
    try {
      if (model.renderable) {
        model.renderable.preRender?.();
        superTraverseAllPasses();
      }
    } finally {
      inExternalRender = false;
      const shaderCache = publicAPI.getShaderCache();
      if (shaderCache) {
        shaderCache.setLastShaderProgramBound(null);
      }
      if (renderRequestedDuringExternal) {
        renderRequestedDuringExternal = false;
        renderCallback?.();
      }
    }
  };

  publicAPI.get3DContext = (options) => {
    if (model.context) {
      return model.context;
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

  publicAPI.prepareExternalRender = (hostState) => {
    publicAPI.syncSizeFromCanvas();
    const gl = model.context;
    if (!gl) return;
    resetGLState(gl, publicAPI.getShaderCache(), hostState);
    // Seed the JS-side framebuffer-binding tracker (when the base render
    // window provides one) so vtk's internal FBO save/restore also runs
    // without readbacks.
    if (hostState && 'framebuffer' in hostState) {
      publicAPI.setFramebufferBinding?.(hostState.framebuffer);
    }
  };

  publicAPI.delete = macro.chain(() => {
    renderCallback = null;
  }, publicAPI.delete);
}

const DEFAULT_VALUES = {
  autoClear: false,
};

export function extend(publicAPI, model, initialValues = {}) {
  const mergedValues = { ...DEFAULT_VALUES, ...initialValues };
  extendOpenGLRenderWindow(publicAPI, model, mergedValues);
  macro.setGet(publicAPI, model, ['autoClear']);
  vtkExternalContextRenderWindow(publicAPI, model);
}

export const newInstance = macro.newInstance(
  extend,
  'vtkExternalContextRenderWindow'
);

export function createFromContext(canvas, gl, options = {}) {
  if (!isWebGL2Context(gl)) {
    throw new Error('vtkExternalContextRenderWindow requires a WebGL2 context');
  }
  if (gl.canvas && gl.canvas !== canvas) {
    throw new Error(
      'vtkExternalContextRenderWindow requires the provided canvas to match gl.canvas'
    );
  }

  return newInstance({
    ...options,
    canvas,
    context: gl,
    manageCanvas: false,
    webgl2: true,
  });
}

export default { newInstance, extend, createFromContext };
