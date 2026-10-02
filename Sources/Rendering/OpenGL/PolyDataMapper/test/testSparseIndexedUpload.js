import { expect, it, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkPoints from 'vtk.js/Sources/Common/Core/Points';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';

function scene(gc, reserve = false) {
  const values = new Float32Array((reserve ? 200 : 100) * 3);
  for (let i = 0; i < 100; i++) {
    values[i * 3] = (i % 10) / 10;
    values[i * 3 + 1] = Math.floor(i / 10) / 10;
  }
  const points = gc.registerResource(
    vtkPoints.newInstance({ values, size: 300 })
  );
  const poly = gc.registerResource(vtkPolyData.newInstance());
  poly.setPoints(points);
  poly
    .getLines()
    .setData(
      Uint32Array.from([100, ...Array.from({ length: 100 }, (_, i) => i)])
    );
  const rw = gc.registerResource(vtkRenderWindow.newInstance());
  const renderer = gc.registerResource(vtkRenderer.newInstance());
  rw.addRenderer(renderer);
  const mapper = gc.registerResource(vtkMapper.newInstance());
  mapper.setInputData(poly);
  mapper.setScalarVisibility(false);
  const actor = gc.registerResource(vtkActor.newInstance());
  actor.setMapper(mapper);
  renderer.addActor(actor);
  const view = gc.registerResource(rw.newAPISpecificView());
  rw.addView(view);
  view.setSize(64, 64);
  renderer.resetCamera();
  rw.render();
  return { rw, view, points, poly, actor, values };
}

function observe(gl) {
  const uploads = [];
  const original = gl.bufferSubData.bind(gl);
  const partial = vi
    .spyOn(gl, 'bufferSubData')
    .mockImplementation((target, offset, data) => {
      original(target, offset, data);
      const actual = new data.constructor(data.length);
      gl.getBufferSubData(target, offset, actual);
      expect(Array.from(actual)).toEqual(Array.from(data));
      uploads.push({ target, offset, bytes: data.byteLength });
    });
  return { uploads, partial, full: vi.spyOn(gl, 'bufferData') };
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'updates line vertices independently of unchanged topology and actor properties',
  () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const s = scene(gc);
      const gl = s.view.getContext();
      const o = observe(gl);
      s.points.getData()[33] = 0.25;
      s.points.dataChange(33, 34);
      s.rw.render();
      expect(o.full).not.toHaveBeenCalled();
      expect(o.uploads).toEqual([
        { target: gl.ARRAY_BUFFER, offset: 132, bytes: 12 },
      ]);
      const contents = new Float32Array(300);
      gl.getBufferSubData(gl.ARRAY_BUFFER, 0, contents);
      expect(Array.from(contents)).toEqual(Array.from(s.points.getData()));
      o.uploads.length = 0;
      s.actor.getProperty().setColor(1, 0, 0);
      s.rw.render();
      expect(o.full).not.toHaveBeenCalled();
      expect(o.uploads).toHaveLength(0);
      s.poly.getLines().setData(new Uint32Array([2, 11, 22]));
      s.rw.render();
      expect(o.full).toHaveBeenCalledTimes(1);
      expect(o.full.mock.calls[0][0]).toBe(gl.ELEMENT_ARRAY_BUFFER);
      expect(o.uploads).toHaveLength(0);
      o.full.mockRestore();
      o.partial.mockRestore();
    } finally {
      gc.releaseResources();
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'appends a growing polyline within reserved position storage',
  () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const s = scene(gc, true);
      const gl = s.view.getContext();
      const o = observe(gl);
      s.points.resize(110);
      s.points.getData().fill(0.4, 300, 330);
      s.poly
        .getLines()
        .setData(
          Uint32Array.from([110, ...Array.from({ length: 110 }, (_, i) => i)])
        );
      s.rw.render();
      expect(o.full).toHaveBeenCalledTimes(1);
      expect(o.full.mock.calls[0][0]).toBe(gl.ELEMENT_ARRAY_BUFFER);
      expect(o.uploads).toEqual([
        { target: gl.ARRAY_BUFFER, offset: 1200, bytes: 120 },
      ]);
      o.full.mockRestore();
      o.partial.mockRestore();
    } finally {
      gc.releaseResources();
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'coalesces interleaved point/normal edits and falls back for unknown changes',
  () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const s = scene(gc);
      const normals = gc.registerResource(
        vtkDataArray.newInstance({
          values: new Float32Array(300).fill(0.5),
          numberOfComponents: 3,
        })
      );
      s.poly.getPointData().setNormals(normals);
      s.rw.render();
      const gl = s.view.getContext();
      const o = observe(gl);
      s.points.getData()[33] = 0.25;
      s.points.dataChange(33, 34);
      normals.getData()[36] = 0.75;
      normals.dataChange(36, 37);
      s.rw.render();
      expect(o.full).not.toHaveBeenCalled();
      expect(o.uploads).toEqual([
        { target: gl.ARRAY_BUFFER, offset: 264, bytes: 48 },
      ]);
      o.uploads.length = 0;
      normals.dataChange();
      s.rw.render();
      expect(o.full).toHaveBeenCalledTimes(1);
      expect(o.full.mock.calls[0][0]).toBe(gl.ARRAY_BUFFER);
      o.full.mockRestore();
      o.partial.mockRestore();
    } finally {
      gc.releaseResources();
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'restores a reserved polyline after releasing its GPU resources',
  async () => {
    const gc = testUtils.createGarbageCollector();
    try {
      const s = scene(gc, true);
      const before = s.view.captureNextImage();
      s.rw.render();
      s.view.releaseGraphicsResources();
      const after = s.view.captureNextImage();
      s.rw.render();
      expect(await after).toBe(await before);
      const gl = s.view.getContext();
      const o = observe(gl);
      s.points.setPoint(11, 0.25, 0.1, 0);
      s.rw.render();
      expect(o.full).not.toHaveBeenCalled();
      expect(o.uploads).toEqual([
        { target: gl.ARRAY_BUFFER, offset: 132, bytes: 12 },
      ]);
      o.partial.mockRestore();
      o.full.mockRestore();
    } finally {
      gc.releaseResources();
    }
  }
);
