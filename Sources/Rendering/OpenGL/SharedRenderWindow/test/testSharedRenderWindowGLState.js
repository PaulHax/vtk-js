import test from 'tape';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkConeSource from 'vtk.js/Sources/Filters/Sources/ConeSource';
import vtkSharedRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/SharedRenderWindow';
import { GET_UNDERLYING_CONTEXT } from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow/ContextProxy';

/**
 * Set non-default GL state simulating a host library (e.g. MapLibre).
 */
function createHostGLResources(gl) {
  const resources = {
    arrayBuffer: gl.createBuffer(),
    elementArrayBuffer: gl.createBuffer(),
    renderbuffer: gl.createRenderbuffer(),
    texture2DUnit1: gl.createTexture(),
    textureCubeUnit1: gl.createTexture(),
    texture2DUnit3: gl.createTexture(),
  };

  if (gl.TEXTURE_3D !== undefined) {
    resources.texture3DUnit2 = gl.createTexture();
  }
  if (gl.TEXTURE_2D_ARRAY !== undefined) {
    resources.texture2DArrayUnit2 = gl.createTexture();
  }

  return resources;
}

function setHostGLState(gl, resources) {
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(
    gl.SRC_ALPHA,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA
  );
  gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_SUBTRACT);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(false);

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);
  gl.frontFace(gl.CW);

  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(10, 20, 100, 200);

  gl.viewport(10, 20, 300, 300);

  gl.colorMask(true, false, true, false);
  gl.clearColor(0.5, 0.3, 0.1, 0.8);

  gl.clearDepth(0.5);

  gl.enable(gl.STENCIL_TEST);
  gl.stencilFunc(gl.NOTEQUAL, 1, 0xff);
  gl.stencilOp(gl.REPLACE, gl.INCR, gl.DECR);
  gl.stencilMask(0x0f);
  gl.clearStencil(1);

  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1.0, 2.0);

  gl.bindBuffer(gl.ARRAY_BUFFER, resources.arrayBuffer);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.elementArrayBuffer);
  gl.bindRenderbuffer(gl.RENDERBUFFER, resources.renderbuffer);

  gl.pixelStorei(gl.PACK_ALIGNMENT, 8);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

  if (gl.PACK_ROW_LENGTH !== undefined) {
    gl.pixelStorei(gl.PACK_ROW_LENGTH, 4);
    gl.pixelStorei(gl.PACK_SKIP_ROWS, 3);
    gl.pixelStorei(gl.PACK_SKIP_PIXELS, 2);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 9);
    gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 7);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 6);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 5);
    gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, 4);
  }

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, resources.texture2DUnit1);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, resources.textureCubeUnit1);

  if (resources.texture3DUnit2 || resources.texture2DArrayUnit2) {
    gl.activeTexture(gl.TEXTURE2);
    if (resources.texture3DUnit2) {
      gl.bindTexture(gl.TEXTURE_3D, resources.texture3DUnit2);
    }
    if (resources.texture2DArrayUnit2) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, resources.texture2DArrayUnit2);
    }
  }

  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, resources.texture2DUnit3);
}

/**
 * Verify that GL state matches what setHostGLState() set.
 */
