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
  // Screen-space point-size multiplier applied on top of the actor point size.
  // With worldSize > 0 it multiplies the world-space size instead.
  scaleFactor: 1.0,
  // false: opaque square points. true: round splat via a gl_PointCoord edge.
  circle: false,
  // > 0: point diameter in model units, perspective-scaled per point through
  // the actor transform's (isotropic) scale, floored at the actor point size
  // in pixels and capped by the implementation's gl_PointSize range.
  // 0: screen-space sizing from the actor point size.
  worldSize: 0,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Inheritance
  vtkMapper.extend(publicAPI, model, initialValues);

  macro.setGet(publicAPI, model, ['scaleFactor', 'circle', 'worldSize']);

  // Object methods
  vtkPointGaussianMapper(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkPointGaussianMapper');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
