import test from 'tape';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkConeSource from 'vtk.js/Sources/Filters/Sources/ConeSource';
import vtkRestoringSharedRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RestoringSharedRenderWindow';
import { GET_UNDERLYING_CONTEXT } from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow/ContextProxy';

function createRestoringSharedWindow(
  gc,
  t,
  { width = 400, height = 400 } = {}
) {
  const container = document.querySelector('body');
  const renderWindowContainer = gc.registerDOMElement(
    document.createElement('div')
  );
  container.appendChild(renderWindowContainer);

  const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
  const renderer = gc.registerResource(vtkRenderer.newInstance());
  renderWindow.addRenderer(renderer);
  renderer.setBackground(0.2, 0.3, 0.4);

  const actor = gc.registerResource(vtkActor.newInstance());
  renderer.addActor(actor);
  const mapper = gc.registerResource(vtkMapper.newInstance());
  actor.setMapper(mapper);
  const cone = gc.registerResource(vtkConeSource.newInstance());
  mapper.setInputConnection(cone.getOutputPort());

  const glWindow = gc.registerResource(renderWindow.newAPISpecificView());
  glWindow.setContainer(renderWindowContainer);
  renderWindow.addView(glWindow);
  glWindow.setSize(width, height);

  const glProxy = glWindow.get3DContext();
  const gl = glProxy?.[GET_UNDERLYING_CONTEXT]?.();
  t.ok(gl, 'WebGL context created');

  const sharedWindow = gc.registerResource(
    vtkRestoringSharedRenderWindow.createFromContext(glWindow.getCanvas(), gl)
  );
  sharedWindow.setAutoClear(true);
  sharedWindow.setSize(width, height);
  renderWindow.removeView(glWindow);
  renderWindow.addView(sharedWindow);
  renderer.resetCamera();

  return { gl, sharedWindow };
}

// Build a simple complete FBO so the host has something legitimate to bind
// for the framebuffer-binding test. Returns { framebuffer, color, depth }.
function createHostFramebuffer(gl, width, height) {
  const framebuffer = gl.createFramebuffer();
  const color = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, color);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    color,
    0
  );
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,
    gl.RENDERBUFFER,
    depth
  );
  // Reset bindings so callers start fresh.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { framebuffer, color, depth };
}

function deleteHostFramebuffer(gl, fbo) {
  gl.deleteFramebuffer(fbo.framebuffer);
  gl.deleteTexture(fbo.color);
  gl.deleteRenderbuffer(fbo.depth);
}

// Establish a non-default host state that the shared render's resetGLState
// would otherwise overwrite. Returns the snapshot for comparison.
function setHostGLState(gl) {
  gl.enable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.STENCIL_TEST);
  gl.enable(gl.RASTERIZER_DISCARD);
  gl.depthRange(0.2, 0.8);

  gl.blendEquationSeparate(gl.FUNC_SUBTRACT, gl.FUNC_REVERSE_SUBTRACT);
  gl.blendFuncSeparate(gl.SRC_COLOR, gl.DST_COLOR, gl.ONE, gl.ZERO);
  gl.blendColor(0.25, 0.5, 0.75, 1.0);

  gl.colorMask(true, false, true, false);
  gl.clearColor(0.7, 0.6, 0.5, 0.4);

  gl.depthMask(false);
  gl.depthFunc(gl.GREATER);
  gl.clearDepth(0.25);

  gl.stencilMask(0xab);
  gl.stencilFunc(gl.NOTEQUAL, 7, 0x0f);
  gl.stencilOp(gl.INCR, gl.DECR, gl.INVERT);
  gl.clearStencil(3);

  gl.cullFace(gl.FRONT);
  gl.frontFace(gl.CW);

  gl.polygonOffset(2.5, 1.5);
  gl.activeTexture(gl.TEXTURE5);

  gl.viewport(10, 20, 123, 234);
  gl.scissor(5, 6, 50, 60);

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.PACK_ALIGNMENT, 8);

  return {
    caps: {
      BLEND: gl.isEnabled(gl.BLEND),
      CULL_FACE: gl.isEnabled(gl.CULL_FACE),
      DEPTH_TEST: gl.isEnabled(gl.DEPTH_TEST),
      SCISSOR_TEST: gl.isEnabled(gl.SCISSOR_TEST),
      STENCIL_TEST: gl.isEnabled(gl.STENCIL_TEST),
      RASTERIZER_DISCARD: gl.isEnabled(gl.RASTERIZER_DISCARD),
    },
    blendEqRGB: gl.getParameter(gl.BLEND_EQUATION_RGB),
    blendEqAlpha: gl.getParameter(gl.BLEND_EQUATION_ALPHA),
    blendSrcRGB: gl.getParameter(gl.BLEND_SRC_RGB),
    blendDstRGB: gl.getParameter(gl.BLEND_DST_RGB),
    blendColor: Array.from(gl.getParameter(gl.BLEND_COLOR)),
    colorMask: Array.from(gl.getParameter(gl.COLOR_WRITEMASK)),
    clearColor: Array.from(gl.getParameter(gl.COLOR_CLEAR_VALUE)),
    depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
    depthFunc: gl.getParameter(gl.DEPTH_FUNC),
    depthRange: Array.from(gl.getParameter(gl.DEPTH_RANGE)),
    clearDepth: gl.getParameter(gl.DEPTH_CLEAR_VALUE),
    stencilMask: gl.getParameter(gl.STENCIL_WRITEMASK),
    stencilFunc: gl.getParameter(gl.STENCIL_FUNC),
    stencilRef: gl.getParameter(gl.STENCIL_REF),
    clearStencil: gl.getParameter(gl.STENCIL_CLEAR_VALUE),
    cullFace: gl.getParameter(gl.CULL_FACE_MODE),
    frontFace: gl.getParameter(gl.FRONT_FACE),
    polygonFactor: gl.getParameter(gl.POLYGON_OFFSET_FACTOR),
    polygonUnits: gl.getParameter(gl.POLYGON_OFFSET_UNITS),
    activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
    viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
    scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX)),
    unpackAlignment: gl.getParameter(gl.UNPACK_ALIGNMENT),
    unpackFlipY: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),
    packAlignment: gl.getParameter(gl.PACK_ALIGNMENT),
  };
}

