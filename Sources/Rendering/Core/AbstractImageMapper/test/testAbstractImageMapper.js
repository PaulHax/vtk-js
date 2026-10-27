import { it, expect } from 'vitest';
import { allowLogs } from 'vtk.js/Sources/Testing/logging';
import vtkImageArrayMapper from 'vtk.js/Sources/Rendering/Core/ImageArrayMapper';

it('Test vtkAbstractImageMapper publicAPI', () => {
  const mapper = vtkImageArrayMapper.newInstance();
  expect(mapper.getIsOpaque()).toBe(true);
  allowLogs('warn');
  expect(mapper.getCurrentImage()).toBe(null);
});
