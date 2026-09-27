// Array and transfer-function helpers shared by vtkPointGaussianMapper and its
// rendering backends.

// A single-component array always uses its only component, a fractional
// component rounds down, and one outside the tuple selects the tuple
// magnitude (-1).
export function resolveComponent(numberOfComponents, component) {
  if (numberOfComponents === 1) {
    return 0;
  }
  const index = Math.floor(component);
  return index >= 0 && index < numberOfComponents ? index : -1;
}

// Returns (tupleIndex) => value for the resolved component of a data array.
export function createComponentReader(dataArray, component) {
  const data = dataArray.getData();
  const numberOfComponents = dataArray.getNumberOfComponents();
  const resolved = resolveComponent(numberOfComponents, component);
  if (resolved >= 0) {
    return (index) => data[index * numberOfComponents + resolved];
  }
  return (index) => {
    const offset = index * numberOfComponents;
    let sum = 0;
    for (let c = 0; c < numberOfComponents; c++) {
      sum += data[offset + c] * data[offset + c];
    }
    return Math.sqrt(sum);
  };
}

// The point data array of that name, or null.
export function getPointArray(dataSet, name) {
  return dataSet && name ? dataSet.getPointData().getArrayByName(name) : null;
}

// What a value derived from an object depends on: the object and its
// modification time.
export function objectKey(object) {
  return [object, object ? object.getMTime() : 0];
}

export function sameKey(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

// What values looked up from an array component through an optional
// function depend on.
export function getLookupKey(dataArray, component, piecewiseFunction, size) {
  return [
    ...objectKey(dataArray),
    component,
    ...objectKey(piecewiseFunction),
    size,
  ];
}

// Samples a piecewise function over its own range into a table that
// lookupTable() interpolates linearly and clamps at both ends.
export function buildTable(piecewiseFunction, tableSize) {
  const size = Math.floor(tableSize);
  if (!piecewiseFunction || !(size >= 1)) {
    return null;
  }
  const [start, end] = piecewiseFunction.getRange();
  const values = new Float32Array(size);
  piecewiseFunction.getTable(start, end, size, values);
  return {
    values,
    offset: start,
    scale: end > start ? (size - 1) / (end - start) : 0,
  };
}

export function lookupTable(table, value) {
  const { values, offset, scale } = table;
  const last = values.length - 1;
  const position = (value - offset) * scale;
  if (!(position > 0)) {
    return values[0];
  }
  if (position >= last) {
    return values[last];
  }
  const index = Math.floor(position);
  const fraction = position - index;
  return values[index] * (1 - fraction) + values[index + 1] * fraction;
}

// Smallest value lookupTable() can return for data inside [low, high].
export function minimumOfTable(table, low, high) {
  const last = table.values.length - 1;
  const clampIndex = (value) => Math.min(last, Math.max(0, value));
  const first = clampIndex(Math.floor((low - table.offset) * table.scale));
  const end = clampIndex(Math.ceil((high - table.offset) * table.scale));
  let minimum = Infinity;
  for (let i = first; i <= end; i++) {
    minimum = Math.min(minimum, table.values[i]);
  }
  return minimum;
}

export default {
  resolveComponent,
  createComponentReader,
  getPointArray,
  objectKey,
  sameKey,
  getLookupKey,
  buildTable,
  lookupTable,
  minimumOfTable,
};
