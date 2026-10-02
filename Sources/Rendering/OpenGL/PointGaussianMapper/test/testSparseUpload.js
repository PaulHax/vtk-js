import { expect, it, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkPoints from 'vtk.js/Sources/Common/Core/Points';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';

function scene(gc, sharedPoints, count = 100) {
  const poly = gc.registerResource(vtkPolyData.newInstance());
  const values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    values[i * 3] = (i % 10) / 10;
    values[i * 3 + 1] = Math.floor(i / 10) / 10;
  }
  poly.setPoints(
    sharedPoints ?? gc.registerResource(vtkPoints.newInstance({ values }))
  );
  const colors = gc.registerResource(
    vtkDataArray.newInstance({
      values: new Uint8Array(count * 3).fill(200),
      numberOfComponents: 3,
    })
  );
  poly.getPointData().setScalars(colors);
  const rw = gc.registerResource(vtkRenderWindow.newInstance());
  const renderer = gc.registerResource(vtkRenderer.newInstance());
  rw.addRenderer(renderer);
  const mapper = gc.registerResource(vtkPointGaussianMapper.newInstance());
  mapper.setInputData(poly);
  mapper.setColorModeToDirectScalars();
  const actor = gc.registerResource(vtkActor.newInstance());
  actor.setMapper(mapper);
  renderer.addActor(actor);
  const view = gc.registerResource(rw.newAPISpecificView());
  rw.addView(view);
  view.setSize(64, 64);
  renderer.resetCamera();
  rw.render();
  return { rw, view, points: poly.getPoints(), colors, mapper };
}

