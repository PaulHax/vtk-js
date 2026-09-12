import macro from 'vtk.js/Sources/macros';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';

// ----------------------------------------------------------------------------
// vtkPointGaussianMapper methods
// ----------------------------------------------------------------------------

function vtkPointGaussianMapper(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkPointGaussianMapper');
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  // Only the VTK simple-point mode is implemented.
  scaleFactor: 0,
  // vtk.js extension: display-size multiplier, independent of Gaussian scale.
  pointSizeScale: 1.0,
  // false: opaque square points. true: round splat via a gl_PointCoord edge.
  circle: false,
  // > 0: point diameter in model units, perspective-scaled per point through
  // the actor transform's (isotropic) scale, floored at the actor point size
  // in pixels and capped by the implementation's gl_PointSize range.
  // 0: screen-space sizing from the actor point size.
  worldSize: 0,
  // Maximum prefix of the input points to draw. A negative value draws the
  // whole input. This only changes the submitted vertex count; the complete
  // point and color buffers stay resident so restoring density needs no
  // upload.
  maximumPointCount: -1,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Inheritance
  vtkMapper.extend(publicAPI, model, initialValues);

  const requireSimplePoints = (value) => {
    if (value !== 0) {
      throw new Error(
        'vtkPointGaussianMapper supports only simple points (scaleFactor = 0); Gaussian splats are not implemented.'
      );
    }
  };
  requireSimplePoints(model.scaleFactor);
  macro.get(publicAPI, model, ['scaleFactor']);
  publicAPI.setScaleFactor = (value) => {
    requireSimplePoints(value);
    return false;
  };
  macro.setGet(publicAPI, model, ['pointSizeScale', 'circle', 'worldSize']);
  macro.get(publicAPI, model, ['maximumPointCount']);
  publicAPI.setMaximumPointCount = (value) => {
    if (!Number.isFinite(value)) return false;
    const next = value < 0 ? -1 : Math.floor(value);
    if (next === model.maximumPointCount) return false;
    model.maximumPointCount = next;
    publicAPI.modified();
    return true;
  };

  // Object methods
  vtkPointGaussianMapper(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkPointGaussianMapper');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
