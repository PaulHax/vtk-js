import macro from 'vtk.js/Sources/macros';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import { VtkDataTypes } from 'vtk.js/Sources/Common/Core/DataArray/Constants';
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math';

const { vtkErrorMacro } = macro;

// Seed each component as fastComputeRange does, preserving infinities and
// signed zeros, then compute all three ranges together.
function computeXYZBounds(values, bounds) {
  const length = values.length;
  for (let c = 0; c < 3; ++c) {
    bounds[2 * c] = Number.MAX_VALUE;
    bounds[2 * c + 1] = -Number.MAX_VALUE;
    for (let i = c; i < length; i += 3) {
      if (!Number.isNaN(values[i])) {
        bounds[2 * c] = values[i];
        bounds[2 * c + 1] = values[i];
        break;
      }
    }
  }
  for (let i = 0; i < length; i += 3) {
    const x = values[i];
    const y = values[i + 1];
    const z = values[i + 2];
    if (x < bounds[0]) bounds[0] = x;
    else if (x > bounds[1]) bounds[1] = x;
    if (y < bounds[2]) bounds[2] = y;
    else if (y > bounds[3]) bounds[3] = y;
    if (z < bounds[4]) bounds[4] = z;
    else if (z > bounds[5]) bounds[5] = z;
  }
}

// ----------------------------------------------------------------------------
// vtkPoints methods
// ----------------------------------------------------------------------------

function vtkPoints(publicAPI, model) {
  // Keep track of modified time for bounds computation
  let boundMTime = 0;

  // Set our className
  model.classHierarchy.push('vtkPoints');

  // Forwarding methods
  publicAPI.getNumberOfPoints = publicAPI.getNumberOfTuples;

  publicAPI.setNumberOfPoints = (nbPoints, dimension = 3) => {
    if (publicAPI.getNumberOfPoints() !== nbPoints) {
      model.size = nbPoints * dimension;
      model.values = macro.newTypedArray(model.dataType, model.size);
      publicAPI.setNumberOfComponents(dimension);
      publicAPI.modified();
    }
  };

  publicAPI.setPoint = (idx, ...xyz) => {
    publicAPI.setTuple(idx, xyz);
  };

  publicAPI.getPoint = publicAPI.getTuple;
  publicAPI.findPoint = publicAPI.findTuple;

  publicAPI.insertNextPoint = (x, y, z) => publicAPI.insertNextTuple([x, y, z]);

  publicAPI.insertPoint = (ptId, point) => publicAPI.insertTuple(ptId, point);

  const superGetBounds = publicAPI.getBounds;
  publicAPI.getBounds = () => {
    if (boundMTime < model.mtime) {
      publicAPI.computeBounds();
    }
    return superGetBounds();
  };

  const superGetBoundsByReference = publicAPI.getBoundsByReference;
  publicAPI.getBoundsByReference = () => {
    if (boundMTime < model.mtime) {
      publicAPI.computeBounds();
    }
    return superGetBoundsByReference();
  };

  // Trigger the computation of bounds
  publicAPI.computeBounds = () => {
    if (publicAPI.getNumberOfComponents() === 3) {
      if (!model.ranges) {
        // Only combine scans when no cached or explicitly set range exists.
        computeXYZBounds(publicAPI.getData(), model.bounds);
        for (let c = 0; c < 3; ++c) {
          publicAPI.setRange(
            { min: model.bounds[2 * c], max: model.bounds[2 * c + 1] },
            c
          );
        }
      } else {
        const xRange = publicAPI.getRange(0);
        model.bounds[0] = xRange[0];
        model.bounds[1] = xRange[1];
        const yRange = publicAPI.getRange(1);
        model.bounds[2] = yRange[0];
        model.bounds[3] = yRange[1];
        const zRange = publicAPI.getRange(2);
        model.bounds[4] = zRange[0];
        model.bounds[5] = zRange[1];
      }
    } else if (publicAPI.getNumberOfComponents() === 2) {
      const xRange = publicAPI.getRange(0);
      model.bounds[0] = xRange[0];
      model.bounds[1] = xRange[1];
      const yRange = publicAPI.getRange(1);
      model.bounds[2] = yRange[0];
      model.bounds[3] = yRange[1];
      model.bounds[4] = 0;
      model.bounds[5] = 0;
    } else {
      vtkErrorMacro(
        `getBounds called on an array with components of ${publicAPI.getNumberOfComponents()}`
      );
      vtkMath.uninitializeBounds(model.bounds);
    }
    boundMTime = macro.getCurrentGlobalMTime();
  };

  // Initialize
  publicAPI.setNumberOfComponents(
    model.numberOfComponents < 2 ? 3 : model.numberOfComponents
  );
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  empty: true,
  numberOfComponents: 3,
  dataType: VtkDataTypes.FLOAT,
  bounds: [1, -1, 1, -1, 1, -1],
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkDataArray.extend(publicAPI, model, initialValues);

  macro.getArray(publicAPI, model, ['bounds'], 6);
  vtkPoints(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkPoints');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
