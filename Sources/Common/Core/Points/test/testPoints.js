import { it, expect } from 'vitest';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPoints from 'vtk.js/Sources/Common/Core/Points';

it('Test vtkPoints instance', () => {
  expect(vtkPoints, 'Make sure the class definition exists').toBeTruthy();
  const instance = vtkPoints.newInstance({ size: 256 });
  expect(instance).toBeTruthy();
});

it('Test setPoint', () => {
  const points = vtkPoints.newInstance({ size: 256 });
  const p = [1.0, 2.0, 3.0];
  const q = [];

  points.setPoint(0, p[0], p[1], p[2]);
  points.getPoint(0, q);
  expect(p, 'setPoint with coords').toEqual(q);

  // NOTE: This does not work!
  // points.setPoint(1, p);
  // points.getPoint(1, q);
  // expect(p).toEqual(q);
});

it.each([
  ['empty', []],
  ['single point', [1.5, -2.5, 3.5]],
  ['finite values', [-5, 8, 2, 3, -4, 9, 1, 6, -7]],
  ['leading NaNs', [NaN, 2, 3, 4, NaN, 8, 9, -4, NaN]],
  ['all-NaN component', [1, NaN, 2, -1, NaN, 4]],
  ['signed zeros', [-0, 0, 0, 0, -0, -0]],
  ['mixed infinities', [-Infinity, 2, Infinity, 5, Infinity, -3]],
  ['only infinities', [Infinity, NaN, -Infinity, NaN, 1, NaN]],
])('matches component ranges for %s', (_, input) => {
  for (const ArrayType of [Float32Array, Float64Array]) {
    const values = new ArrayType(input);
    const points = vtkPoints.newInstance();
    points.setData(values, 3);
    const reference = vtkDataArray.newInstance({
      values,
      numberOfComponents: 3,
    });
    const bounds = [0, 1, 2].flatMap((c) => [...reference.getRange(c)]);

    expect(points.getBounds()).toEqual(bounds);
    expect(points.getRanges(false)).toEqual(reference.getRanges(false));
    for (let c = 0; c < 3; c++) {
      expect(points.getRange(c)).toEqual(bounds.slice(2 * c, 2 * c + 2));
    }
  }
});

it('honors cached ranges until data changes', () => {
  const points = vtkPoints.newInstance();
  points.setData(new Float32Array([-5, 8, 2, 3, -4, 9]), 3);
  points.setRange({ min: -100, max: 100 }, 0);
  points.modified();
  expect(points.getBounds()).toEqual([-100, 100, -4, 8, 2, 9]);

  points.setPoint(0, 10, 20, 30);
  points.dataChange();
  expect(points.getBounds()).toEqual([3, 10, -4, 20, 9, 30]);

  points.setData(new Float64Array([0, 0, 0, 1, 1, 1]), 3);
  expect(points.getBounds()).toEqual([0, 1, 0, 1, 0, 1]);
});

it('keeps Z bounds at zero for 2-component points', () => {
  const points = vtkPoints.newInstance();
  points.setData(new Float32Array([1, 2, -3, 4, 5, -6]), 2);
  expect(points.getBounds()).toEqual([-3, 5, -6, 4, 0, 0]);
});
