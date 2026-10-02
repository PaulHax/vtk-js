import {
  ColorMode,
  ScalarMode,
} from 'vtk.js/Sources/Rendering/Core/Mapper/Constants';
import { ObjectType } from 'vtk.js/Sources/Rendering/OpenGL/BufferObject/Constants';

import * as macro from 'vtk.js/Sources/macros';
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math';

import vtkBufferObject from 'vtk.js/Sources/Rendering/OpenGL/BufferObject';
import vtkShaderProgram from 'vtk.js/Sources/Rendering/OpenGL/ShaderProgram';
import vtkOpenGLPolyDataMapper from 'vtk.js/Sources/Rendering/OpenGL/PolyDataMapper';

import vtkDataSet from 'vtk.js/Sources/Common/DataModel/DataSet';
import { registerOverride } from 'vtk.js/Sources/Rendering/OpenGL/ViewNodeFactory';
import { computeCoordShiftAndScale } from 'vtk.js/Sources/Rendering/OpenGL/CellArrayBufferObject/helpers';
import { PassTypes } from 'vtk.js/Sources/Rendering/OpenGL/HardwareSelector/Constants';

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
// through MCPCMatrix, so this class only overrides buffer construction plus a
// pointSizeScale multiplier, an optional round-splat fragment discard, and an
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
    const arrayId = renderable.getReferenceByName('arrayId');
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
      arrayId,
      colorByArrayName
    );
    const lookupTable = scalars ? renderable.getLookupTable() : null;

    return {
      scalarVisibility,
      scalarMode,
      arrayAccessMode,
      arrayId,
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

  function isSameColorState(a, b, ignoreData = false) {
    return (
      a &&
      b &&
      a.scalarVisibility === b.scalarVisibility &&
      a.scalarMode === b.scalarMode &&
      a.arrayAccessMode === b.arrayAccessMode &&
      a.arrayId === b.arrayId &&
      a.colorByArrayName === b.colorByArrayName &&
      a.colorMode === b.colorMode &&
      a.fieldDataTupleId === b.fieldDataTupleId &&
      a.interpolateScalarsBeforeMapping === b.interpolateScalarsBeforeMapping &&
      a.useLookupTableScalarRange === b.useLookupTableScalarRange &&
      a.scalarRange === b.scalarRange &&
      a.scalars === b.scalars &&
      (ignoreData || a.scalarsMTime === b.scalarsMTime) &&
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

  publicAPI.getNeedToRebuildBufferObjects = () => {
    const vbo = model.primitives[model.primTypes.Points].getCABO();
    return (
      !vbo.isReady() ||
      (vbo.getColorBO() && !vbo.getColorBO().isReady()) ||
      !isSameVBOState(model.pointGaussianVBOState, getVBOState())
    );
  };

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

  const effectivePointCount = () => {
    const available = model.currentInput.getPoints().getNumberOfPoints();
    const maximum = model.renderable.getMaximumPointCount();
    return maximum < 0
      ? available
      : Math.min(available, Math.max(0, Math.floor(maximum)));
  };

  publicAPI.renderPieceDraw = (ren, actor) => {
    const primitive = model.primitives[model.primTypes.Points];
    const cabo = primitive.getCABO();
    const available = cabo.getElementCount();
    const drawCount = Math.min(available, effectivePointCount());

    const selector = model._openGLRenderer.getSelector();
    primitive.setPointPicking(
      selector &&
        selector.getFieldAssociation() ===
          FieldAssociations.FIELD_ASSOCIATION_POINTS &&
        (model.lastSelectionState === PassTypes.ID_LOW24 ||
          model.lastSelectionState === PassTypes.ID_HIGH24)
    );

    if (!drawCount) {
      return;
    }

    if (drawCount !== available) {
      // The CABO owns the complete uploaded allocation. Its element count is
      // also the count the inherited draw path submits, so scope a temporary
      // cap to the draw and restore the allocation's full logical size after.
      // No point/color data or VBO-build timestamp changes here.
      cabo.setElementCount(drawCount);
    }
    try {
      model.drawingEdges = false;
      model.lastBoundBO = primitive;
      model.primitiveIDOffset += primitive.drawArrays(
        ren,
        actor,
        actor.getProperty().getRepresentation(),
        publicAPI
      );
      if (!cabo.getIndexed()) {
        model.vertexIDOffset += cabo.getElementCount();
      }
    } finally {
      if (drawCount !== available) {
        cabo.setElementCount(available);
      }
    }
  };

  publicAPI.updateMaximumPointCellIds = () => {
    const selector = model._openGLRenderer.getSelector();
    if (
      selector &&
      selector.getFieldAssociation() ===
        FieldAssociations.FIELD_ASSOCIATION_POINTS
    ) {
      selector.setMaximumPointId(Math.max(0, effectivePointCount() - 1));
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
        actor.getProperty().getPointSize() *
          model.renderable.getPointSizeScale()
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
          model.renderable.getPointSizeScale() *
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
    const previous = model.pointGaussianUploadState;
    const points = poly.getPoints();
    const numPoints = points.getNumberOfPoints();
    const pointArray = points.getData();
    const vbo = model.primitives[model.primTypes.Points].getCABO();
    const colorState = vboState.color;
    const scalars = colorState.scalars;
    const rawColors = scalars?.getData();
    const rawComponents = scalars?.getNumberOfComponents();
    const directColors =
      colorState.scalarVisibility &&
      [ScalarMode.DEFAULT, ScalarMode.USE_POINT_DATA].includes(
        colorState.scalarMode
      ) &&
      [ColorMode.DEFAULT, ColorMode.DIRECT_SCALARS].includes(
        colorState.colorMode
      ) &&
      (rawColors instanceof Uint8Array ||
        rawColors instanceof Uint8ClampedArray) &&
      (rawComponents === 3 || rawComponents === 4) &&
      rawColors.length === numPoints * rawComponents;

    let colors = null;
    if (directColors) {
      colors = scalars;
    } else {
      if (!isSameColorState(model.pointGaussianColorState, colorState)) {
        model.renderable.mapScalars(poly, 1.0);
      }
      colors = model.renderable.getColorMapColors();
    }
    model.pointGaussianColorState = colorState;
    const colorData = colors?.getData();
    const colorComponents = colors?.getNumberOfComponents() ?? 0;

    const { useShiftAndScale, coordShift, coordScale } =
      computeCoordShiftAndScale(points);
    const sameTransform =
      previous &&
      previous.shift.every((value, i) => value === coordShift[i]) &&
      previous.scale.every((value, i) => value === coordScale[i]);
    const samePoints =
      previous &&
      previous.poly === poly &&
      previous.points === points &&
      previous.context === model.context &&
      previous.pointBuffer === pointArray.buffer &&
      previous.pointOffset === pointArray.byteOffset &&
      previous.pointType === pointArray.constructor &&
      sameTransform &&
      previous.pointComponents === points.getNumberOfComponents() &&
      vbo.isReady();
    const sameColors =
      previous &&
      previous.poly === poly &&
      previous.context === model.context &&
      previous.colors === colors &&
      previous.directColors === directColors &&
      previous.colorBuffer === colorData?.buffer &&
      previous.colorOffset === colorData?.byteOffset &&
      previous.colorComponents === colorComponents &&
      isSameColorState(previous.colorState, colorState, true) &&
      vbo.getColorBO()?.isReady();

    const pointChange = samePoints
      ? points.getDataChangeSince(previous.pointsMTime)
      : null;
    const colorChange =
      sameColors && directColors
        ? scalars.getDataChangeSince(previous.colorMTime)
        : null;
    const interval = (change, components, count, oldCount) => {
      if (!change || count < oldCount) return null;
      const start = Math.floor(change.startValue / components);
      const end = Math.ceil(change.endValue / components);
      // A size increase must include the entire newly exposed tail.
      if (count > oldCount && (start > oldCount || end < count)) return null;
      // One conservative envelope, with a full-upload crossover at 50%.
      return end <= count && end - start <= count * 0.5 ? [start, end] : null;
    };
    const pointRange = interval(pointChange, 3, numPoints, previous?.numPoints);
    const colorRange = interval(
      colorChange,
      colorComponents,
      numPoints,
      previous?.numPoints
    );

    const packPoints = (start, end) => {
      if (
        !useShiftAndScale &&
        pointArray instanceof Float32Array &&
        points.getNumberOfComponents() === 3 &&
        pointArray.length === numPoints * 3
      ) {
        return start === 0 && end === numPoints
          ? pointArray
          : pointArray.subarray(start * 3, end * 3);
      }
      const packed = new Float32Array((end - start) * 3);
      for (let i = start; i < end; i++) {
        for (let c = 0; c < 3; c++) {
          packed[(i - start) * 3 + c] =
            (pointArray[i * 3 + c] - coordShift[c]) * coordScale[c];
        }
      }
      return packed;
    };
    const packColors = (start, end) => {
      if (
        colorComponents === 4 &&
        colorData.length === numPoints * 4 &&
        (colorData instanceof Uint8Array ||
          colorData instanceof Uint8ClampedArray)
      ) {
        return start === 0 && end === numPoints
          ? colorData
          : colorData.subarray(start * 4, end * 4);
      }
      const packed = new Uint8Array((end - start) * 4);
      for (let i = start; i < end; i++) {
        const src = i * colorComponents;
        const dst = (i - start) * 4;
        packed[dst] = colorData[src];
        packed[dst + 1] = colorData[src + 1];
        packed[dst + 2] = colorData[src + 2];
        packed[dst + 3] = colorComponents === 4 ? colorData[src + 3] : 255;
      }
      return packed;
    };
    const upload = (buffer, range, pack, stride, capacityBytes) => {
      if (range && buffer.getBufferSizeInBytes() >= numPoints * stride) {
        if (range[1] > range[0]) {
          buffer.uploadRange(
            pack(...range),
            ObjectType.ARRAY_BUFFER,
            range[0] * stride
          );
        }
      } else if (
        capacityBytes > numPoints * stride &&
        buffer.isReady() &&
        buffer.getBufferSizeInBytes() === capacityBytes
      ) {
        buffer.uploadRange(pack(0, numPoints), ObjectType.ARRAY_BUFFER);
      } else if (capacityBytes > numPoints * stride) {
        buffer.allocate(capacityBytes, ObjectType.ARRAY_BUFFER);
        buffer.uploadRange(pack(0, numPoints), ObjectType.ARRAY_BUFFER);
      } else {
        buffer.upload(pack(0, numPoints), ObjectType.ARRAY_BUFFER);
      }
    };
    vbo.setStride(12);
    vbo.setCoordShiftAndScale(
      useShiftAndScale ? coordShift : null,
      useShiftAndScale ? coordScale : null
    );
    upload(vbo, pointRange, packPoints, 12, points.getCapacity() * 4);
    if (colors) {
      if (!vbo.getColorBO()) vbo.setColorBO(vtkBufferObject.newInstance());
      const colorBO = vbo.getColorBO();
      colorBO.setOpenGLRenderWindow(model._openGLRenderWindow);
      vbo.setColorOffset(0);
      vbo.setColorBOStride(4);
      upload(
        colorBO,
        colorRange,
        packColors,
        4,
        directColors
          ? Math.floor(scalars.getCapacity() / colorComponents) * 4
          : numPoints * 4
      );
    } else if (vbo.getColorBO()) {
      vbo.setColorBO(null);
    }
    vbo.setColorComponents(colorComponents);
    vbo.setElementCount(numPoints);
    model.pointGaussianUploadState = {
      ...vboState,
      numPoints,
      pointBuffer: pointArray.buffer,
      pointOffset: pointArray.byteOffset,
      pointType: pointArray.constructor,
      pointComponents: points.getNumberOfComponents(),
      colors,
      directColors,
      colorBuffer: colorData?.buffer,
      colorOffset: colorData?.byteOffset,
      colorComponents,
      colorMTime: colors?.getMTime(),
      colorState,
      shift: Array.from(coordShift),
      scale: Array.from(coordScale),
    };

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
  pointGaussianUploadState: null,
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
