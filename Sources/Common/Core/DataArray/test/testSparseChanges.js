import { expect, it } from 'vitest';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';

it('retains bounded, independent revision history and treats ordinary mutations as full dirty', () => {
  const a = vtkDataArray.newInstance({ values: new Float32Array(100) });
  const first = a.getMTime();
  a.getData()[4] = 1;
  a.dataChange(4, 5);
  const second = a.getMTime();
  a.getData()[40] = 2;
  a.dataChange(40, 41);
  expect(a.getDataChangeSince(first)).toEqual({ startValue: 4, endValue: 41 });
  expect(a.getDataChangeSince(second)).toEqual({
    startValue: 40,
    endValue: 41,
  });
  expect(a.getDataChangeSince(first)).toEqual({ startValue: 4, endValue: 41 });
  a.modified();
  a.dataChange(2, 3);
  expect(a.getDataChangeSince(second)).toBeNull();
  const baseline = a.getMTime();
  for (let i = 0; i < 33; i++) a.dataChange(i, i + 1);
  expect(a.getDataChangeSince(baseline)).toBeNull();
  a.dataChange(-1, 2);
  expect(a.getDataChangeSince(a.getMTime() - 1)).toBeNull();
  expect(a.getState()).not.toHaveProperty('changes');
  a.delete();
});

it('marks append tails only when backing storage is retained', () => {
  const a = vtkDataArray.newInstance({
    values: new Float32Array(300),
    numberOfComponents: 3,
    size: 30,
  });
  const revision = a.getMTime();
  a.resize(20);
  expect(a.getCapacity()).toBe(300);
  expect(a.getDataChangeSince(revision)).toEqual({
    startValue: 30,
    endValue: 60,
  });
  const next = a.getMTime();
  a.resize(200);
  expect(a.getDataChangeSince(next)).toBeNull();
  a.delete();
});

it('falls back when a synchronous modification observer mutates the array again', () => {
  const a = vtkDataArray.newInstance({ values: new Float32Array(100) });
  const revision = a.getMTime();
  let nested = false;
  const subscription = a.onModified(() => {
    if (nested) return;
    nested = true;
    a.getData()[80] = 4;
    a.dataChange(80, 81);
  });
  a.getData()[3] = 2;
  a.dataChange(3, 4);
  expect(a.getDataChangeSince(revision)).toBeNull();
  expect(Array.from(a.getData()).filter(Boolean)).toEqual([2, 4]);
  subscription.unsubscribe();
  a.delete();
});

it('records scalar setters, tuple edits, and appended zero tuples', () => {
  const a = vtkDataArray.newInstance({
    values: new Float32Array(300),
    numberOfComponents: 3,
    size: 30,
  });
  let revision = a.getMTime();
  a.setValue(2, 1);
  a.setComponent(2, 1, 2);
  expect(a.getDataChangeSince(revision)).toEqual({
    startValue: 2,
    endValue: 8,
  });
  revision = a.getMTime();
  a.setTuple(3, [1, 2, 3]);
  a.setTuples(4, [2, 3, 4, 3, 4, 5]);
  expect(a.getDataChangeSince(revision)).toEqual({
    startValue: 9,
    endValue: 18,
  });
  revision = a.getMTime();
  a.insertNextTuples(new Float32Array(6));
  expect(a.getDataChangeSince(revision)).toEqual({
    startValue: 30,
    endValue: 36,
  });
  revision = a.getMTime();
  a.insertNextTuple([0, 0, 0]);
  expect(a.getDataChangeSince(revision)).toEqual({
    startValue: 36,
    endValue: 39,
  });
  a.delete();
});
