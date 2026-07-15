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
  scaleFactor: 1.0,
  // false: opaque square points. true: round splat via a gl_PointCoord edge.
  circle: false,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Inheritance
  vtkMapper.extend(publicAPI, model, initialValues);

  macro.setGet(publicAPI, model, ['scaleFactor', 'circle']);

  // Object methods
  vtkPointGaussianMapper(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkPointGaussianMapper');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
