// Side-by-side demo of vtkRestoringSharedRenderWindow.
//
// In each panel the host:
//   1. Clears to dark gray.
//   2. Sets the viewport to a small square in the bottom-right corner.
//   3. Asks vtk.js to render a cone.
//   4. Draws a red full-clip-space rectangle, expecting it to land inside
//      the small viewport it set up in step 2, WITHOUT re-issuing viewport.
//
// Left:  vtkSharedRenderWindow.           vtk.js leaves viewport at full canvas,
//                                         so the host's red rect splats over
//                                         everything (covering the cone).
// Right: vtkRestoringSharedRenderWindow.  vtk.js restores host's viewport, so
//                                         the red rect lands in the corner
//                                         where the host wanted it.

import '@kitware/vtk.js/favicon';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkSharedRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/SharedRenderWindow';
import vtkRestoringSharedRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RestoringSharedRenderWindow';

const W = 360;
const H = 360;
const SQ = 80; // host's target square size, bottom-right corner
const PAD = 16;

// Returns drawRect(x0, y0, x1, y1, color) that draws a solid-colored quad
// in clip space using a tiny shader.
function createHostRenderer(gl) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(
    program,
    compile(
      gl.VERTEX_SHADER,
      `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`
    )
  );
  gl.attachShader(
    program,
    compile(
      gl.FRAGMENT_SHADER,
      `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 outColor;
void main(){ outColor = uColor; }`
    )
  );
  gl.linkProgram(program);
  const uColor = gl.getUniformLocation(program, 'uColor');
  const aPos = gl.getAttribLocation(program, 'aPos');

  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  return function drawRect(x0, y0, x1, y1, color) {
    const v = new Float32Array([
      x0,
      y0,
      x1,
      y0,
      x0,
      y1,
      x0,
      y1,
      x1,
      y0,
      x1,
      y1,
    ]);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW);
    gl.useProgram(program);
    gl.uniform4fv(uColor, color);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.useProgram(null);
  };
}

// ---------------------------------------------------------------------------
// Build one panel: a labeled canvas wired to host + vtk.js.
// ---------------------------------------------------------------------------

const layout = document.createElement('div');
layout.style.cssText =
  'display:flex; gap:24px; padding:16px; font-family:sans-serif;';
document.body.appendChild(layout);

function buildPanel(label, sharedWindowFactory) {
  const wrap = document.createElement('div');
  const title = document.createElement('div');
  title.textContent = label;
  title.style.cssText = 'font-weight:600; margin-bottom:6px;';
  wrap.appendChild(title);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.style.cssText = 'border:1px solid #888; display:block;';
  wrap.appendChild(canvas);
  layout.appendChild(wrap);

  const gl = canvas.getContext('webgl2', { antialias: true });
  const drawRect = createHostRenderer(gl);

  const renderWindow = vtkRenderWindow.newInstance();
  const renderer = vtkRenderer.newInstance();
  renderer.setBackground(0, 0, 0, 0);
  renderer.setPreserveColorBuffer(true);
  renderWindow.addRenderer(renderer);

  const cone = vtkConeSource.newInstance({
    height: 1.0,
    radius: 0.4,
    resolution: 32,
    capping: true,
  });
  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(cone.getOutputPort());
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setColor(0.4, 0.7, 1.0);
  renderer.addActor(actor);

  const sharedWindow = sharedWindowFactory(canvas, gl);
  sharedWindow.setSize(W, H);
  renderWindow.addView(sharedWindow);
  renderer.resetCamera();

  return { gl, drawRect, sharedWindow, renderer, actor };
}

const left = buildPanel('vtkSharedRenderWindow (no restore)', (canvas, gl) =>
  vtkSharedRenderWindow.createFromContext(canvas, gl)
);
const right = buildPanel(
  'vtkRestoringSharedRenderWindow (restores host state)',
  (canvas, gl) => vtkRestoringSharedRenderWindow.createFromContext(canvas, gl)
);

// ---------------------------------------------------------------------------
// Per-frame: host clear, host viewport, vtk render, host draw.
// ---------------------------------------------------------------------------

function drawPanel({ gl, drawRect, sharedWindow, renderer, actor }) {
  // 1. Host clears the canvas.
  gl.viewport(0, 0, W, H);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(0.1, 0.12, 0.15, 1.0);
  // eslint-disable-next-line no-bitwise
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 2. Host sets viewport to the small bottom-right square. The red rect at
  //    step 4 will render here, IF this viewport survives the vtk render.
  gl.viewport(W - SQ - PAD, PAD, SQ, SQ);

  // 3. vtk.js renders the cone (using its own viewport, full canvas).
  actor.rotateY(0.5);
  renderer.resetCameraClippingRange();
  sharedWindow.renderShared();

  // 4. Host draws a red full-clip-space rectangle, expecting it inside the
  //    small viewport from step 2.
  //    With restore:    red square in the corner.
  //    Without restore: vtk.js left viewport at full canvas, so red splats
  //                     everywhere and covers the cone.
  drawRect(-1, -1, 1, 1, [0.9, 0.3, 0.3, 1]);
}

function frame() {
  drawPanel(left);
  drawPanel(right);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