function verifyHostGLState(gl, t, resources) {
  // Enable flags
  t.ok(gl.isEnabled(gl.BLEND), 'BLEND should be enabled');
  t.ok(gl.isEnabled(gl.DEPTH_TEST), 'DEPTH_TEST should be enabled');
  t.ok(gl.isEnabled(gl.CULL_FACE), 'CULL_FACE should be enabled');
  t.ok(gl.isEnabled(gl.SCISSOR_TEST), 'SCISSOR_TEST should be enabled');
  t.ok(gl.isEnabled(gl.STENCIL_TEST), 'STENCIL_TEST should be enabled');
  t.ok(
    gl.isEnabled(gl.POLYGON_OFFSET_FILL),
    'POLYGON_OFFSET_FILL should be enabled'
  );

  // Blend
  t.equal(
    gl.getParameter(gl.BLEND_SRC_RGB),
    gl.SRC_ALPHA,
    'BLEND_SRC_RGB should be SRC_ALPHA'
  );
  t.equal(
    gl.getParameter(gl.BLEND_DST_RGB),
    gl.ONE_MINUS_SRC_ALPHA,
    'BLEND_DST_RGB should be ONE_MINUS_SRC_ALPHA'
  );
  t.equal(
    gl.getParameter(gl.BLEND_SRC_ALPHA),
    gl.ONE,
    'BLEND_SRC_ALPHA should be ONE'
  );
  t.equal(
    gl.getParameter(gl.BLEND_DST_ALPHA),
    gl.ONE_MINUS_SRC_ALPHA,
    'BLEND_DST_ALPHA should be ONE_MINUS_SRC_ALPHA'
  );
  t.equal(
    gl.getParameter(gl.BLEND_EQUATION_ALPHA),
    gl.FUNC_SUBTRACT,
    'BLEND_EQUATION_ALPHA should be FUNC_SUBTRACT'
  );

  // Depth
  t.equal(
    gl.getParameter(gl.DEPTH_FUNC),
    gl.LEQUAL,
    'DEPTH_FUNC should be LEQUAL'
  );
  t.equal(
    gl.getParameter(gl.DEPTH_WRITEMASK),
    false,
    'DEPTH_WRITEMASK should be false'
  );
  t.equal(
    gl.getParameter(gl.DEPTH_CLEAR_VALUE),
    0.5,
    'DEPTH_CLEAR_VALUE should be 0.5'
  );

  // Cull face
  t.equal(
    gl.getParameter(gl.CULL_FACE_MODE),
    gl.FRONT,
    'CULL_FACE_MODE should be FRONT'
  );
  t.equal(gl.getParameter(gl.FRONT_FACE), gl.CW, 'FRONT_FACE should be CW');

  // Scissor
  t.deepEqual(
    Array.from(gl.getParameter(gl.SCISSOR_BOX)),
    [10, 20, 100, 200],
    'SCISSOR_BOX should be [10, 20, 100, 200]'
  );

  // Viewport
  t.deepEqual(
    Array.from(gl.getParameter(gl.VIEWPORT)),
    [10, 20, 300, 300],
    'VIEWPORT should be [10, 20, 300, 300]'
  );

  // Color
  t.deepEqual(
    Array.from(gl.getParameter(gl.COLOR_WRITEMASK)),
    [true, false, true, false],
    'COLOR_WRITEMASK should be [true, false, true, false]'
  );
  const clearColor = Array.from(gl.getParameter(gl.COLOR_CLEAR_VALUE));
  t.ok(
    Math.abs(clearColor[0] - 0.5) < 0.01 &&
      Math.abs(clearColor[1] - 0.3) < 0.01 &&
      Math.abs(clearColor[2] - 0.1) < 0.01 &&
      Math.abs(clearColor[3] - 0.8) < 0.01,
    'COLOR_CLEAR_VALUE should be ~[0.5, 0.3, 0.1, 0.8]'
  );

  // Stencil
  t.equal(
    gl.getParameter(gl.STENCIL_FUNC),
    gl.NOTEQUAL,
    'STENCIL_FUNC should be NOTEQUAL'
  );
  t.equal(gl.getParameter(gl.STENCIL_REF), 1, 'STENCIL_REF should be 1');
  t.equal(
    gl.getParameter(gl.STENCIL_VALUE_MASK),
    0xff,
    'STENCIL_VALUE_MASK should be 0xff'
  );
  t.equal(
    gl.getParameter(gl.STENCIL_FAIL),
    gl.REPLACE,
    'STENCIL_FAIL should be REPLACE'
  );
  t.equal(
    gl.getParameter(gl.STENCIL_PASS_DEPTH_FAIL),
    gl.INCR,
    'STENCIL_PASS_DEPTH_FAIL should be INCR'
  );
  t.equal(
    gl.getParameter(gl.STENCIL_PASS_DEPTH_PASS),
    gl.DECR,
    'STENCIL_PASS_DEPTH_PASS should be DECR'
  );
  t.equal(
    gl.getParameter(gl.STENCIL_WRITEMASK),
    0x0f,
    'STENCIL_WRITEMASK should be 0x0f'
  );
  t.equal(
    gl.getParameter(gl.STENCIL_CLEAR_VALUE),
    1,
    'STENCIL_CLEAR_VALUE should be 1'
  );

  // Polygon offset
  t.equal(
    gl.getParameter(gl.POLYGON_OFFSET_FACTOR),
    1.0,
    'POLYGON_OFFSET_FACTOR should be 1.0'
  );
  t.equal(
    gl.getParameter(gl.POLYGON_OFFSET_UNITS),
    2.0,
    'POLYGON_OFFSET_UNITS should be 2.0'
  );

  // Active texture
  t.equal(
    gl.getParameter(gl.ACTIVE_TEXTURE),
    gl.TEXTURE3,
    'ACTIVE_TEXTURE should be TEXTURE3'
  );

  // Buffer and renderbuffer bindings
  t.equal(
    gl.getParameter(gl.ARRAY_BUFFER_BINDING),
    resources.arrayBuffer,
    'ARRAY_BUFFER_BINDING should be preserved'
  );
  t.equal(
    gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING),
    resources.elementArrayBuffer,
    'ELEMENT_ARRAY_BUFFER_BINDING should be preserved'
  );
  t.equal(
    gl.getParameter(gl.RENDERBUFFER_BINDING),
    resources.renderbuffer,
    'RENDERBUFFER_BINDING should be preserved'
  );

  // Pixel store
  t.equal(gl.getParameter(gl.PACK_ALIGNMENT), 8, 'PACK_ALIGNMENT should be 8');
  t.equal(
    gl.getParameter(gl.UNPACK_ALIGNMENT),
    2,
    'UNPACK_ALIGNMENT should be 2'
  );
  t.equal(
    gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),
    true,
    'UNPACK_FLIP_Y_WEBGL should be true'
  );
  t.equal(
    gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    true,
    'UNPACK_PREMULTIPLY_ALPHA_WEBGL should be true'
  );
  t.equal(
    gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL),
    gl.NONE,
    'UNPACK_COLORSPACE_CONVERSION_WEBGL should be NONE'
  );

  if (gl.PACK_ROW_LENGTH !== undefined) {
    t.equal(gl.getParameter(gl.PACK_ROW_LENGTH), 4, 'PACK_ROW_LENGTH is 4');
    t.equal(gl.getParameter(gl.PACK_SKIP_ROWS), 3, 'PACK_SKIP_ROWS is 3');
    t.equal(gl.getParameter(gl.PACK_SKIP_PIXELS), 2, 'PACK_SKIP_PIXELS is 2');
    t.equal(gl.getParameter(gl.UNPACK_ROW_LENGTH), 9, 'UNPACK_ROW_LENGTH is 9');
    t.equal(
      gl.getParameter(gl.UNPACK_IMAGE_HEIGHT),
      7,
      'UNPACK_IMAGE_HEIGHT is 7'
    );
    t.equal(gl.getParameter(gl.UNPACK_SKIP_ROWS), 6, 'UNPACK_SKIP_ROWS is 6');
    t.equal(
      gl.getParameter(gl.UNPACK_SKIP_PIXELS),
      5,
      'UNPACK_SKIP_PIXELS is 5'
    );
    t.equal(
      gl.getParameter(gl.UNPACK_SKIP_IMAGES),
      4,
      'UNPACK_SKIP_IMAGES is 4'
    );
  }

  const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE1);
  t.equal(
    gl.getParameter(gl.TEXTURE_BINDING_2D),
    resources.texture2DUnit1,
    'TEXTURE1 TEXTURE_2D binding should be preserved'
  );
  t.equal(
    gl.getParameter(gl.TEXTURE_BINDING_CUBE_MAP),
    resources.textureCubeUnit1,
    'TEXTURE1 TEXTURE_CUBE_MAP binding should be preserved'
  );

  if (resources.texture3DUnit2 || resources.texture2DArrayUnit2) {
    gl.activeTexture(gl.TEXTURE2);
    if (resources.texture3DUnit2) {
      t.equal(
        gl.getParameter(gl.TEXTURE_BINDING_3D),
        resources.texture3DUnit2,
        'TEXTURE2 TEXTURE_3D binding should be preserved'
      );
    }
    if (resources.texture2DArrayUnit2) {
      t.equal(
        gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY),
        resources.texture2DArrayUnit2,
        'TEXTURE2 TEXTURE_2D_ARRAY binding should be preserved'
      );
    }
  }

  gl.activeTexture(gl.TEXTURE3);
  t.equal(
    gl.getParameter(gl.TEXTURE_BINDING_2D),
    resources.texture2DUnit3,
    'TEXTURE3 TEXTURE_2D binding should be preserved'
  );
  gl.activeTexture(activeTexture);
}

