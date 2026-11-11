import macro from 'vtk.js/Sources/macros';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';

// ----------------------------------------------------------------------------
// Global methods
// ----------------------------------------------------------------------------

// A negative count draws every point, other finite counts are truncated, and
// anything else keeps the current count.
function normalizePointCount(value, current) {
  if (!Number.isFinite(value)) {
    return current;
  }
  return value < 0 ? -1 : Math.floor(value);
}

// ----------------------------------------------------------------------------
// vtkPointSpriteMapper methods
// ----------------------------------------------------------------------------

function vtkPointSpriteMapper(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkPointSpriteMapper');

  const superClass = { ...publicAPI };

  publicAPI.setMaximumPointCount = (value) =>
    superClass.setMaximumPointCount(
      normalizePointCount(value, model.maximumPointCount)
    );
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

function defaultValues(initialValues) {
  return {
    // Simple points that write depth like other opaque geometry.
    scaleFactor: 0,
    emissive: false,
    pointSizeScale: 1.0,
    circle: false,
    worldSize: 0,
    maximumPointCount: -1,
    ...initialValues,
  };
}

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  // Inheritance
  vtkPointGaussianMapper.extend(publicAPI, model, defaultValues(initialValues));

  model.maximumPointCount = normalizePointCount(model.maximumPointCount, -1);

  macro.setGet(publicAPI, model, [
    'pointSizeScale',
    'circle',
    'worldSize',
    'maximumPointCount',
  ]);

  // Object methods
  vtkPointSpriteMapper(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkPointSpriteMapper');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
