import * as macro from 'vtk.js/Sources/macros';

import vtkOpenGLPointGaussianMapper from 'vtk.js/Sources/Rendering/OpenGL/PointGaussianMapper';
import vtkShaderProgram from 'vtk.js/Sources/Rendering/OpenGL/ShaderProgram';

import { registerOverride } from 'vtk.js/Sources/Rendering/OpenGL/ViewNodeFactory';

// ----------------------------------------------------------------------------
// vtkOpenGLPointSpriteMapper methods
// ----------------------------------------------------------------------------

function vtkOpenGLPointSpriteMapper(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkOpenGLPointSpriteMapper');

  // Capture 'parentClass' api for internal use
  const superClass = { ...publicAPI };

  publicAPI.getNumberOfDrawnPoints = () => {
    const uploaded = superClass.getNumberOfDrawnPoints();
    const maximum = model.renderable.getMaximumPointCount();
    return maximum < 0 ? uploaded : Math.min(uploaded, maximum);
  };

  // Simple points only. The lines go in ahead of the superclass, at the tags
  // it fills, so they follow its gl_Position and default gl_PointSize, and
  // discard before the colour is computed.
  //
  // gl_Position.w is the view depth under a perspective projection and 1
  // under a parallel one, so dividing by it turns a model-space diameter into
  // pixels. The actor point size stays the floor, which keeps distant points
  // visible. WebGL clamps the result to the implementation's point size range.
  publicAPI.replaceShaderValues = (shaders, ren, actor) => {
    const renderable = model.renderable;
    if (renderable.getScaleFactor() === 0) {
      if (renderable.getWorldSize() > 0) {
        shaders.Vertex = vtkShaderProgram.substitute(
          shaders.Vertex,
          '//VTK::PositionVC::Dec',
          ['//VTK::PositionVC::Dec', 'uniform float worldPointSizeFactor;']
        ).result;
        shaders.Vertex = vtkShaderProgram.substitute(
          shaders.Vertex,
          '//VTK::PositionVC::Impl',
          [
            '//VTK::PositionVC::Impl',
            '  gl_PointSize = max(worldPointSizeFactor / gl_Position.w, pointSize);',
          ]
        ).result;
      }
      if (renderable.getCircle()) {
        shaders.Fragment = vtkShaderProgram.substitute(
          shaders.Fragment,
          '//VTK::Color::Impl',
          [
            '  if (length(gl_PointCoord - vec2(0.5)) > 0.5) { discard; }',
            '//VTK::Color::Impl',
          ]
        ).result;
      }
    }
    superClass.replaceShaderValues(shaders, ren, actor);
  };

  publicAPI.setMapperShaderParameters = (cellBO, ren, actor) => {
    superClass.setMapperShaderParameters(cellBO, ren, actor);

    const program = cellBO.getProgram();
    const pointSizeScale = model.renderable.getPointSizeScale();
    if (program.isUniformUsed('pointSize')) {
      program.setUniformf(
        'pointSize',
        actor.getProperty().getPointSize() * pointSizeScale
      );
    }

    if (program.isUniformUsed('worldPointSizeFactor')) {
      // Pixels per model unit at unit view depth: half the viewport height
      // times the vertical scale of the projection. worldSize is in model
      // units while gl_Position.w is in world units, so the actor's scale
      // (assumed isotropic) is folded in.
      let actorScale = 1.0;
      if (!actor.getIsIdentity()) {
        const { mcwc } = model.openGLActor.getKeyMatrices();
        const norm = Math.hypot(mcwc[0], mcwc[1], mcwc[2]);
        if (Number.isFinite(norm) && norm > 0) {
          actorScale = norm;
        }
      }
      const { vsize } = model._openGLRenderer.getTiledSizeAndOrigin();
      const { vcpc } = model.openGLCamera.getKeyMatrices(ren);
      program.setUniformf(
        'worldPointSizeFactor',
        model.renderable.getWorldSize() *
          pointSizeScale *
          actorScale *
          0.5 *
          vsize *
          vcpc[5]
      );
    }
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  // Inheritance
  vtkOpenGLPointGaussianMapper.extend(publicAPI, model, initialValues);

  // Object methods
  vtkOpenGLPointSpriteMapper(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkOpenGLPointSpriteMapper'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };

// Register ourself to OpenGL backend if imported
registerOverride('vtkPointSpriteMapper', newInstance);