function deleteHostGLResources(gl, resources) {
  gl.deleteBuffer(resources.arrayBuffer);
  gl.deleteBuffer(resources.elementArrayBuffer);
  gl.deleteRenderbuffer(resources.renderbuffer);
  gl.deleteTexture(resources.texture2DUnit1);
  gl.deleteTexture(resources.textureCubeUnit1);
  gl.deleteTexture(resources.texture2DUnit3);
  if (resources.texture3DUnit2) {
    gl.deleteTexture(resources.texture3DUnit2);
  }
  if (resources.texture2DArrayUnit2) {
    gl.deleteTexture(resources.texture2DArrayUnit2);
  }
}

test.onlyIfWebGL('Test renderShared preserves host GL state', (t) => {
  const gc = testUtils.createGarbageCollector();

  const container = document.querySelector('body');
  const renderWindowContainer = gc.registerDOMElement(
    document.createElement('div')
  );
  container.appendChild(renderWindowContainer);

  // Minimal VTK scene
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

  // Create GL window to get a context
  const glWindow = gc.registerResource(renderWindow.newAPISpecificView());
  glWindow.setContainer(renderWindowContainer);
  renderWindow.addView(glWindow);
  glWindow.setSize(400, 400);

  const glProxy = glWindow.get3DContext();
  const gl = glProxy?.[GET_UNDERLYING_CONTEXT]?.();
  t.ok(gl, 'WebGL context created');

  // Create shared render window
  const sharedWindow = gc.registerResource(
    vtkSharedRenderWindow.createFromContext(glWindow.getCanvas(), gl)
  );
  sharedWindow.setAutoClear(true);
  sharedWindow.setSize(400, 400);
  renderWindow.removeView(glWindow);
  renderWindow.addView(sharedWindow);
  renderer.resetCamera();

  const hostResources = createHostGLResources(gl);

  // Set non-default GL state (simulating host library)
  setHostGLState(gl, hostResources);

  // Render VTK content
  sharedWindow.renderShared();

  // Verify host GL state was preserved
  verifyHostGLState(gl, t, hostResources);

  deleteHostGLResources(gl, hostResources);
  gc.releaseResources();
  t.end();
});
