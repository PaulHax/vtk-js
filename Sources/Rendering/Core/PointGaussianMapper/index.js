import macro from 'vtk.js/Sources/macros';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import {
  buildTable,
  getLookupKey,
  getPointArray,
  minimumOfTable,
  resolveComponent,
  sameKey,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/helpers';

const { vtkWarningMacro } = macro;

// ----------------------------------------------------------------------------
// vtkPointGaussianMapper methods
// ----------------------------------------------------------------------------

function vtkPointGaussianMapper(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkPointGaussianMapper');

  const superClass = { ...publicAPI };

  // Each point or splat carries a single colour, so there is nothing to
  // interpolate across, and texture colouring would drop the colours.
  publicAPI.canUseTextureMapForColoring = () => false;

  // The point buffers have no room for custom attributes.
  publicAPI.getCustomShaderAttributes = () => [];
  publicAPI.setCustomShaderAttributes = () => {
    vtkWarningMacro(
      'vtkPointGaussianMapper does not support custom shader attributes.'
    );
    return false;
  };

  // The piecewise functions are part of the mapper's state.
  publicAPI.getMTime = () =>
    Math.max(
      superClass.getMTime(),
      ...[model.scaleFunction, model.scalarOpacityFunction]
        .filter(Boolean)
        .map((piecewiseFunction) => piecewiseFunction.getMTime())
    );

  // Whether an opacity array maps only to opacities of one, kept per array.
  const opacityStates = new WeakMap();
  const isOpacityArrayOpaque = (array) => {
    const key = getLookupKey(
      array,
      model.opacityArrayComponent,
      model.scalarOpacityFunction,
      model.opacityTableSize
    );
    const state = opacityStates.get(array);
    if (state && sameKey(key, state.key)) {
      return state.opaque;
    }
    const [low, high] = array.getRange(
      resolveComponent(
        array.getNumberOfComponents(),
        model.opacityArrayComponent
      )
    );
    const table = buildTable(
      model.scalarOpacityFunction,
      model.opacityTableSize
    );
    const minimum = table ? minimumOfTable(table, low, high) : low;
    const opaque = !(minimum < 1.0);
    opacityStates.set(array, { key, opaque });
    return opaque;
  };

  // Emissive points add up in any order among themselves and write no depth,
  // so they render with the opaque geometry. Splats with the default falloff
  // fade out and have to blend with what is behind them. Otherwise the
  // opacity array, which replaces the alpha of the colours, decides, or else
  // the colours do.
  publicAPI.getIsOpaque = () => {
    if (model.emissive) {
      return true;
    }
    if (model.scaleFactor !== 0 && !model.splatShaderCode) {
      return false;
    }
    const opacities = getPointArray(
      publicAPI.getInputData(),
      model.opacityArray
    );
    return opacities
      ? isOpacityArrayOpaque(opacities)
      : superClass.getIsOpaque();
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

function defaultValues(initialValues) {
  return {
    scaleArray: null,
    scaleArrayComponent: 0,
    scaleFunction: null,
    scaleTableSize: 1024,
    opacityArray: null,
    opacityArrayComponent: 0,
    scalarOpacityFunction: null,
    opacityTableSize: 1024,
    scaleFactor: 1.0,
    splatShaderCode: null,
    emissive: true,
    boundScale: 3.0,
    anisotropic: false,
    rotationArray: null,
    lowpassMatrix: [0, 0, 0],
    ...initialValues,
  };
}

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, defaultValues(initialValues));

  // Inheritance
  vtkMapper.extend(publicAPI, model, initialValues);

  macro.setGet(publicAPI, model, [
    'scaleArray',
    'scaleArrayComponent',
    'scaleFunction',
    'scaleTableSize',
    'opacityArray',
    'opacityArrayComponent',
    'scalarOpacityFunction',
    'opacityTableSize',
    'scaleFactor',
    'splatShaderCode',
    'emissive',
    'boundScale',
    'anisotropic',
    'rotationArray',
  ]);
  macro.setGetArray(publicAPI, model, ['lowpassMatrix'], 3);

  // Object methods
  vtkPointGaussianMapper(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkPointGaussianMapper');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