function observe(gl) {
  const uploaded = [];
  const original = gl.bufferSubData.bind(gl);
  const spy = vi
    .spyOn(gl, 'bufferSubData')
    .mockImplementation((target, offset, data) => {
      original(target, offset, data);
      const actual = new data.constructor(data.length);
      gl.getBufferSubData(target, offset, actual);
      expect(Array.from(actual)).toEqual(Array.from(data));
      uploaded.push({
        offset,
        bytes: data.byteLength,
        values: Array.from(data),
      });
    });
  return { uploaded, spy, full: vi.spyOn(gl, 'bufferData') };
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'uploads only changed position and RGB tuples and preserves GPU contents',
  () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const s = scene(gc);
      const o = observe(s.view.getContext());
      s.points.getData()[33] = 0.25;
      s.points.dataChange(33, 34);
      s.colors.getData().set([10, 20, 30], 33);
      s.colors.dataChange(33, 36);
      s.rw.render();
      expect(o.full).not.toHaveBeenCalled();
      expect(
        o.uploaded.map(({ offset, bytes }) => ({ offset, bytes }))
      ).toEqual([
        { offset: 132, bytes: 12 },
        { offset: 44, bytes: 4 },
      ]);
      expect(o.uploaded[1].values).toEqual([10, 20, 30, 255]);
      o.uploaded.length = 0;
      o.full.mockClear();
      s.points.getData()[60] = 0.2;
      s.points.dataChange(60, 61);
      s.points.getData()[90] = 0.3;
      s.points.dataChange(90, 91);
      s.rw.render();
      expect(o.uploaded).toHaveLength(1);
      expect(o.uploaded[0]).toMatchObject({ offset: 240, bytes: 132 });
      expect(o.full).not.toHaveBeenCalled();
      o.spy.mockRestore();
      o.full.mockRestore();
    } finally {
      gc.releaseResources();
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'independent mappers sharing points retain edits skipped by one renderer',
  () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const a = scene(gc);
      const b = scene(gc, a.points);
      const oa = observe(a.view.getContext());
      const ob = observe(b.view.getContext());
      a.points.getData()[33] = 0.22;
      a.points.dataChange(33, 34);
      a.rw.render();
      a.points.getData()[60] = 0.33;
      a.points.dataChange(60, 61);
      a.rw.render();
      b.rw.render();
      expect(oa.uploaded).toHaveLength(2);
      expect(ob.uploaded).toHaveLength(1);
      expect(ob.uploaded[0]).toMatchObject({ offset: 132, bytes: 120 });
      expect(oa.full).not.toHaveBeenCalled();
      expect(ob.full).not.toHaveBeenCalled();
      oa.spy.mockRestore();
      ob.spy.mockRestore();
      oa.full.mockRestore();
      ob.full.mockRestore();
    } finally {
      gc.releaseResources();
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'falls back for unknown edits and wide envelopes',
  () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const s = scene(gc);
      const o = observe(s.view.getContext());
      s.points.getData()[33] = 0.25;
      s.points.modified();
      s.rw.render();
      expect(o.full).toHaveBeenCalledTimes(1);
      expect(o.uploaded).toHaveLength(0);
      o.full.mockClear();
      s.points.dataChange(3, 6);
      s.points.dataChange(270, 273);
      s.rw.render();
      expect(o.full).toHaveBeenCalledTimes(1);
      expect(o.uploaded).toHaveLength(0);
      o.spy.mockRestore();
      o.full.mockRestore();
    } finally {
      gc.releaseResources();
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'appends within capacity without reallocating GPU storage',
  () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const values = new Float32Array(600);
      for (let i = 0; i < 100; i++) {
        values[i * 3] = (i % 10) / 10;
        values[i * 3 + 1] = Math.floor(i / 10) / 10;
      }
      const points = gc.registerResource(
        vtkPoints.newInstance({ values, size: 300 })
      );
      const s = scene(gc, points);
      s.mapper.setScalarVisibility(false);
      s.rw.render();
      const o = observe(s.view.getContext());
      points.resize(110);
      points.getData().fill(0.4, 300, 330);
      s.rw.render();
      expect(o.full).not.toHaveBeenCalled();
      expect(o.uploaded).toHaveLength(1);
      expect(o.uploaded[0]).toMatchObject({ offset: 1200, bytes: 120 });
      o.spy.mockRestore();
      o.full.mockRestore();
    } finally {
      gc.releaseResources();
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'fully repacks points when a sparse edit changes the coordinate transform',
  () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const s = scene(gc);
      const o = observe(s.view.getContext());
      s.points.getData()[33] = 1000000;
      s.points.dataChange(33, 34);
      s.rw.render();
      expect(o.full).toHaveBeenCalledTimes(1);
      expect(o.uploaded).toHaveLength(0);
      o.full.mockClear();
      s.points.getData()[33] = 0.25;
      s.points.dataChange(33, 34);
      s.rw.render();
      expect(o.full).toHaveBeenCalledTimes(1);
      expect(o.uploaded).toHaveLength(0);
      o.spy.mockRestore();
      o.full.mockRestore();
    } finally {
      gc.releaseResources();
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'restores released position and color buffers, then resumes sparse uploads',
  async () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const s = scene(gc);
      const before = s.view.captureNextImage();
      s.rw.render();
      s.view.getViewNodeFor(s.mapper).releaseGraphicsResources(s.view);
      const after = s.view.captureNextImage();
      s.rw.render();
      expect(await after).toBe(await before);
      const o = observe(s.view.getContext());
      s.points.setPoint(11, 0.25, 0.1, 0);
      s.colors.setTuple(11, [10, 20, 30]);
      s.rw.render();
      expect(o.full).not.toHaveBeenCalled();
      expect(
        o.uploaded.map(({ offset, bytes }) => ({ offset, bytes }))
      ).toEqual([
        { offset: 132, bytes: 12 },
        { offset: 44, bytes: 4 },
      ]);
      o.spy.mockRestore();
      o.full.mockRestore();
    } finally {
      gc.releaseResources();
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'honors point-array selection by ID when using direct colors',
  () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const s = scene(gc);
      const selected = gc.registerResource(
        vtkDataArray.newInstance({
          name: 'selected',
          values: new Uint8Array(400).fill(255),
          numberOfComponents: 4,
        })
      );
      s.mapper.getInputData().getPointData().addArray(selected);
      s.mapper.setScalarModeToUsePointData();
      s.mapper.setArrayAccessMode(0);
      s.mapper.set({ arrayId: 1 }, true, true);
      s.mapper.modified();
      const full = vi.spyOn(s.view.getContext(), 'bufferData');
      s.rw.render();
      expect(full).toHaveBeenCalledTimes(1);
      expect(full.mock.calls[0][1]).toEqual(selected.getData());
      full.mockClear();
      s.mapper.set({ arrayId: 0 }, true, true);
      s.mapper.modified();
      s.rw.render();
      expect(full).toHaveBeenCalledTimes(1);
      expect(Array.from(full.mock.calls[0][1].subarray(0, 4))).toEqual([
        200, 200, 200, 255,
      ]);
      full.mockRestore();
    } finally {
      gc.releaseResources();
    }
  }
);
