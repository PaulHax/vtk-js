import { expect, it } from 'vitest';
import vtkPoints from 'vtk.js/Sources/Common/Core/Points';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';

function check(points) {
  const reference = vtkDataArray.newInstance({
    values: points.getData().slice(),
    numberOfComponents: 3,
  });
  const bounds = [];
  for (let c = 0; c < 3; c++) {
    const wanted = Array.from(reference.getRange(c));
    expect(Array.from(points.getRange(c))).toEqual(wanted);
    bounds.push(...wanted);
  }
  expect(points.getBounds()).toEqual(bounds);
  reference.delete();
}
it('preserves exact bounds through sparse edits, extreme replacement, append and shrink', () => {
  const points = vtkPoints.newInstance({
    values: Float32Array.from({ length: 300 }, (_, i) => Math.sin(i)),
    numberOfComponents: 3,
  });
  let state = 17;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 2 ** 32;
  };
  check(points);
  for (let i = 0; i < 200; i++) {
    const start = Math.floor(random() * 299);
    const length = Math.min(300 - start, 1 + Math.floor(random() * 10));
    for (let j = start; j < start + length; j++)
      points.getData()[j] = (random() - 0.5) * 10;
    points.dataChange(start, start + length);
    // Sometimes multiple mutations accumulate before bounds are queried.
    if (i % 3 === 0) {
      points.getData()[30] = random() * 20;
      points.dataChange(30, 31);
    }
    check(points);
  }
  points.allocate(100);
  points.resize(110);
  points.getData().fill(100, 300, 330);
  check(points);
  points.resize(90);
  check(points);
  points.delete();
});
it('preserves NaNs, infinities, signed zero and explicitly supplied ranges', () => {
  const points = vtkPoints.newInstance({
    values: Float64Array.from([
      NaN,
      NaN,
      NaN,
      0,
      -0,
      Infinity,
      1,
      2,
      -Infinity,
    ]),
    numberOfComponents: 3,
  });
  check(points);
  points.getData()[0] = -0;
  points.dataChange(0, 1);
  check(points);
  points.getData().fill(NaN);
  points.dataChange();
  check(points);
  points.getData()[3] = Infinity;
  points.dataChange(3, 4);
  check(points);
  points.setRange({ min: 10, max: 20 }, 0);
  expect(Array.from(points.getRange(0))).toEqual([10, 20]);
  points.getData()[3] = 3;
  points.dataChange(3, 4);
  check(points);
  points.delete();
});

it('includes newly exposed gaps when inserting into reserved storage', () => {
  for (const method of ['insertTuple', 'insertTuples']) {
    const values = new Float32Array(30);
    values.set([10, 10, 10, 20, 20, 20]);
    const points = vtkPoints.newInstance({ values, size: 6 });
    expect(points.getBounds()).toEqual([10, 20, 10, 20, 10, 20]);
    const revision = points.getMTime();
    let notifications = 0;
    const subscription = points.onModified(() => {
      notifications++;
    });
    points[method](5, [15, 15, 15]);
    expect(notifications).toBe(1);
    expect(points.getDataChangeSince(revision)).toEqual({
      startValue: 6,
      endValue: 18,
    });
    check(points);
    expect(points.getBounds()).toEqual([0, 20, 0, 20, 0, 20]);
    subscription.unsubscribe();
    points.delete();
  }
});
