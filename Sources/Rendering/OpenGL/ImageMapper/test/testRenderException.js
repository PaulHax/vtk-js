import { it } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { expectColorsAfterDepthPassThrows } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkImageMapper from 'vtk.js/Sources/Rendering/Core/ImageMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';

function createImageSlice(gc, filter) {
  filter.setInputData(testUtils.createImage([8, 8, 1], [1, 1, 1]));
  const mapper = gc.registerResource(vtkImageMapper.newInstance());
  mapper.setInputConnection(filter.getOutputPort());
  const slice = gc.registerResource(vtkImageSlice.newInstance());
  slice.setMapper(mapper);
  return slice;
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'draws its colors after throwing while it renders depth',
  () => expectColorsAfterDepthPassThrows(createImageSlice)
);
