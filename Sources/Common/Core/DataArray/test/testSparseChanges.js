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
