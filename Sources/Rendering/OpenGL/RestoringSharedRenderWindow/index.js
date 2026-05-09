import macro from 'vtk.js/Sources/macros';
import { extend as extendSharedRenderWindow } from 'vtk.js/Sources/Rendering/OpenGL/SharedRenderWindow';

// Capabilities the parent's resetGLState toggles.
const CAPABILITIES = [
  'BLEND',
  'CULL_FACE',
  'DEPTH_TEST',
  'POLYGON_OFFSET_FILL',
  'SCISSOR_TEST',
  'STENCIL_TEST',
  'SAMPLE_ALPHA_TO_COVERAGE',
  'SAMPLE_COVERAGE',
  'RASTERIZER_DISCARD',
];

const PIXEL_STORE = [
  'PACK_ALIGNMENT',
  'UNPACK_ALIGNMENT',
  'UNPACK_FLIP_Y_WEBGL',
  'UNPACK_PREMULTIPLY_ALPHA_WEBGL',
  'UNPACK_COLORSPACE_CONVERSION_WEBGL',
  'PACK_ROW_LENGTH',
  'PACK_SKIP_ROWS',
  'PACK_SKIP_PIXELS',
  'UNPACK_ROW_LENGTH',
  'UNPACK_IMAGE_HEIGHT',
  'UNPACK_SKIP_ROWS',
  'UNPACK_SKIP_PIXELS',
  'UNPACK_SKIP_IMAGES',
];

function isWebGL2Context(gl) {
  return (
    typeof WebGL2RenderingContext !== 'undefined' &&
    gl instanceof WebGL2RenderingContext
  );
}