test.onlyIfWebGL(
  'Test renderShared restores host GL state after rendering',
  (t) => {
    const gc = testUtils.createGarbageCollector();
    const { gl, sharedWindow } = createRestoringSharedWindow(gc, t);

    const before = setHostGLState(gl);

    sharedWindow.renderShared();

    const after = {
      caps: {
        BLEND: gl.isEnabled(gl.BLEND),
        CULL_FACE: gl.isEnabled(gl.CULL_FACE),
        DEPTH_TEST: gl.isEnabled(gl.DEPTH_TEST),
        SCISSOR_TEST: gl.isEnabled(gl.SCISSOR_TEST),
        STENCIL_TEST: gl.isEnabled(gl.STENCIL_TEST),
        RASTERIZER_DISCARD: gl.isEnabled(gl.RASTERIZER_DISCARD),
      },
      blendEqRGB: gl.getParameter(gl.BLEND_EQUATION_RGB),
      blendEqAlpha: gl.getParameter(gl.BLEND_EQUATION_ALPHA),
      blendSrcRGB: gl.getParameter(gl.BLEND_SRC_RGB),
      blendDstRGB: gl.getParameter(gl.BLEND_DST_RGB),
      blendColor: Array.from(gl.getParameter(gl.BLEND_COLOR)),
      colorMask: Array.from(gl.getParameter(gl.COLOR_WRITEMASK)),
      clearColor: Array.from(gl.getParameter(gl.COLOR_CLEAR_VALUE)),
      depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
      depthFunc: gl.getParameter(gl.DEPTH_FUNC),
      depthRange: Array.from(gl.getParameter(gl.DEPTH_RANGE)),
      clearDepth: gl.getParameter(gl.DEPTH_CLEAR_VALUE),
      stencilMask: gl.getParameter(gl.STENCIL_WRITEMASK),
      stencilFunc: gl.getParameter(gl.STENCIL_FUNC),
      stencilRef: gl.getParameter(gl.STENCIL_REF),
      clearStencil: gl.getParameter(gl.STENCIL_CLEAR_VALUE),
      cullFace: gl.getParameter(gl.CULL_FACE_MODE),
      frontFace: gl.getParameter(gl.FRONT_FACE),
      polygonFactor: gl.getParameter(gl.POLYGON_OFFSET_FACTOR),
      polygonUnits: gl.getParameter(gl.POLYGON_OFFSET_UNITS),
      activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
      viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
      scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX)),
      unpackAlignment: gl.getParameter(gl.UNPACK_ALIGNMENT),
      unpackFlipY: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),
      packAlignment: gl.getParameter(gl.PACK_ALIGNMENT),
    };

    t.deepEqual(after.caps, before.caps, 'Capabilities restored');
    t.equal(after.blendEqRGB, before.blendEqRGB, 'Blend equation RGB restored');
    t.equal(
      after.blendEqAlpha,
      before.blendEqAlpha,
      'Blend equation alpha restored'
    );
    t.equal(after.blendSrcRGB, before.blendSrcRGB, 'Blend src RGB restored');
    t.equal(after.blendDstRGB, before.blendDstRGB, 'Blend dst RGB restored');
    t.deepEqual(after.blendColor, before.blendColor, 'Blend color restored');
    t.deepEqual(after.colorMask, before.colorMask, 'Color mask restored');
    t.deepEqual(after.clearColor, before.clearColor, 'Clear color restored');
    t.equal(after.depthMask, before.depthMask, 'Depth mask restored');
    t.equal(after.depthFunc, before.depthFunc, 'Depth func restored');
    t.deepEqual(after.depthRange, before.depthRange, 'Depth range restored');
    t.equal(after.clearDepth, before.clearDepth, 'Clear depth restored');
    t.equal(after.stencilMask, before.stencilMask, 'Stencil mask restored');
    t.equal(after.stencilFunc, before.stencilFunc, 'Stencil func restored');
    t.equal(after.stencilRef, before.stencilRef, 'Stencil ref restored');
    t.equal(after.clearStencil, before.clearStencil, 'Clear stencil restored');
    t.equal(after.cullFace, before.cullFace, 'Cull face restored');
    t.equal(after.frontFace, before.frontFace, 'Front face restored');
    t.equal(
      after.polygonFactor,
      before.polygonFactor,
      'Polygon factor restored'
    );
    t.equal(after.polygonUnits, before.polygonUnits, 'Polygon units restored');
    t.equal(
      after.activeTexture,
      before.activeTexture,
      'Active texture restored'
    );
    t.deepEqual(after.viewport, before.viewport, 'Viewport restored');
    t.deepEqual(after.scissor, before.scissor, 'Scissor restored');
    t.equal(
      after.unpackAlignment,
      before.unpackAlignment,
      'UNPACK_ALIGNMENT restored'
    );
    t.equal(
      after.unpackFlipY,
      before.unpackFlipY,
      'UNPACK_FLIP_Y_WEBGL restored'
    );
    t.equal(
      after.packAlignment,
      before.packAlignment,
      'PACK_ALIGNMENT restored'
    );

    gc.releaseResources();
    t.end();
  }
);

