import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';
import vtkImageResliceMapper from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';

const size = 16;
const firstVoxel = [10, 20, 30];

// The same voxels at the same world position, indexed from extentStart.
function createImage(gc, extentStart) {
  const image = gc.registerResource(vtkImageData.newInstance());
  image.setExtent(
    ...extentStart.flatMap((start) => [start, start + size - 1])
  );
  image.setOrigin(firstVoxel.map((world, axis) => world - extentStart[axis]));
  image.getPointData().setScalars(
    gc.registerResource(
      vtkDataArray.newInstance({
        values: Float32Array.from({ length: size ** 3 }, (_, i) => {
          const x = i % size;
          const z = Math.floor(i / size ** 2);
          return ((x + 3 * z) % size) / size;
        }),
      })
    )
  );
  return image;
}

async function renderSlice(gc, extentStart, normal) {
  const { renderer, renderWindow, view } = createTrackedRenderView(gc);
  const center = firstVoxel.map((world) => world + size / 2);
  const mapper = gc.registerResource(vtkImageResliceMapper.newInstance());
  mapper.setInputData(createImage(gc, extentStart));
  mapper.setSlicePlane(
    gc.registerResource(vtkPlane.newInstance({ origin: center, normal }))
  );
  const actor = gc.registerResource(vtkImageSlice.newInstance());
  actor.setMapper(mapper);
  actor.getProperty().setColorWindow(1);
  actor.getProperty().setColorLevel(0.5);
  renderer.addViewProp(actor);
  const camera = renderer.getActiveCamera();
  camera.setFocalPoint(...center);
  camera.setPosition(center[0] + 20, center[1] + 30, center[2] + 60);
  renderer.resetCamera();
  const image = view.captureNextImage();
  renderWindow.render();
  return image;
}

it.skipIf(__VTK_TEST_NO_WEBGL__).each([
  ['axial', [0, 0, 1]],
  ['oblique', [1, 1, 1]],
])(
  'reslices an image with a nonzero extent like its zero-based copy (%s)',
  async (_, normal) => {
    const gc = testUtils.createGarbageCollector();
    const zeroBased = await renderSlice(gc, [0, 0, 0], normal);
    expect(await renderSlice(gc, firstVoxel, normal)).toBe(zeroBased);
  }
);
