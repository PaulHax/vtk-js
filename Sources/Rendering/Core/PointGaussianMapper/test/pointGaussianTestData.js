import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';

// Inputs for the ports of VTK's TestPointGaussianMapper* tests. VTK fills
// them with vtkPointSource and vtkRandomAttributeGenerator; these are the same
// kinds of values from a seeded generator, so renders are reproducible.

// Uniform numbers in [0, 1) from a 32-bit linear congruential generator.
export function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Points uniformly distributed inside a ball.
export function createPointCloud(numberOfPoints, radius, random) {
  const coordinates = new Float32Array(3 * numberOfPoints);
  for (let i = 0; i < numberOfPoints; i++) {
    let x;
    let y;
    let z;
    do {
      x = 2 * random() - 1;
      y = 2 * random() - 1;
      z = 2 * random() - 1;
    } while (x * x + y * y + z * z > 1);
    coordinates[3 * i] = radius * x;
    coordinates[3 * i + 1] = radius * y;
    coordinates[3 * i + 2] = radius * z;
  }
  const polyData = vtkPolyData.newInstance();
  polyData.getPoints().setData(coordinates, 3);
  return polyData;
}

// An array of values drawn from generate.
export function addRandomArray(polyData, name, numberOfComponents, generate) {
  const values = new Float32Array(
    numberOfComponents * polyData.getNumberOfPoints()
  );
  for (let i = 0; i < values.length; i++) {
    values[i] = generate();
  }
  const array = vtkDataArray.newInstance({ name, numberOfComponents, values });
  polyData.getPointData().addArray(array);
  return array;
}

// Uniformly distributed unit quaternions, real part first.
export function addRandomRotations(polyData, name, random) {
  const numberOfPoints = polyData.getNumberOfPoints();
  const values = new Float32Array(4 * numberOfPoints);
  for (let i = 0; i < numberOfPoints; i++) {
    const u = random();
    const v = random();
    const w = random();
    values[4 * i] = Math.sqrt(1 - u) * Math.sin(2 * Math.PI * v);
    values[4 * i + 1] = Math.sqrt(1 - u) * Math.cos(2 * Math.PI * v);
    values[4 * i + 2] = Math.sqrt(u) * Math.sin(2 * Math.PI * w);
    values[4 * i + 3] = Math.sqrt(u) * Math.cos(2 * Math.PI * w);
  }
  const array = vtkDataArray.newInstance({
    name,
    numberOfComponents: 4,
    values,
  });
  polyData.getPointData().addArray(array);
  return array;
}