test.onlyIfWebGL(
  'Test renderShared restores host framebuffer and buffer bindings',
  (t) => {
    const gc = testUtils.createGarbageCollector();
    const { gl, sharedWindow } = createRestoringSharedWindow(gc, t);

    const hostFBO = createHostFramebuffer(gl, 200, 200);
    const arrayBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([1, 2, 3, 4]),
      gl.STATIC_DRAW
    );
    const elementArrayBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementArrayBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array([0, 1, 2]),
      gl.STATIC_DRAW
    );
    const packBuffer = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, packBuffer);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, 256, gl.STREAM_READ);
    const unpackBuffer = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpackBuffer);
    gl.bufferData(gl.PIXEL_UNPACK_BUFFER, 256, gl.STREAM_DRAW);

    // Host bindings the restoring window must preserve across renderShared.
    gl.bindFramebuffer(gl.FRAMEBUFFER, hostFBO.framebuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementArrayBuffer);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, packBuffer);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpackBuffer);

    // Disable color writes on this FBO. The parent's resetGLState falls back
    // to [COLOR_ATTACHMENT0] when every slot is NONE, so vtk WILL change
    // DRAW_BUFFER0 during render, exercising the drawBuffers restore path.
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);

    // Dirty additional state the restoring window must put back.
    gl.enable(gl.SAMPLE_COVERAGE);
    gl.sampleCoverage(0.25, true);
    gl.enable(gl.RASTERIZER_DISCARD);

    sharedWindow.renderShared();

    t.equal(
      gl.getParameter(gl.FRAMEBUFFER_BINDING),
      hostFBO.framebuffer,
      'FRAMEBUFFER_BINDING restored to host FBO'
    );
    t.equal(
      gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
      hostFBO.framebuffer,
      'READ_FRAMEBUFFER_BINDING restored'
    );
    t.equal(
      gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
      hostFBO.framebuffer,
      'DRAW_FRAMEBUFFER_BINDING restored'
    );
    t.equal(
      gl.getParameter(gl.ARRAY_BUFFER_BINDING),
      arrayBuffer,
      'ARRAY_BUFFER_BINDING restored'
    );
    t.equal(
      gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING),
      elementArrayBuffer,
      'ELEMENT_ARRAY_BUFFER_BINDING restored'
    );
    t.equal(
      gl.getParameter(gl.DRAW_BUFFER0),
      gl.NONE,
      'DRAW_BUFFER0 restored to host NONE after vtk forced COLOR_ATTACHMENT0'
    );
    t.equal(
      gl.getParameter(gl.READ_BUFFER),
      gl.NONE,
      'READ_BUFFER restored to host NONE'
    );
    t.equal(
      gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),
      packBuffer,
      'PIXEL_PACK_BUFFER restored'
    );
    t.equal(
      gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING),
      unpackBuffer,
      'PIXEL_UNPACK_BUFFER restored'
    );
    t.equal(
      gl.isEnabled(gl.SAMPLE_COVERAGE),
      true,
      'SAMPLE_COVERAGE re-enabled'
    );
    t.equal(
      gl.getParameter(gl.SAMPLE_COVERAGE_VALUE),
      0.25,
      'SAMPLE_COVERAGE_VALUE restored'
    );
    t.equal(
      gl.getParameter(gl.SAMPLE_COVERAGE_INVERT),
      true,
      'SAMPLE_COVERAGE_INVERT restored'
    );
    t.equal(
      gl.isEnabled(gl.RASTERIZER_DISCARD),
      true,
      'RASTERIZER_DISCARD re-enabled'
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    gl.disable(gl.SAMPLE_COVERAGE);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.deleteBuffer(arrayBuffer);
    gl.deleteBuffer(elementArrayBuffer);
    gl.deleteBuffer(packBuffer);
    gl.deleteBuffer(unpackBuffer);
    deleteHostFramebuffer(gl, hostFBO);
    gc.releaseResources();
    t.end();
  }
);
