import { it } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { expectColorsAfterDepthPassThrows } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkImageResliceMapper from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';

function createResliceSlice(gc, filter) {
  filter.setInputData(testUtils.createImage([8, 8, 8], [1, 1, 1]));
  const mapper = gc.registerResource(vtkImageResliceMapper.newInstance());
  mapper.setInputConnection(filter.getOutputPort());
  mapper.setSlicePlane(
    gc.registerResource(
      vtkPlane.newInstance({ origin: [3.5, 3.5, 3.5], normal: [0, 0, 1] })
    )
  );
  const slice = gc.registerResource(vtkImageSlice.newInstance());
  slice.setMapper(mapper);
  return slice;
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'draws its colors after throwing while it renders depth',
  () => expectColorsAfterDepthPassThrows(createResliceSlice)
);