function saveGLState(gl) {
  const state = {
    capabilities: {},
    blendEqRGB: gl.getParameter(gl.BLEND_EQUATION_RGB),
    blendEqAlpha: gl.getParameter(gl.BLEND_EQUATION_ALPHA),
    blendSrcRGB: gl.getParameter(gl.BLEND_SRC_RGB),
    blendSrcAlpha: gl.getParameter(gl.BLEND_SRC_ALPHA),
    blendDstRGB: gl.getParameter(gl.BLEND_DST_RGB),
    blendDstAlpha: gl.getParameter(gl.BLEND_DST_ALPHA),
    blendColor: gl.getParameter(gl.BLEND_COLOR),
    colorMask: gl.getParameter(gl.COLOR_WRITEMASK),
    clearColor: gl.getParameter(gl.COLOR_CLEAR_VALUE),
    depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
    depthFunc: gl.getParameter(gl.DEPTH_FUNC),
    depthRange: gl.getParameter(gl.DEPTH_RANGE),
    clearDepth: gl.getParameter(gl.DEPTH_CLEAR_VALUE),
    stencilMaskFront: gl.getParameter(gl.STENCIL_WRITEMASK),
    stencilMaskBack: gl.getParameter(gl.STENCIL_BACK_WRITEMASK),
    stencilFuncFront: gl.getParameter(gl.STENCIL_FUNC),
    stencilRefFront: gl.getParameter(gl.STENCIL_REF),
    stencilValueMaskFront: gl.getParameter(gl.STENCIL_VALUE_MASK),
    stencilFuncBack: gl.getParameter(gl.STENCIL_BACK_FUNC),
    stencilRefBack: gl.getParameter(gl.STENCIL_BACK_REF),
    stencilValueMaskBack: gl.getParameter(gl.STENCIL_BACK_VALUE_MASK),
    stencilFailFront: gl.getParameter(gl.STENCIL_FAIL),
    stencilZFailFront: gl.getParameter(gl.STENCIL_PASS_DEPTH_FAIL),
    stencilZPassFront: gl.getParameter(gl.STENCIL_PASS_DEPTH_PASS),
    stencilFailBack: gl.getParameter(gl.STENCIL_BACK_FAIL),
    stencilZFailBack: gl.getParameter(gl.STENCIL_BACK_PASS_DEPTH_FAIL),
    stencilZPassBack: gl.getParameter(gl.STENCIL_BACK_PASS_DEPTH_PASS),
    clearStencil: gl.getParameter(gl.STENCIL_CLEAR_VALUE),
    cullFace: gl.getParameter(gl.CULL_FACE_MODE),
    frontFace: gl.getParameter(gl.FRONT_FACE),
    polygonFactor: gl.getParameter(gl.POLYGON_OFFSET_FACTOR),
    polygonUnits: gl.getParameter(gl.POLYGON_OFFSET_UNITS),
    activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
    program: gl.getParameter(gl.CURRENT_PROGRAM),
    vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
    elementArrayBuffer: gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING),
    pixelPackBuffer: gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),
    pixelUnpackBuffer: gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING),
    renderbuffer: gl.getParameter(gl.RENDERBUFFER_BINDING),
    framebufferRead: gl.READ_FRAMEBUFFER_BINDING
      ? gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)
      : null,
    framebufferDraw: gl.DRAW_FRAMEBUFFER_BINDING
      ? gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)
      : gl.getParameter(gl.FRAMEBUFFER_BINDING),
    viewport: gl.getParameter(gl.VIEWPORT),
    scissor: gl.getParameter(gl.SCISSOR_BOX),
    lineWidth: gl.getParameter(gl.LINE_WIDTH),
    sampleCoverageValue: gl.getParameter(gl.SAMPLE_COVERAGE_VALUE),
    sampleCoverageInvert: gl.getParameter(gl.SAMPLE_COVERAGE_INVERT),
    readBuffer: gl.getParameter(gl.READ_BUFFER),
    pixelStore: {},
    drawBuffers: null,
  };

  CAPABILITIES.forEach((name) => {
    state.capabilities[name] = gl.isEnabled(gl[name]);
  });

  PIXEL_STORE.forEach((name) => {
    if (gl[name] !== undefined) {
      state.pixelStore[name] = gl.getParameter(gl[name]);
    }
  });

  if (gl.MAX_DRAW_BUFFERS !== undefined) {
    // The default framebuffer only accepts a single-entry [BACK] or [NONE]
    // for drawBuffers. Some implementations (Chrome/ANGLE) return BACK for
    // every DRAW_BUFFERi index on the default FBO, so we can't infer the
    // correct length from the values; query just slot 0 in that case.
    const fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    if (!fbo) {
      state.drawBuffers = [gl.getParameter(gl.DRAW_BUFFER0)];
    } else {
      const max = gl.getParameter(gl.MAX_DRAW_BUFFERS);
      const buffers = [];
      for (let i = 0; i < max; i += 1) {
        buffers.push(gl.getParameter(gl.DRAW_BUFFER0 + i));
      }
      while (buffers.length > 1 && buffers[buffers.length - 1] === gl.NONE) {
        buffers.pop();
      }
      state.drawBuffers = buffers;
    }
  }

  return state;
}

