import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkPlaneSource from 'vtk.js/Sources/Filters/Sources/PlaneSource';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import { FieldAssociations } from 'vtk.js/Sources/Common/DataModel/DataSet/Constants';
import {
  attributeIds,
  createPointSelector,
  createPolyData,
  createScene,
  lookDownZ,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

// Points at x = -1, 0, 1 seen from +z: in a 60 px view with a parallel
// scale of 1.5 they land 20 px apart, at x = 10, 30 and 50.
const PIXEL_X = [10, 30, 50];

function makeScene(
  gc,
  initialValues,
  coordinates = [-1, 0, 0, 0, 0, 0, 1, 0, 0]
) {
  const scene = createScene(
    gc,
    vtkPointGaussianMapper.newInstance(initialValues),
    createPolyData(gc, coordinates),
    60
  );
  scene.actor.getProperty().setPointSize(8);
  lookDownZ(scene.renderer, 1.5);
  const selector = createPointSelector(scene);
  const selectPixel = (x) => selector.selectAsync(scene.renderer, x, 30, x, 30);
  return { ...scene, selector, selectPixel };
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper selects point ids in simple-point and splat modes',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const points = makeScene(gc, { scaleFactor: 0 });
    for (let id = 0; id < 3; id++) {
      expect(attributeIds(await points.selectPixel(PIXEL_X[id]))).toEqual([id]);
    }

    // Splats of radius 0.1 with the default bound of three deviations reach
    // 0.3 units, 6 px, from their centre.
    const splats = makeScene(gc, { scaleFactor: 0.1 });
    for (let id = 0; id < 3; id++) {
      expect(attributeIds(await splats.selectPixel(PIXEL_X[id]))).toEqual([id]);
    }
    expect(await splats.selectPixel(20), 'between the splats').toEqual([]);

    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper reports point ids of the points drawn by verts',
  async () => {
    const gc = testUtils.createGarbageCollector();
    for (const scaleFactor of [0, 0.1]) {
      const scene = makeScene(gc, { scaleFactor });
      scene.polyData.getVerts().setData(Uint16Array.from([1, 2, 1, 0]));
      expect(attributeIds(await scene.selectPixel(PIXEL_X[2]))).toEqual([2]);
      expect(attributeIds(await scene.selectPixel(PIXEL_X[0]))).toEqual([0]);
      expect(
        await scene.selectPixel(PIXEL_X[1]),
        'point 1 is in no verts cell'
      ).toEqual([]);
    }
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper selects the nearest of overlapping points',
  async () => {
    const gc = testUtils.createGarbageCollector();
    for (const scaleFactor of [0, 0.1]) {
      // The nearer point is drawn first.
      const scene = makeScene(gc, { scaleFactor }, [0, 0, 1, 0, 0, 0]);
      expect(attributeIds(await scene.selectPixel(PIXEL_X[1]))).toEqual([0]);
    }
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper selects the verts cells drawing its points, in front of other props',
  async () => {
    const gc = testUtils.createGarbageCollector();
    for (const scaleFactor of [0, 0.1]) {
      const scene = makeScene(gc, { scaleFactor });
      const plane = gc.registerResource(
        vtkPlaneSource.newInstance({
          xResolution: 1,
          yResolution: 1,
          origin: [-3, -3, -1],
          point1: [3, -3, -1],
          point2: [-3, 3, -1],
        })
      );
      const planeMapper = gc.registerResource(vtkMapper.newInstance());
      planeMapper.setInputConnection(plane.getOutputPort());
      const planeActor = gc.registerResource(vtkActor.newInstance());
      planeActor.setMapper(planeMapper);
      scene.renderer.addActor(planeActor);
      scene.selector.setFieldAssociation(
        FieldAssociations.FIELD_ASSOCIATION_CELLS
      );
      const selectCell = async (x) => {
        const [node] = await scene.selectPixel(x);
        const { prop, attributeID } = node.getProperties();
        return [prop === scene.actor ? 'points' : 'plane', attributeID];
      };

      expect(await selectCell(PIXEL_X[1]), 'without verts, point ids').toEqual([
        'points',
        1,
      ]);
      // Cell 0 draws points 0 and 2, cell 1 draws point 1.
      scene.polyData.getVerts().setData(Uint16Array.from([2, 0, 2, 1, 1]));
      expect(await selectCell(PIXEL_X[2])).toEqual(['points', 0]);
      expect(await selectCell(PIXEL_X[1])).toEqual(['points', 1]);
      expect(await selectCell(20), 'between the points').toEqual(['plane', 0]);
    }
    gc.releaseResources();
  }
);
