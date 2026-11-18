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

  const attributeUpdates = new Map();
  const attributeNames = new Set([
    'positions',
    'colors',
    'radius',
    'rotation',
    'opacity',
  ]);

  publicAPI.setPointAttributeUpdateRanges = (updates) => {
    if (updates === null) {
      attributeUpdates.clear();
      return true;
    }
    const entries = Object.entries(updates);
    for (const [name, update] of entries) {
      const { source, fromMTime, toMTime, ranges } = update;
      if (
        !attributeNames.has(name) ||
        !source ||
        typeof source.getData !== 'function' ||
        !Number.isSafeInteger(fromMTime) ||
        !Number.isSafeInteger(toMTime) ||
        fromMTime < 0 ||
        toMTime <= fromMTime ||
        toMTime !== source.getMTime() ||
        !Array.isArray(ranges) ||
        ranges.some(
          ([first, count]) =>
            !Number.isSafeInteger(first) ||
            !Number.isSafeInteger(count) ||
            first < 0 ||
            count <= 0 ||
            first + count > source.getNumberOfTuples()
        )
      ) {
        throw new Error(
          'Point attribute updates require complete tuple ranges between source modification times.'
        );
      }
    }
    for (const [name, update] of entries) {
      const { source, fromMTime, toMTime, ranges } = update;
      const data = source.getData();
      let state = attributeUpdates.get(name);
      if (
        state?.source !== source ||
        state.data.deref() !== data ||
        state.history.at(-1)?.toMTime !== fromMTime
      ) {
        state = { source, data: new WeakRef(data), history: [] };
        attributeUpdates.set(name, state);
      }
      state.history.push({
        fromMTime,
        toMTime,
        ranges: ranges.map((range) => [...range]),
      });
      if (state.history.length > 64) state.history.shift();
    }
    return true;
  };

  publicAPI.getPointAttributeUpdateRanges = (
    name,
    source,
    fromMTime,
    toMTime
  ) => {
    const state = attributeUpdates.get(name);
    if (state?.source !== source || state.data.deref() !== source.getData())
      return null;
    const ranges = [];
    let cursor = fromMTime;
    for (const update of state.history) {
      if (update.fromMTime !== cursor) continue;
      ranges.push(...update.ranges);
      cursor = update.toMTime;
      if (cursor === toMTime) {
        ranges.sort((left, right) => left[0] - right[0]);
        const merged = [];
        for (const [first, count] of ranges) {
          const previous = merged.at(-1);
          if (previous && first <= previous[0] + previous[1]) {
            previous[1] =
              Math.max(previous[0] + previous[1], first + count) - previous[0];
          } else merged.push([first, count]);
        }
        return merged;
      }
    }
    return null;
  };

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
      ...[model.scaleFunction, model.scalarOpacityFunction, model.pointOrder]
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
    const directColors = getPointArray(
      publicAPI.getInputData(),
      model.directColorArray
    );
    const opacities = getPointArray(
      publicAPI.getInputData(),
      model.opacityArray
    );
    return opacities
      ? isOpacityArrayOpaque(opacities)
      : directColors && publicAPI.getScalarVisibility()
        ? directColors.getNumberOfComponents() === 4 &&
          directColors.getRange(3)[0] >= 1.0
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
    pointOrder: null,
    directColorArray: null,
    coordinateShiftAndScaleEnabled: true,
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
    'pointOrder',
    'directColorArray',
    'coordinateShiftAndScaleEnabled',
  ]);
  macro.setGetArray(publicAPI, model, ['lowpassMatrix'], 3);

  // Object methods
  vtkPointGaussianMapper(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkPointGaussianMapper');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