function restoreGLState(gl, state) {
  CAPABILITIES.forEach((name) => {
    if (state.capabilities[name]) {
      gl.enable(gl[name]);
    } else {
      gl.disable(gl[name]);
    }
  });

  gl.blendEquationSeparate(state.blendEqRGB, state.blendEqAlpha);
  gl.blendFuncSeparate(
    state.blendSrcRGB,
    state.blendDstRGB,
    state.blendSrcAlpha,
    state.blendDstAlpha
  );
  gl.blendColor(
    state.blendColor[0],
    state.blendColor[1],
    state.blendColor[2],
    state.blendColor[3]
  );

  gl.colorMask(
    state.colorMask[0],
    state.colorMask[1],
    state.colorMask[2],
    state.colorMask[3]
  );
  gl.clearColor(
    state.clearColor[0],
    state.clearColor[1],
    state.clearColor[2],
    state.clearColor[3]
  );

  gl.depthMask(state.depthMask);
  gl.depthFunc(state.depthFunc);
  gl.depthRange(state.depthRange[0], state.depthRange[1]);
  gl.clearDepth(state.clearDepth);

  gl.stencilMaskSeparate(gl.FRONT, state.stencilMaskFront);
  gl.stencilMaskSeparate(gl.BACK, state.stencilMaskBack);
  gl.stencilFuncSeparate(
    gl.FRONT,
    state.stencilFuncFront,
    state.stencilRefFront,
    state.stencilValueMaskFront
  );
  gl.stencilFuncSeparate(
    gl.BACK,
    state.stencilFuncBack,
    state.stencilRefBack,
    state.stencilValueMaskBack
  );
  gl.stencilOpSeparate(
    gl.FRONT,
    state.stencilFailFront,
    state.stencilZFailFront,
    state.stencilZPassFront
  );
  gl.stencilOpSeparate(
    gl.BACK,
    state.stencilFailBack,
    state.stencilZFailBack,
    state.stencilZPassBack
  );
  gl.clearStencil(state.clearStencil);

  gl.cullFace(state.cullFace);
  gl.frontFace(state.frontFace);
  gl.polygonOffset(state.polygonFactor, state.polygonUnits);

  gl.activeTexture(state.activeTexture);

  if (gl.bindVertexArray) {
    gl.bindVertexArray(state.vao);
  }
  // Restore buffer bindings after the VAO. ARRAY_BUFFER_BINDING is global;
  // ELEMENT_ARRAY_BUFFER_BINDING is part of the VAO state, but restoring it
  // explicitly defends against vtk modifying a host-owned VAO's element
  // buffer mid-render. PBO bindings affect texture upload and readPixels.
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.elementArrayBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.arrayBuffer);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, state.pixelPackBuffer);
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, state.pixelUnpackBuffer);

  gl.useProgram(state.program);

  if (gl.bindRenderbuffer) {
    gl.bindRenderbuffer(gl.RENDERBUFFER, state.renderbuffer);
  }

  // Restore framebuffer bindings BEFORE drawBuffers so drawBuffers applies
  // to the host's draw target, not whatever vtk may have left bound. WebGL2
  // tracks read and draw bindings separately.
  if (gl.READ_FRAMEBUFFER) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.framebufferRead);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, state.framebufferDraw);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebufferDraw);
  }

  gl.viewport(
    state.viewport[0],
    state.viewport[1],
    state.viewport[2],
    state.viewport[3]
  );
  gl.scissor(
    state.scissor[0],
    state.scissor[1],
    state.scissor[2],
    state.scissor[3]
  );
  gl.lineWidth(state.lineWidth);

  gl.sampleCoverage(state.sampleCoverageValue, state.sampleCoverageInvert);

  Object.keys(state.pixelStore).forEach((name) => {
    gl.pixelStorei(gl[name], state.pixelStore[name]);
  });

  if (state.drawBuffers && gl.drawBuffers) {
    gl.drawBuffers(state.drawBuffers);
  }

  // readBuffer must be restored after the framebuffer is bound (the value
  // depends on whether default-FBO or an FBO is current).
  gl.readBuffer(state.readBuffer);
}

function vtkRestoringSharedRenderWindow(publicAPI, model) {
  model.classHierarchy.push('vtkRestoringSharedRenderWindow');

  const superRenderShared = publicAPI.renderShared;

  publicAPI.renderShared = (options) => {
    const gl = model.context;
    if (!gl) {
      superRenderShared(options);
      return;
    }
    const saved = saveGLState(gl);
    try {
      superRenderShared(options);
    } finally {
      restoreGLState(gl, saved);
    }
  };
}

export function extend(publicAPI, model, initialValues = {}) {
  extendSharedRenderWindow(publicAPI, model, initialValues);
  vtkRestoringSharedRenderWindow(publicAPI, model);
}

export const newInstance = macro.newInstance(
  extend,
  'vtkRestoringSharedRenderWindow'
);

export function createFromContext(canvas, gl, options = {}) {
  if (!isWebGL2Context(gl)) {
    throw new Error('vtkRestoringSharedRenderWindow requires a WebGL2 context');
  }
  if (gl.canvas && gl.canvas !== canvas) {
    throw new Error(
      'vtkRestoringSharedRenderWindow requires the provided canvas to match gl.canvas'
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
