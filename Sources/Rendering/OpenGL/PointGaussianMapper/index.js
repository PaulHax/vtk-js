import { ObjectType } from 'vtk.js/Sources/Rendering/OpenGL/BufferObject/Constants';

import * as macro from 'vtk.js/Sources/macros';

import vtkBufferObject from 'vtk.js/Sources/Rendering/OpenGL/BufferObject';
import vtkShaderProgram from 'vtk.js/Sources/Rendering/OpenGL/ShaderProgram';
import vtkOpenGLPolyDataMapper from 'vtk.js/Sources/Rendering/OpenGL/PolyDataMapper';

import { registerOverride } from 'vtk.js/Sources/Rendering/OpenGL/ViewNodeFactory';
import { computeCoordShiftAndScale } from 'vtk.js/Sources/Rendering/OpenGL/CellArrayBufferObject/helpers';

// ----------------------------------------------------------------------------
// vtkOpenGLPointGaussianMapper methods
//
// A dense-point mapper: it uploads exactly one vertex per input point and draws
// with gl.POINTS. Unlike vtkSphereMapper (three vertices per point, triangle
// impostors) it fabricates no topology and expands no geometry, so N points
// cost N vertices on the wire and the GPU. It reuses the whole
// vtkOpenGLPolyDataMapper machinery: the Points primitive's Helper already
// emits gl.POINTS, injects `gl_PointSize = pointSize` (valued from the actor's
// point size, in screen pixels), and folds the VBO coord shift/scale back out
// through MCPCMatrix — so this class only overrides buffer construction plus a
// scaleFactor multiplier and an optional round-splat fragment discard.
// ----------------------------------------------------------------------------

function vtkOpenGLPointGaussianMapper(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkOpenGLPointGaussianMapper');

  // Capture 'parentClass' api for internal use
  const superClass = { ...publicAPI };

  publicAPI.replaceShaderValues = (shaders, ren, actor) => {
    if (model.renderable.getCircle()) {
      // gl_PointCoord is only defined while drawing gl.POINTS. Discard corners
      // outside the inscribed circle for round splats; runs before the base
      // color impl fills the marker (preserved here for the base to consume).
      shaders.Fragment = vtkShaderProgram.substitute(
        shaders.Fragment,
        '//VTK::Color::Impl',
        [
          '  if (length(gl_PointCoord - vec2(0.5)) > 0.5) { discard; }',
          '//VTK::Color::Impl',
        ]
      ).result;
    }
    superClass.replaceShaderValues(shaders, ren, actor);
  };

  publicAPI.setMapperShaderParameters = (cellBO, ren, actor) => {
    superClass.setMapperShaderParameters(cellBO, ren, actor);

    // The Helper set `pointSize` from the actor point size; fold in the
    // renderable's screen-space multiplier (1.0 => unchanged).
    const program = cellBO.getProgram();
    if (program.isUniformUsed('pointSize')) {
      program.setUniformf(
        'pointSize',
        actor.getProperty().getPointSize() * model.renderable.getScaleFactor()
      );
    }
  };

  publicAPI.buildBufferObjects = (ren, actor) => {
    const poly = model.currentInput;

    if (poly === null) {
      return;
    }

    model.renderable.mapScalars(poly, 1.0);
    const c = model.renderable.getColorMapColors();

    // One vertex per point, drawn as gl.POINTS from the Points primitive.
    const vbo = model.primitives[model.primTypes.Points].getCABO();

    const points = poly.getPoints();
    const numPoints = points.getNumberOfPoints();
    const pointArray = points.getData();

    const blockSize = 3; // x, y, z — no impostor offset, no expansion

    let colorData = null;
    let colorComponents = 0;
    let packedUCVBO = null;
    if (c) {
      colorComponents = c.getNumberOfComponents();
      vbo.setColorOffset(0);
      vbo.setColorBOStride(4);
      colorData = c.getData();
      packedUCVBO = new Uint8Array(numPoints * 4);
      if (!vbo.getColorBO()) {
        vbo.setColorBO(vtkBufferObject.newInstance());
      }
      vbo.getColorBO().setOpenGLRenderWindow(model._openGLRenderWindow);
    } else if (vbo.getColorBO()) {
      vbo.setColorBO(null);
    }
    vbo.setColorComponents(colorComponents);

    const packedVBO = new Float32Array(blockSize * numPoints);
    vbo.setStride(blockSize * 4);

    const { useShiftAndScale, coordShift, coordScale } =
      computeCoordShiftAndScale(points);
    vbo.setCoordShiftAndScale(
      useShiftAndScale ? coordShift : null,
      useShiftAndScale ? coordScale : null
    );

    let vboIdx = 0;
    let ucIdx = 0;
    for (let i = 0; i < numPoints; ++i) {
      const pointIdx = i * 3;
      packedVBO[vboIdx++] =
        (pointArray[pointIdx] - coordShift[0]) * coordScale[0];
      packedVBO[vboIdx++] =
        (pointArray[pointIdx + 1] - coordShift[1]) * coordScale[1];
      packedVBO[vboIdx++] =
        (pointArray[pointIdx + 2] - coordShift[2]) * coordScale[2];
      if (colorData) {
        const colorIdx = i * colorComponents;
        packedUCVBO[ucIdx++] = colorData[colorIdx];
        packedUCVBO[ucIdx++] = colorData[colorIdx + 1];
        packedUCVBO[ucIdx++] = colorData[colorIdx + 2];
        packedUCVBO[ucIdx++] =
          colorComponents === 4 ? colorData[colorIdx + 3] : 255;
      }
    }

    vbo.setElementCount(numPoints);
    vbo.upload(packedVBO, ObjectType.ARRAY_BUFFER);
    if (c) {
      vbo.getColorBO().upload(packedUCVBO, ObjectType.ARRAY_BUFFER);
    }

    model.VBOBuildTime.modified();
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Inheritance
  vtkOpenGLPolyDataMapper.extend(publicAPI, model, initialValues);

  // Object methods
  vtkOpenGLPointGaussianMapper(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkOpenGLPointGaussianMapper'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };

// Register ourself to OpenGL backend if imported
registerOverride('vtkPointGaussianMapper', newInstance);
