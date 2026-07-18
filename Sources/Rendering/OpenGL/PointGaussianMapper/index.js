import { ObjectType } from 'vtk.js/Sources/Rendering/OpenGL/BufferObject/Constants';

import * as macro from 'vtk.js/Sources/macros';
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math';

import vtkBufferObject from 'vtk.js/Sources/Rendering/OpenGL/BufferObject';
import vtkShaderProgram from 'vtk.js/Sources/Rendering/OpenGL/ShaderProgram';
import vtkOpenGLPolyDataMapper from 'vtk.js/Sources/Rendering/OpenGL/PolyDataMapper';

import vtkDataSet from 'vtk.js/Sources/Common/DataModel/DataSet';
import { registerOverride } from 'vtk.js/Sources/Rendering/OpenGL/ViewNodeFactory';
import { computeCoordShiftAndScale } from 'vtk.js/Sources/Rendering/OpenGL/CellArrayBufferObject/helpers';

const { FieldAssociations } = vtkDataSet;

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
// scaleFactor multiplier, an optional round-splat fragment discard, and an
// optional world-space size mode (worldSize > 0) that rewrites the assembled
// gl_PointSize line to perspective-scale a world-unit diameter per point.
// ----------------------------------------------------------------------------

function vtkOpenGLPointGaussianMapper(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkOpenGLPointGaussianMapper');

  // Capture 'parentClass' api for internal use
  const superClass = { ...publicAPI };

  function getColorState(poly) {
    const renderable = model.renderable;
    const scalarVisibility = renderable.getScalarVisibility();
    if (!scalarVisibility) {
      return { scalarVisibility };
    }
    const scalarMode = renderable.getScalarMode();
    const arrayAccessMode = renderable.getArrayAccessMode();
    const colorByArrayName = renderable.getColorByArrayName();
    const colorMode = renderable.getColorMode();
    const fieldDataTupleId = renderable.getFieldDataTupleId();
    const interpolateScalarsBeforeMapping =
      renderable.getInterpolateScalarsBeforeMapping();
    const useLookupTableScalarRange = renderable.getUseLookupTableScalarRange();
    const scalarRange = renderable.getScalarRange();
    const { scalars } = renderable.getAbstractScalars(
      poly,
      scalarMode,
      arrayAccessMode,
      undefined,
      colorByArrayName
    );
    const lookupTable = scalars ? renderable.getLookupTable() : null;

    return {
      scalarVisibility,
      scalarMode,
      arrayAccessMode,
      colorByArrayName,
      colorMode,
      fieldDataTupleId,
      interpolateScalarsBeforeMapping,
      useLookupTableScalarRange,
      scalarRange: `${scalarRange[0]},${scalarRange[1]}`,
      scalars,
      scalarsMTime: scalars ? scalars.getMTime() : 0,
      lookupTable,
      lookupTableMTime: lookupTable ? lookupTable.getMTime() : 0,
    };
  }

  function isSameColorState(a, b) {
    return (
      a &&
      b &&
      a.scalarVisibility === b.scalarVisibility &&
      a.scalarMode === b.scalarMode &&
      a.arrayAccessMode === b.arrayAccessMode &&
      a.colorByArrayName === b.colorByArrayName &&
      a.colorMode === b.colorMode &&
      a.fieldDataTupleId === b.fieldDataTupleId &&
      a.interpolateScalarsBeforeMapping === b.interpolateScalarsBeforeMapping &&
      a.useLookupTableScalarRange === b.useLookupTableScalarRange &&
      a.scalarRange === b.scalarRange &&
      a.scalars === b.scalars &&
      a.scalarsMTime === b.scalarsMTime &&
      a.lookupTable === b.lookupTable &&
      a.lookupTableMTime === b.lookupTableMTime
    );
  }

  function getVBOState() {
    const poly = model.currentInput;
    if (!poly) {
      return null;
    }
    const points = poly.getPoints();
    return {
      poly,
      points,
      pointsMTime: points.getMTime(),
      color: getColorState(poly),
      context: model.context,
    };
  }

  function isSameVBOState(a, b) {
    return (
      a &&
      b &&
      a.poly === b.poly &&
      a.points === b.points &&
      a.pointsMTime === b.pointsMTime &&
      a.context === b.context &&
      isSameColorState(a.color, b.color)
    );
  }

  publicAPI.getNeedToRebuildBufferObjects = () =>
    !isSameVBOState(model.pointGaussianVBOState, getVBOState());

  publicAPI.renderPiece = (ren, actor) => {
    const selector = model._openGLRenderer?.getSelector();
    if (
      selector &&
      selector.getFieldAssociation() ===
        FieldAssociations.FIELD_ASSOCIATION_CELLS
    ) {
      // This mapper has no topology: its vertex stream does not represent cell
      // ids, so cell hardware selection must not fabricate them.
      return;
    }
    superClass.renderPiece(ren, actor);
  };

  publicAPI.updateMaximumPointCellIds = () => {
    const selector = model._openGLRenderer.getSelector();
    if (
      selector &&
      selector.getFieldAssociation() ===
        FieldAssociations.FIELD_ASSOCIATION_POINTS
    ) {
      selector.setMaximumPointId(
        Math.max(0, model.currentInput.getPoints().getNumberOfPoints() - 1)
      );
    }
  };

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
    if (model.renderable.getWorldSize() > 0) {
      // Post-process the assembled vertex source: by now the Helper has
      // emitted `gl_PointSize = pointSize;` directly after the gl_Position
      // assignment, so gl_Position.w (the view depth under a perspective
      // projection, 1.0 under a parallel one) is available to scale a
      // world-unit diameter into pixels. The screen-space point size stays
      // as the pixel floor, so far-away (sub-pixel) splats keep the classic
      // fixed-size look and world sizing only grows points to close holes
      // up close. This also replaces the picking pass's fixed point size —
      // picked extents match the drawn splats.
      shaders.Vertex = vtkShaderProgram.substitute(
        shaders.Vertex,
        'uniform float pointSize;',
        [
          'uniform float pointSize;',
          'uniform float worldPointSizeFactor;',
          'uniform float maxPointSize;',
        ]
      ).result;
      shaders.Vertex = vtkShaderProgram.substitute(
        shaders.Vertex,
        'gl_PointSize = pointSize;',
        [
          'gl_PointSize = clamp(worldPointSizeFactor / gl_Position.w, pointSize, maxPointSize);',
        ]
      ).result;
    }
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

    if (program.isUniformUsed('worldPointSizeFactor')) {
      // Pixels per world unit: at unit view depth for a perspective camera
      // (the shader divides by gl_Position.w), absolute for a parallel one
      // (w stays 1). worldSize is in model units; gl_Position.w is in
      // post-actor-matrix units, so fold the actor's (isotropic) scale in —
      // e.g. an anchor matrix mapping local meters into Web-Mercator units.
      let actorScale = 1.0;
      if (!actor.getIsIdentity()) {
        const mcwc = model.openGLActor.getKeyMatrices().mcwc;
        const norm = Math.hypot(mcwc[0], mcwc[1], mcwc[2]);
        if (Number.isFinite(norm) && norm > 0) {
          actorScale = norm;
        }
      }
      const cam = ren.getActiveCamera();
      const size = model._openGLRenderer.getTiledSizeAndOrigin();
      let pixelsPerUnit;
      if (cam.getParallelProjection()) {
        pixelsPerUnit = size.vsize / (2.0 * cam.getParallelScale());
      } else {
        const tanHalfAngle = Math.tan(
          vtkMath.radiansFromDegrees(cam.getViewAngle()) / 2.0
        );
        const pixels = cam.getUseHorizontalViewAngle()
          ? size.usize
          : size.vsize;
        pixelsPerUnit = pixels / (2.0 * tanHalfAngle);
      }
      program.setUniformf(
        'worldPointSizeFactor',
        model.renderable.getWorldSize() *
          model.renderable.getScaleFactor() *
          actorScale *
          pixelsPerUnit
      );
      // ALIASED_POINT_SIZE_RANGE is a static context capability (not dynamic
      // GL state); query it once per context.
      if (model.pointSizeRangeContext !== model.context) {
        model.pointSizeRangeContext = model.context;
        model.aliasedPointSizeRange = model.context.getParameter(
          model.context.ALIASED_POINT_SIZE_RANGE
        );
      }
      program.setUniformf('maxPointSize', model.aliasedPointSizeRange[1]);
    }
  };

  publicAPI.buildBufferObjects = (ren, actor) => {
    const poly = model.currentInput;

    if (poly === null) {
      return;
    }

    const vboState = getVBOState();
    if (!isSameColorState(model.pointGaussianColorState, vboState.color)) {
      model.renderable.mapScalars(poly, 1.0);
      model.pointGaussianColorState = getColorState(poly);
    }
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

    model.pointGaussianVBOState = getVBOState();
    model.VBOBuildTime.modified();
  };

  publicAPI.delete = macro.chain(() => {
    for (let i = model.primTypes.Start; i < model.primTypes.End; i++) {
      model.primitives[i].releaseGraphicsResources();
    }
  }, publicAPI.delete);
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  pointGaussianColorState: null,
  pointGaussianVBOState: null,
  pointSizeRangeContext: null,
  aliasedPointSizeRange: null,
};

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
