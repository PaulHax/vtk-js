import { mat3, mat4 } from 'gl-matrix';

import * as macro from 'vtk.js/Sources/macros';

import vtkBufferObject from 'vtk.js/Sources/Rendering/OpenGL/BufferObject';
import vtkOpenGLPolyDataMapper from 'vtk.js/Sources/Rendering/OpenGL/PolyDataMapper';
import vtkShaderProgram from 'vtk.js/Sources/Rendering/OpenGL/ShaderProgram';
import vtkPointGaussianVS from 'vtk.js/Sources/Rendering/OpenGL/glsl/vtkPointGaussianVS.glsl';

import { ObjectType } from 'vtk.js/Sources/Rendering/OpenGL/BufferObject/Constants';
import { PassTypes } from 'vtk.js/Sources/Rendering/OpenGL/HardwareSelector/Constants';
import { computeCoordShiftAndScale } from 'vtk.js/Sources/Rendering/OpenGL/CellArrayBufferObject/helpers';
import { registerOverride } from 'vtk.js/Sources/Rendering/OpenGL/ViewNodeFactory';
import {
  buildTable,
  createComponentReader,
  getLookupKey,
  getPointArray,
  lookupTable,
  objectKey,
  sameKey,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/helpers';

const { vtkErrorMacro, vtkWarningMacro } = macro;

// ----------------------------------------------------------------------------
// Buffer helpers
// ----------------------------------------------------------------------------

// A vtkPointSet has points but no cells.
function getVerts(dataSet) {
  return dataSet.getVerts ? dataSet.getVerts() : null;
}

// The points drawn: those the verts cells reference, in cell order, or every
// point when there are no verts. pointIds is null when they are every point
// once, in order; cellIds, the verts cell of each drawn point, is null when
// every cell holds one point, so that a drawn index is a cell id.
function getSelection(verts, numberOfPoints) {
  if (!verts || !verts.getNumberOfCells()) {
    return { count: numberOfPoints, pointIds: null, cellIds: null };
  }
  const data = verts.getData();
  let count = 0;
  let inOrder = true;
  let onePerCell = true;
  for (let i = 0; i < data.length; i += data[i] + 1) {
    onePerCell = onePerCell && data[i] === 1;
    for (let j = 1; j <= data[i]; j++, count++) {
      inOrder = inOrder && data[i + j] === count;
    }
  }
  const pointIds =
    inOrder && count === numberOfPoints ? null : new Int32Array(count);
  const cellIds = onePerCell ? null : new Int32Array(count);
  if (pointIds || cellIds) {
    let next = 0;
    for (let i = 0, cell = 0; i < data.length; i += data[i] + 1, cell++) {
      for (let j = 1; j <= data[i]; j++, next++) {
        if (pointIds) {
          pointIds[next] = data[i + j];
        }
        if (cellIds) {
          cellIds[next] = cell;
        }
      }
    }
  }
  return { count, pointIds, cellIds };
}

// Positions relative to the VBO shift and scale, one xyz per drawn point.
function packPositions(points, { pointIds, count }, coordShift, coordScale) {
  const data = points.getData();
  const numberOfComponents = points.getNumberOfComponents();
  const packed = new Float32Array(3 * count);
  const [shiftX, shiftY, shiftZ] = coordShift;
  const [scaleX, scaleY, scaleZ] = coordScale;
  for (let i = 0; i < count; i++) {
    const source = (pointIds ? pointIds[i] : i) * numberOfComponents;
    packed[3 * i] = (data[source] - shiftX) * scaleX;
    packed[3 * i + 1] =
      numberOfComponents > 1 ? (data[source + 1] - shiftY) * scaleY : 0;
    packed[3 * i + 2] =
      numberOfComponents > 2 ? (data[source + 2] - shiftZ) * scaleZ : 0;
  }
  return packed;
}

// Tuples of a data array for the drawn points, as an ArrayType array: the
// array itself when it already has that layout (bufferData copies it), a
// gathered copy otherwise.
function gatherTuples(
  dataArray,
  { pointIds, count },
  ArrayType = Float32Array
) {
  const data = dataArray.getData();
  const numberOfComponents = dataArray.getNumberOfComponents();
  if (
    !pointIds &&
    data instanceof ArrayType &&
    data.length === count * numberOfComponents
  ) {
    return data;
  }
  const packed = new ArrayType(count * numberOfComponents);
  for (let i = 0; i < count; i++) {
    const source = (pointIds ? pointIds[i] : i) * numberOfComponents;
    for (let c = 0; c < numberOfComponents; c++) {
      packed[i * numberOfComponents + c] = data[source + c];
    }
  }
  return packed;
}

// One value per drawn point from the selected component, mapped through the
// optional table.
function gatherValues(dataArray, component, table, selection) {
  if (!table && dataArray.getNumberOfComponents() === 1) {
    return gatherTuples(dataArray, selection);
  }
  const { pointIds, count } = selection;
  const read = createComponentReader(dataArray, component);
  const packed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const value = read(pointIds ? pointIds[i] : i);
    packed[i] = table ? lookupTable(table, value) : value;
  }
  return packed;
}

