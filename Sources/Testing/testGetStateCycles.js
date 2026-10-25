import { it, expect } from 'vitest';
import macro from 'vtk.js/Sources/macros';

// ----------------------------------------------------------------------------
// vtkCycleNode: minimal vtkObject that references other vtkObjects
// ----------------------------------------------------------------------------

function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, { other: null, list: [] }, initialValues);
  macro.obj(publicAPI, model);
  model.classHierarchy.push('vtkCycleNode');
  macro.setGet(publicAPI, model, ['other', 'list']);
}

const newInstance = macro.newInstance(extend, 'vtkCycleNode');

it('Test getState breaks direct reference cycles', () => {
  const a = newInstance();
  const b = newInstance();
  a.setOther(b);
  b.setOther(a);

  const state = a.getState();
  expect(state.vtkClass).toBe('vtkCycleNode');
  expect(state.other.vtkClass, 'the referenced object serializes').toBe(
    'vtkCycleNode'
  );
  expect(state.other.other, 'the back reference serializes as null').toBeNull();

  // JSON.stringify routes through toJSON()/getState() and must not throw.
  expect(() => JSON.stringify(a)).not.toThrow();
});

it('Test getState breaks self references', () => {
  const a = newInstance();
  a.setOther(a);

  expect(a.getState().other, 'a self reference serializes as null').toBeNull();
});

it('Test getState breaks reference cycles through arrays', () => {
  const a = newInstance();
  const b = newInstance();
  a.setList([b]);
  b.setList([a]);

  const state = a.getState();
  expect(state.list[0].vtkClass, 'the referenced object serializes').toBe(
    'vtkCycleNode'
  );
  expect(
    state.list[0].list[0],
    'the back reference serializes as null'
  ).toBeNull();
});

it('Test getState serializes shared references that are not cycles', () => {
  const shared = newInstance();
  const root = newInstance();
  root.setList([shared, shared]);

  const state = root.getState();
  expect(state.list[0].vtkClass, 'the first occurrence serializes').toBe(
    'vtkCycleNode'
  );
  expect(state.list[1].vtkClass, 'the second occurrence serializes too').toBe(
    'vtkCycleNode'
  );
});
