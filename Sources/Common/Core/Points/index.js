import macro from 'vtk.js/Sources/macros';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import { VtkDataTypes } from 'vtk.js/Sources/Common/Core/DataArray/Constants';
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math';

const { vtkErrorMacro, vtkWarningMacro } = macro;
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

  // Cache extrema witnesses, not just extrema values. If an edit overwrites
  // a witness, a full scan is required because its replacement may be anywhere.
  // This cache is per Points instance and never serialized.
  let xyzState = null;
  publicAPI.delete = macro.chain(() => {
    xyzState = null;
  }, publicAPI.delete);
  const superGetRange = publicAPI.getRange;
  const superSetRange = publicAPI.setRange;
  publicAPI.setRange = (...args) => {
    xyzState = null;
    return superSetRange(...args);
  };

  function ensureXYZRanges() {
    if (model.ranges || model.numberOfComponents !== 3) return;
    const values = publicAPI.getData();
    if (values.length % 3 !== 0) return;
    const change =
      xyzState &&
      xyzState.buffer === values.buffer &&
      xyzState.byteOffset === values.byteOffset &&
      xyzState.type === values.constructor &&
      values.length >= xyzState.length
        ? publicAPI.getDataChangeSince(xyzState.mtime)
        : null;
    const canIncrement =
      change &&
      xyzState.indices.every(
        (index) => index < change.startValue || index >= change.endValue
      );
    const ranges = canIncrement
      ? [...xyzState.ranges]
      : [
          Number.MAX_VALUE,
          -Number.MAX_VALUE,
          Number.MAX_VALUE,
          -Number.MAX_VALUE,
          Number.MAX_VALUE,
          -Number.MAX_VALUE,
        ];
    const indices = canIncrement
      ? [...xyzState.indices]
      : [-1, -1, -1, -1, -1, -1];
    // Match DataArray's first-non-NaN seed, including infinities/signed zero.
    if (!canIncrement) {
      for (let c = 0; c < 3; c++) {
        for (let i = c; i < values.length; i += 3) {
          if (!Number.isNaN(values[i])) {
            ranges[c * 2] = ranges[c * 2 + 1] = values[i];
            indices[c * 2] = indices[c * 2 + 1] = i;
            break;
          }
        }
      }
    }
    if (!canIncrement) {
      // Avoid per-value modulo/component dispatch on the hot full-scan path.
      for (let i = 0; i < values.length; i += 3) {
        const x = values[i];
        const y = values[i + 1];
        const z = values[i + 2];
        if (x < ranges[0]) {
          ranges[0] = x;
          indices[0] = i;
        } else if (x > ranges[1]) {
          ranges[1] = x;
          indices[1] = i;
        }
        if (y < ranges[2]) {
          ranges[2] = y;
          indices[2] = i + 1;
        } else if (y > ranges[3]) {
          ranges[3] = y;
          indices[3] = i + 1;
        }
        if (z < ranges[4]) {
          ranges[4] = z;
          indices[4] = i + 2;
        } else if (z > ranges[5]) {
          ranges[5] = z;
          indices[5] = i + 2;
        }
      }
    } else {
      const end = Math.min(change.endValue, values.length);
      for (let i = change.startValue; i < end; i++) {
        const value = values[i];
        if (Number.isNaN(value)) continue;
        const lo = (i % 3) * 2;
        const hi = lo + 1;
        if (indices[lo] < 0) {
          ranges[lo] = ranges[hi] = value;
          indices[lo] = indices[hi] = i;
        }
        if (value < ranges[lo] || (value === ranges[lo] && i < indices[lo])) {
          ranges[lo] = value;
          indices[lo] = i;
        }
        if (value > ranges[hi] || (value === ranges[hi] && i < indices[hi])) {
          ranges[hi] = value;
          indices[hi] = i;
        }
      }
    }
    for (let c = 0; c < 3; c++) {
      superSetRange({ min: ranges[c * 2], max: ranges[c * 2 + 1] }, c);
    }
    xyzState = {
      buffer: values.buffer,
      byteOffset: values.byteOffset,
      type: values.constructor,
      length: values.length,
      mtime: publicAPI.getMTime(),
      ranges,
      indices,
    };
  }

  publicAPI.getRange = (component = -1) => {
    if (component >= 0 && component < 3) ensureXYZRanges();
    return superGetRange(component);
  };

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
      const xRange = publicAPI.getRange(0);
      model.bounds[0] = xRange[0];
      model.bounds[1] = xRange[1];
      const yRange = publicAPI.getRange(1);
      model.bounds[2] = yRange[0];
      model.bounds[3] = yRange[1];
      const zRange = publicAPI.getRange(2);
      model.bounds[4] = zRange[0];
      model.bounds[5] = zRange[1];
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

  const normalizePointComponents =
    initialValues.numberOfComponents == null ||
    initialValues.numberOfComponents < 2;
  let { numberOfComponents } = initialValues;
  if (normalizePointComponents) {
    numberOfComponents = DEFAULT_VALUES.numberOfComponents;
  }
  const dataArrayInitialValues = {
    ...initialValues,
    numberOfComponents,
  };
  const size = initialValues.size ?? initialValues.values?.length;
  if (
    normalizePointComponents &&
    size != null &&
    size % numberOfComponents !== 0
  ) {
    const alignedSize =
      Math.floor(size / numberOfComponents) * numberOfComponents;
    vtkWarningMacro(
      `Dropping ${size - alignedSize} incomplete point component(s)`
    );
    dataArrayInitialValues.size = alignedSize;
  }

  vtkDataArray.extend(publicAPI, model, dataArrayInitialValues);

  macro.getArray(publicAPI, model, ['bounds'], 6);
  vtkPoints(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkPoints');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
