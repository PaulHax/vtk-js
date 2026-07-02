import macro from 'vtk.js/Sources/macros';
import { extend as extendOpenGLRenderer } from 'vtk.js/Sources/Rendering/OpenGL/Renderer';

function vtkSharedRenderer(publicAPI, model) {
  model.classHierarchy.push('vtkSharedRenderer');

  const superClear = publicAPI.clear;

  publicAPI.clear = () => {
    if (model._openGLRenderWindow.getAutoClear()) {
      superClear();
      return;
    }

    // Leave the host framebuffer contents alone, but still establish the
    // scissor/viewport/depth-test state the parent clear() sets up.
    const gl = model.context;
    const ts = publicAPI.getTiledSizeAndOrigin();
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(ts.lowerLeftU, ts.lowerLeftV, ts.usize, ts.vsize);
    gl.viewport(ts.lowerLeftU, ts.lowerLeftV, ts.usize, ts.vsize);
    gl.enable(gl.DEPTH_TEST);
  };
}

export function extend(publicAPI, model, initialValues = {}) {
  extendOpenGLRenderer(publicAPI, model, initialValues);
  vtkSharedRenderer(publicAPI, model);
}

export const newInstance = macro.newInstance(extend, 'vtkSharedRenderer');

export default { newInstance, extend };
