import macro from 'vtk.js/Sources/macros';
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math';
import vtkBoundingBox from 'vtk.js/Sources/Common/DataModel/BoundingBox';
import { getPixelWorldHeightAtCoord } from 'vtk.js/Sources/Widgets/Core/WidgetManager';
import vtkWidgetRepresentation, {
  allocateArray,
} from 'vtk.js/Sources/Widgets/Representations/WidgetRepresentation';
import { RenderingTypes } from 'vtk.js/Sources/Widgets/Core/WidgetManager/Constants';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkGlyph3DMapper from 'vtk.js/Sources/Rendering/Core/Glyph3DMapper';
import {
  OrientationModes,
  ScaleModes,
} from 'vtk.js/Sources/Rendering/Core/Glyph3DMapper/Constants';
import vtkCylinderSource from 'vtk.js/Sources/Filters/Sources/CylinderSource';
import { vec3 } from 'gl-matrix';

function vtkLineGlyphRepresentation(publicAPI, model) {
  model.classHierarchy.push('vtkLineGlyphRepresentation');
  const superClass = { ...publicAPI };

  const internalPolyData = vtkPolyData.newInstance({ mtime: 0 });

  function allocateSize(polyData, pointCount, close = false) {
    const glyphCount = pointCount + (close ? 0 : -1);
    if (
      !polyData.getPoints() ||
      polyData.getPoints().length !== glyphCount * 3
    ) {
      allocateArray(polyData, 'points', glyphCount).getData();
    }

    const cellSize = glyphCount + 1;
    const oldSize = Array.from(polyData.getLines().getCellSizes())[0];
    if (oldSize !== cellSize) {
      const lines = allocateArray(polyData, 'lines', cellSize + 1); // +1 for to hold number of elements per cell
      const cellArray = lines.getData();
      cellArray[0] = cellSize;
      for (let i = 1; i <= cellSize; i++) {
        cellArray[i] = i - 1;
      }
      if (close) {
        cellArray[cellSize] = 0;
      }
      lines.setData(cellArray);
    }
  }

  /**
   * Change the segments' thickness.
   * @param {number} lineThickness
   */
  function applyLineThickness(lineThickness) {
    let scaledLineThickness = lineThickness;
    if (publicAPI.getScaleInPixels() && internalPolyData) {
      const center = vtkBoundingBox.getCenter(internalPolyData.getBounds());
      scaledLineThickness *= getPixelWorldHeightAtCoord(
        center,
        model.displayScaleParams
      );
    }
    model._pipeline.glyph.setRadius(scaledLineThickness);
  }

  model._pipeline = {
    source: publicAPI,
    glyph: vtkCylinderSource.newInstance({
      direction: [1, 0, 0],
      center: [0.5, 0, 0],
      capping: false,
    }),
    mapper: vtkGlyph3DMapper.newInstance({
      orientationArray: 'directions',
      orientationMode: OrientationModes.DIRECTION,
      scaleArray: 'lengths',
      scaleMode: ScaleModes.SCALE_BY_COMPONENTS,
    }),
    actor: vtkActor.newInstance({ parentProp: publicAPI }),
  };

  vtkWidgetRepresentation.connectPipeline(model._pipeline);
  publicAPI.addActor(model._pipeline.actor);

  // --------------------------------------------------------------------------
  publicAPI.requestData = (inData, outData) => {
    const state = inData[0];
    outData[0] = internalPolyData;

    const originStates = publicAPI.getRepresentationStates(state);
    const points = originStates
      .map((subState) => subState.getOrigin())
      .filter(Boolean); // filter out states that return invalid origins
    const pointCount = points.length;

    allocateSize(internalPolyData, pointCount, model.close && pointCount > 2);

    const glyphPositions = internalPolyData.getPoints().getData();
    // There can be only one line.
    const segments = internalPolyData.getLines().getData();

    const directions = allocateArray(
      internalPolyData,
      'directions',
      segments.length - 1,
      undefined,
      3
    ).getData();
    const lengths = allocateArray(
      internalPolyData,
      'lengths',
      segments.length - 1,
      undefined,
      3
    ).getData();

    const tempVector = []; // scratch
    for (let point = 1; point < segments.length - 1; point++) {
      const glyph = (point - 1) * 3; // start of glyph's 3 components in the arrays

      // With cylinder glyph's offset center, position at state origins.
      const origin = points[segments[point]];
      [
        glyphPositions[glyph],
        glyphPositions[glyph + 1],
        glyphPositions[glyph + 2],
      ] = origin;

      // Orient glyphs to next point.
      const target = points[segments[point + 1]];
      const direction = vtkMath.subtract(target, origin, tempVector);
      [directions[glyph], directions[glyph + 1], directions[glyph + 2]] =
        direction;

      // Scale to span between points.
      const distance = vec3.length(direction);
      lengths[glyph] = distance;
      lengths[glyph + 1] = 1;
      lengths[glyph + 2] = 1;
    }

    internalPolyData.getPoints().modified();
    internalPolyData.modified();

    const lineThickness = state.getLineThickness?.() ?? model.lineThickness;
    applyLineThickness(lineThickness);
  };

  // return array of all states
  publicAPI.getSelectedState = () => model.inputData[0];

  publicAPI.updateActorVisibility = (renderingType, ctxVisible, hVisible) => {
    const state = model.inputData[0];

    // Make lines/tubes thicker for picking
    let lineThickness = state.getLineThickness?.() ?? model.lineThickness;
    if (renderingType === RenderingTypes.PICKING_BUFFER) {
      lineThickness = Math.max(4, lineThickness);
    }
    applyLineThickness(lineThickness);

    return superClass.updateActorVisibility(
      renderingType,
      ctxVisible,
      hVisible
    );
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  close: false,
  lineThickness: 1,
  scaleInPixels: true,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  const newDefault = { ...DEFAULT_VALUES, ...initialValues };
  vtkWidgetRepresentation.extend(publicAPI, model, newDefault);
  macro.setGet(publicAPI, model, ['close', 'lineThickness']);

  vtkLineGlyphRepresentation(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkLineGlyphRepresentation'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