const BUFFERS = ['positions', 'colors', 'radius', 'rotation', 'opacity'];

// ----------------------------------------------------------------------------
// vtkOpenGLPointGaussianMapper methods
// ----------------------------------------------------------------------------

function vtkOpenGLPointGaussianMapper(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkOpenGLPointGaussianMapper');

  // Capture 'parentClass' api for internal use
  const superClass = { ...publicAPI };

  const getPointsPrimitive = () => model.primitives[model.primTypes.Points];
  const isSplatting = () => model.renderable.getScaleFactor() !== 0;

  // --------------------------------------------------------------------------
  // Render passes
  // --------------------------------------------------------------------------

  // Emissive points add light, except while a selector draws ids.
  const isAdditive = () =>
    model.renderable.getEmissive() && !model._openGLRenderer.getSelector();

  // Additive points: their colours add up, their alphas accumulate as
  // coverage, and they write no depth. The render window defaults are
  // restored afterwards.
  publicAPI.opaquePass = (prepass) => {
    if (!prepass || !isAdditive()) {
      superClass.opaquePass(prepass);
      return;
    }
    const gl = model._openGLRenderWindow.getContext();
    gl.depthMask(false);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
    superClass.opaquePass(prepass);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA
    );
    gl.depthMask(true);
  };

  // Additive points write no depth, so volumes and depth requests see
  // through them.
  publicAPI.zBufferPass = (prepass) => {
    if (!isAdditive()) {
      superClass.zBufferPass(prepass);
    }
  };

  // --------------------------------------------------------------------------
  // Shaders
  // --------------------------------------------------------------------------

  publicAPI.getShaderTemplate = (shaders, ren, actor) => {
    superClass.getShaderTemplate(shaders, ren, actor);
    if (isSplatting()) {
      shaders.Vertex = vtkPointGaussianVS;
    }
  };

  function replaceShaderSplat(shaders) {
    const { anisotropic, radius, rotation } = model.layout;
    // Per-point values come from a buffer when there is one.
    const declare = (isAttribute, type, name, value) =>
      isAttribute
        ? `attribute ${type} ${name};`
        : `const ${type} ${name} = ${value};`;

    let VSSource = shaders.Vertex;
    if (anisotropic) {
      VSSource = vtkShaderProgram.substitute(
        VSSource,
        '//VTK::Covariance::Dec',
        [
          declare(radius, 'vec3', 'radiusMC', 'vec3(1.0)'),
          declare(rotation, 'vec4', 'rotationMC', 'vec4(1.0, 0.0, 0.0, 0.0)'),
        ]
      ).result;
      VSSource = vtkShaderProgram.substitute(
        VSSource,
        '//VTK::Covariance::Impl',
        '  mat3 cov = T * computeCov3D(radiusMC, rotationMC) * transpose(T);'
      ).result;
    } else {
      VSSource = vtkShaderProgram.substitute(
        VSSource,
        '//VTK::Covariance::Dec',
        declare(radius, 'float', 'radiusMC', '1.0')
      ).result;
      VSSource = vtkShaderProgram.substitute(
        VSSource,
        '//VTK::Covariance::Impl',
        [
          '  float radius = scaleFactor * radiusMC;',
          '  mat3 cov = (radius * radius) * T * transpose(T);',
        ]
      ).result;
    }

    let FSSource = shaders.Fragment;
    FSSource = vtkShaderProgram.substitute(FSSource, '//VTK::PositionVC::Dec', [
      '//VTK::PositionVC::Dec',
      'varying vec2 offsetVCVSOutput;',
    ]).result;
    const splatShaderCode = model.renderable.getSplatShaderCode();
    FSSource = vtkShaderProgram.substitute(
      FSSource,
      '//VTK::Color::Impl',
      splatShaderCode || [
        '//VTK::Color::Impl',
        '  float dist2 = dot(offsetVCVSOutput, offsetVCVSOutput);',
        '  opacity = opacity * exp(-0.5 * dist2);',
      ],
      false
    ).result;

    shaders.Vertex = VSSource;
    shaders.Fragment = FSSource;
  }

  // The opacity array replaces the alpha of the point colour; it sits right
  // after the colour computation, before any splat code.
  function replaceShaderScalarOpacity(shaders) {
    shaders.Vertex = vtkShaderProgram.substitute(
      shaders.Vertex,
      '//VTK::Color::Dec',
      [
        '//VTK::Color::Dec',
        'attribute float scalarOpacity;',
        'varying float scalarOpacityVSOutput;',
      ]
    ).result;
    shaders.Vertex = vtkShaderProgram.substitute(
      shaders.Vertex,
      '//VTK::Color::Impl',
      ['//VTK::Color::Impl', '  scalarOpacityVSOutput = scalarOpacity;']
    ).result;
    shaders.Fragment = vtkShaderProgram.substitute(
      shaders.Fragment,
      '//VTK::Color::Dec',
      ['//VTK::Color::Dec', 'varying float scalarOpacityVSOutput;']
    ).result;
    shaders.Fragment = vtkShaderProgram.substitute(
      shaders.Fragment,
      '//VTK::Color::Impl',
      [
        '//VTK::Color::Impl',
        '  opacity = opacityUniform * clamp(scalarOpacityVSOutput, 0.0, 1.0);',
      ],
      false
    ).result;
  }

  publicAPI.replaceShaderValues = (shaders, ren, actor) => {
    if (isSplatting()) {
      replaceShaderSplat(shaders);
    }
    if (model.layout.opacity) {
      replaceShaderScalarOpacity(shaders);
    }
    superClass.replaceShaderValues(shaders, ren, actor);
  };

  // A splat's four vertices share its instance, whose index is the drawn
  // point. The superclass then declares what this statement uses.
  publicAPI.replaceShaderPicking = (shaders, ren, actor) => {
    if (
      isSplatting() &&
      (model.lastSelectionState === PassTypes.ID_LOW24 ||
        model.lastSelectionState === PassTypes.ID_HIGH24)
    ) {
      shaders.Vertex = vtkShaderProgram.substitute(
        shaders.Vertex,
        '//VTK::Picking::Impl',
        '  vertexIDVSOutput = gl_InstanceID + VertexIDOffset;'
      ).result;
    }
    superClass.replaceShaderPicking(shaders, ren, actor);
  };

  // Always unlit, as in VTK: a point or splat has no surface normal. The
  // superclass light check is skipped, so the light state keeps its initial 0.
  publicAPI.getNeedToRebuildShaders = (cellBO, ren, actor) => {
    // The input reaches the shaders only through the buffers built from it,
    // which the shaders declare.
    const { anisotropic, radius, rotation, opacity } = model.layout;
    const layoutKey = [
      anisotropic,
      radius,
      rotation,
      opacity,
      cellBO.getCABO().getColorComponents(),
    ].join();
    let needRebuild = false;
    if (cellBO.getReferenceByName('pointGaussianLayout') !== layoutKey) {
      cellBO.set({ pointGaussianLayout: layoutKey }, true);
      needRebuild = true;
    }

    const renderPassReplacement = model.currentRenderPass
      ? model.currentRenderPass.getShaderReplacement()
      : null;
    const shaderTime = cellBO.getShaderSourceTime().getMTime();
    if (
      needRebuild ||
      renderPassReplacement !== model.lastRenderPassShaderReplacement ||
      model.lastHaveSeenDepthRequest !== model.haveSeenDepthRequest ||
      shaderTime < model.renderable.getMTime() ||
      shaderTime < model.selectionStateChanged.getMTime()
    ) {
      model.lastHaveSeenDepthRequest = model.haveSeenDepthRequest;
      return true;
    }
    return false;
  };

  // The per-point attributes: per vertex for simple points, per instance for
  // splats, which also rebinds the ones the superclass bound per vertex.
  function bindPointAttributes(cellBO) {
    const gl = model.context;
    const program = cellBO.getProgram();
    const cabo = cellBO.getCABO();
    const divisor = isSplatting() ? 1 : 0;
    const bind = (
      buffer,
      name,
      components,
      { type = gl.FLOAT, normalize = false, offset = 0, stride = 0 } = {}
    ) => {
      if (
        program.isAttributeUsed(name) &&
        !cellBO
          .getVAO()
          .addAttributeArrayWithDivisor(
            program,
            buffer,
            name,
            offset,
            stride,
            type,
            components,
            normalize,
            divisor,
            false
          )
      ) {
        vtkErrorMacro(`Error setting ${name} in shader VAO.`);
      }
    };

    if (divisor) {
      bind(cabo, 'vertexMC', 3, {
        offset: cabo.getVertexOffset(),
        stride: cabo.getStride(),
      });
      if (cabo.getColorComponents()) {
        bind(cabo.getColorBO(), 'scalarColor', 4, {
          type: gl.UNSIGNED_BYTE,
          normalize: true,
          offset: cabo.getColorOffset(),
          stride: cabo.getColorBOStride(),
        });
      }
    }
    const { anisotropic, radius, rotation, opacity } = model.layout;
    if (radius) {
      bind(model.radiusBO, 'radiusMC', anisotropic ? 3 : 1);
    }
    if (rotation) {
      bind(model.rotationBO, 'rotationMC', 4);
    }
    if (opacity) {
      bind(model.opacityBO, 'scalarOpacity', 1);
    }
  }

  publicAPI.setMapperShaderParameters = (cellBO, ren, actor) => {
    // The superclass binds its attributes again when the buffers or the
    // program change.
    const attributeTime = cellBO.getAttributeUpdateTime().getMTime();
    superClass.setMapperShaderParameters(cellBO, ren, actor);
    if (cellBO.getAttributeUpdateTime().getMTime() !== attributeTime) {
      bindPointAttributes(cellBO);
    }

    if (isSplatting()) {
      const program = cellBO.getProgram();
      const renderable = model.renderable;
      program.setUniformf('scaleFactor', renderable.getScaleFactor());
      program.setUniformf('boundScale', renderable.getBoundScale());
      const [a, b, c] = renderable.getLowpassMatrixByReference() || [0, 0, 0];
      program.setUniform3f('lowpassMatrix', a, b, c);
    }
  };

  publicAPI.setCameraShaderParameters = (cellBO, ren, actor) => {
    superClass.setCameraShaderParameters(cellBO, ren, actor);
    if (!isSplatting()) {
      return;
    }
    // The covariance is in model units, so it uses the model to view transform
    // without the VBO shift and scale that MCVCMatrix folds in.
    const program = cellBO.getProgram();
    const keyMats = model.openGLCamera.getKeyMatrices(ren);
    const modelToView = actor.getIsIdentity()
      ? keyMats.wcvc
      : mat4.multiply(
          model.tmpMat4,
          keyMats.wcvc,
          model.openGLActor.getKeyMatrices().mcwc
        );
    program.setUniformMatrix3x3(
      'MCVCLinearMatrix',
      mat3.fromMat4(model.tmpMat3, modelToView)
    );
    program.setUniformMatrix('VCPCMatrix', keyMats.vcpc);
  };

  // --------------------------------------------------------------------------
  // Drawing
  // --------------------------------------------------------------------------

  publicAPI.renderPieceDraw = (ren, actor) => {
    const primitive = getPointsPrimitive();
    const count = primitive.getCABO().getElementCount();
    if (!count) {
      return;
    }
    const gl = model.context;
    model.lastBoundBO = primitive;
    primitive.updateShaders(ren, actor, publicAPI);
    if (isSplatting()) {
      // Splats face the camera, so, like simple points, none is culled.
      model._openGLRenderWindow.disableCullFace();
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    } else {
      gl.drawArrays(gl.POINTS, 0, count);
    }
  };

  // Selection passes write drawn indices, which selectionWebGLIdsToVTKIds
  // maps to point and cell ids.
  publicAPI.updateMaximumPointCellIds = () => {
    const selector = model._openGLRenderer.getSelector();
    if (selector) {
      const largestId = Math.max(
        0,
        getPointsPrimitive().getCABO().getElementCount() - 1
      );
      selector.setMaximumPointId(largestId);
      selector.setMaximumCellId(largestId);
    }
  };

  // --------------------------------------------------------------------------
  // Buffers
  // --------------------------------------------------------------------------

  function getColorKey(poly) {
    const renderable = model.renderable;
    if (!renderable.getScalarVisibility()) {
      return [false];
    }
    const scalarSource = [
      renderable.getScalarMode(),
      renderable.getArrayAccessMode(),
      renderable.getReferenceByName('arrayId'),
      renderable.getColorByArrayName(),
    ];
    const { scalars } = renderable.getAbstractScalars(poly, ...scalarSource);
    return [
      true,
      ...scalarSource,
      renderable.getColorMode(),
      renderable.getFieldDataTupleId(),
      renderable.getUseLookupTableScalarRange(),
      ...renderable.getScalarRange(),
      ...objectKey(scalars),
      ...objectKey(scalars ? renderable.getLookupTable() : null),
    ];
  }

  // What each buffer is built from, in which context.
  function getBufferKeys(poly) {
    const renderable = model.renderable;
    const splatting = isSplatting();
    const anisotropic = splatting && renderable.getAnisotropic();
    return {
      context: model.context,
      selection: [
        poly.getPoints().getNumberOfPoints(),
        ...objectKey(getVerts(poly)),
      ],
      positions: objectKey(poly.getPoints()),
      colors: getColorKey(poly),
      radius: splatting
        ? [
            anisotropic,
            ...getLookupKey(
              getPointArray(poly, renderable.getScaleArray()),
              anisotropic ? 0 : renderable.getScaleArrayComponent(),
              anisotropic ? null : renderable.getScaleFunction(),
              renderable.getScaleTableSize()
            ),
          ]
        : null,
      rotation: anisotropic
        ? objectKey(getPointArray(poly, renderable.getRotationArray()))
        : null,
      opacity: renderable.getOpacityArray()
        ? getLookupKey(
            getPointArray(poly, renderable.getOpacityArray()),
            renderable.getOpacityArrayComponent(),
            renderable.getScalarOpacityFunction(),
            renderable.getOpacityTableSize()
          )
        : null,
    };
  }

  // The buffers to upload again, and whether to find the drawn points again
  // first, which rebuilds every buffer.
  function getStaleBuffers(poly, keys) {
    const built = model.bufferKeys;
    if (
      built &&
      built.context === keys.context &&
      sameKey(keys.selection, built.selection)
    ) {
      const stale = BUFFERS.filter((name) => !sameKey(keys[name], built[name]));
      // The keys hold array MTimes, so the polydata itself marked modified
      // while none of them changed means an array was edited in place.
      if (
        stale.length ||
        poly.getReferenceByName('mtime') <= model.VBOBuildTime.getMTime()
      ) {
        return { reselect: false, stale };
      }
    }
    return { reselect: true, stale: BUFFERS };
  }

  // Uploads data to buffer, created when missing, and returns the buffer.
  function uploadArrayBuffer(buffer, data) {
    const target = buffer || vtkBufferObject.newInstance();
    target.setOpenGLRenderWindow(model._openGLRenderWindow);
    target.upload(data, ObjectType.ARRAY_BUFFER);
    return target;
  }

  // An optional per-point buffer, released when there is no data for it.
  // Returns whether the shaders read it.
  function uploadBuffer(name, data) {
    if (!data) {
      model[name]?.releaseGraphicsResources();
      return false;
    }
    model[name] = uploadArrayBuffer(model[name], data);
    return true;
  }

  function uploadPositions(cabo, points, selection) {
    const { useShiftAndScale, coordShift, coordScale } =
      computeCoordShiftAndScale(points);
    cabo.setCoordShiftAndScale(
      useShiftAndScale ? coordShift : null,
      useShiftAndScale ? coordScale : null
    );
    // The buffer keeps its shift and scale when the new ones are nearly
    // equal, so positions are packed with the ones it kept.
    const packed =
      useShiftAndScale || points.getNumberOfComponents() !== 3
        ? packPositions(
            points,
            selection,
            useShiftAndScale ? cabo.getCoordShift() : coordShift,
            useShiftAndScale ? cabo.getCoordScale() : coordScale
          )
        : gatherTuples(points, selection);
    cabo.setStride(12);
    cabo.setVertexOffset(0);
    cabo.upload(packed, ObjectType.ARRAY_BUFFER);
  }

  // The colour tuple of each drawn point, as a selection gatherTuples reads,
  // or null when the mapped colours cannot colour the drawn points.
  function getColorSelection(colors, poly, { count, pointIds, cellIds }) {
    const tuples = colors.getNumberOfTuples();
    if (model.renderable.getAreScalarsMappedFromCells()) {
      // Cell colours reach points only through the verts cells drawing them;
      // verts come first in the cell order, so a verts index is a cell id.
      const verts = getVerts(poly);
      const numberOfVerts = verts ? verts.getNumberOfCells() : 0;
      return numberOfVerts && tuples >= numberOfVerts
        ? { count, pointIds: cellIds }
        : null;
    }
    if (tuples >= poly.getPoints().getNumberOfPoints()) {
      return { count, pointIds };
    }
    return tuples === 1 ? { count, pointIds: new Int32Array(count) } : null;
  }

  function uploadColors(cabo, poly, selection) {
    model.renderable.mapScalars(poly, 1.0);
    const colors = model.renderable.getColorMapColors();
    const colorSelection = colors && getColorSelection(colors, poly, selection);
    if (!colorSelection) {
      cabo.getColorBO()?.releaseGraphicsResources();
      cabo.setColorBO(null);
      cabo.setColorComponents(0);
      return;
    }
    // Mapped colours are RGBA bytes.
    cabo.setColorBO(
      uploadArrayBuffer(
        cabo.getColorBO(),
        gatherTuples(colors, colorSelection, Uint8Array)
      )
    );
    cabo.setColorComponents(4);
    cabo.setColorOffset(0);
    cabo.setColorBOStride(4);
  }

  function buildRadius(poly, selection) {
    const renderable = model.renderable;
    const scales = getPointArray(poly, renderable.getScaleArray());
    if (!scales) {
      return null;
    }
    if (renderable.getAnisotropic()) {
      if (scales.getNumberOfComponents() !== 3) {
        vtkWarningMacro(
          `Anisotropic splats need a 3-component scale array; ${scales.getName()} has ${scales.getNumberOfComponents()}.`
        );
        return null;
      }
      return gatherTuples(scales, selection);
    }
    return gatherValues(
      scales,
      renderable.getScaleArrayComponent(),
      buildTable(renderable.getScaleFunction(), renderable.getScaleTableSize()),
      selection
    );
  }

  function buildRotation(poly, selection) {
    const rotations = getPointArray(poly, model.renderable.getRotationArray());
    if (!rotations) {
      return null;
    }
    if (rotations.getNumberOfComponents() !== 4) {
      vtkWarningMacro(
        `The rotation array needs 4 components (a quaternion); ${rotations.getName()} has ${rotations.getNumberOfComponents()}.`
      );
      return null;
    }
    return gatherTuples(rotations, selection);
  }

  function buildOpacity(poly, selection) {
    const renderable = model.renderable;
    const opacities = getPointArray(poly, renderable.getOpacityArray());
    if (!opacities) {
      return null;
    }
    return gatherValues(
      opacities,
      renderable.getOpacityArrayComponent(),
      buildTable(
        renderable.getScalarOpacityFunction(),
        renderable.getOpacityTableSize()
      ),
      selection
    );
  }

  const builders = {
    radius: buildRadius,
    rotation: buildRotation,
    opacity: buildOpacity,
  };

  publicAPI.getNeedToRebuildBufferObjects = () => {
    const poly = model.currentInput;
    if (
      model.bufferKeys?.context === model.context &&
      model.bufferKeysTime.getMTime() >
        Math.max(poly.getMTime(), model.renderable.getMTime())
    ) {
      return false;
    }
    model.bufferKeysTime.modified();
    return getStaleBuffers(poly, getBufferKeys(poly)).stale.length > 0;
  };

  publicAPI.buildBufferObjects = (ren, actor) => {
    const poly = model.currentInput;
    const keys = getBufferKeys(poly);
    const { reselect, stale } = getStaleBuffers(poly, keys);
    if (reselect) {
      model.selection = getSelection(
        getVerts(poly),
        poly.getPoints().getNumberOfPoints()
      );
      const { pointIds, cellIds } = model.selection;
      model.renderable.setSelectionWebGLIdsToVTKIds(
        pointIds || cellIds ? { points: pointIds, cells: cellIds } : null
      );
    }
    const { selection, layout } = model;
    const cabo = getPointsPrimitive().getCABO();

    if (stale.includes('positions')) {
      uploadPositions(cabo, poly.getPoints(), selection);
    }
    if (stale.includes('colors')) {
      uploadColors(cabo, poly, selection);
      // Mapping can update the lookup table range; key on the result.
      keys.colors = getColorKey(poly);
    }
    Object.entries(builders).forEach(([name, build]) => {
      if (stale.includes(name)) {
        layout[name] = uploadBuffer(
          `${name}BO`,
          keys[name] && build(poly, selection)
        );
      }
    });
    layout.anisotropic = isSplatting() && model.renderable.getAnisotropic();

    cabo.setElementCount(selection.count);
    model.bufferKeys = keys;
    model.VBOBuildTime.modified();
    model.bufferKeysTime.modified();
  };

  // --------------------------------------------------------------------------
  // Resources
  // --------------------------------------------------------------------------

  const getSplatBuffers = () =>
    [model.radiusBO, model.rotationBO, model.opacityBO].filter(Boolean);

  publicAPI.releaseGraphicsResources = (renderWindow) => {
    superClass.releaseGraphicsResources(renderWindow);
    getSplatBuffers().forEach((buffer) => buffer.releaseGraphicsResources());
    model.bufferKeys = null;
    model.selection = null;
  };

  publicAPI.getAllocatedGPUMemoryInBytes = () =>
    getSplatBuffers().reduce(
      (total, buffer) => total + buffer.getAllocatedGPUMemoryInBytes(),
      superClass.getAllocatedGPUMemoryInBytes()
    );
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  bufferKeys: null,
  selection: null,
  radiusBO: null,
  rotationBO: null,
  opacityBO: null,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Inheritance
  vtkOpenGLPolyDataMapper.extend(publicAPI, model, initialValues);

  // Which per-point buffers the shaders read, as built.
  model.layout = {
    anisotropic: false,
    radius: false,
    rotation: false,
    opacity: false,
  };
  model.bufferKeysTime = {};
  macro.obj(model.bufferKeysTime, { mtime: 0 });

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
