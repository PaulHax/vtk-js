import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';
import vtkCellArray from 'vtk.js/Sources/Common/Core/CellArray';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPoints from 'vtk.js/Sources/Common/Core/Points';
import vtkBufferObject from 'vtk.js/Sources/Rendering/OpenGL/BufferObject';
import { ObjectType } from 'vtk.js/Sources/Rendering/OpenGL/BufferObject/Constants';
import vtkCellArrayBufferObject from 'vtk.js/Sources/Rendering/OpenGL/CellArrayBufferObject';
import { Representation } from 'vtk.js/Sources/Rendering/Core/Property/Constants';

function createColoredTriangle(gc, view) {
  const points = gc.registerResource(vtkPoints.newInstance());
  points.setData(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3);
  const cells = gc.registerResource(
    vtkCellArray.newInstance({ values: Uint32Array.from([3, 0, 1, 2]) })
  );
  const colors = gc.registerResource(
    vtkDataArray.newInstance({
      numberOfComponents: 4,
      values: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]),
    })
  );
  const buffer = gc.registerResource(vtkCellArrayBufferObject.newInstance(), 1);
  gc.registerResource({ delete: () => buffer.releaseGraphicsResources() }, 2);
  buffer.setOpenGLRenderWindow(view);
  const upload = () =>
    buffer.createVBO(cells, 'polys', Representation.SURFACE, {
      points,
      colors,
    });
  upload();
  return { buffer, upload };
}

const buffersOf = (buffer) =>
  [buffer, buffer.getIndexBO(), buffer.getColorBO()].filter(Boolean);

function allocatedBufferBytes(gl, buffer) {
  const array = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const elements = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
  try {
    return buffersOf(buffer).reduce((total, owned) => {
      if (!owned.getHandle()) return total;
      const target =
        owned.getType() === ObjectType.ELEMENT_ARRAY_BUFFER
          ? gl.ELEMENT_ARRAY_BUFFER
          : gl.ARRAY_BUFFER;
      gl.bindBuffer(target, owned.getHandle());
      return total + gl.getBufferParameter(target, gl.BUFFER_SIZE);
    }, 0);
  } finally {
    gl.bindBuffer(gl.ARRAY_BUFFER, array);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
  }
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'reports actual colored geometry allocation and frees every owned buffer',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { view } = createTrackedRenderView(gc);
    const gl = view.getContext();
    const { buffer, upload } = createColoredTriangle(gc, view);
    const bytes = allocatedBufferBytes(gl, buffer);
    expect(bytes).toBeGreaterThan(0);
    expect(buffer.getAllocatedGPUMemoryInBytes()).toBe(bytes);
    const handles = buffersOf(buffer).map((owned) => owned.getHandle());
    expect(handles.every((handle) => gl.isBuffer(handle))).toBe(true);

    buffer.releaseGraphicsResources();
    expect(buffer.getAllocatedGPUMemoryInBytes()).toBe(0);
    expect(handles.every((handle) => !gl.isBuffer(handle))).toBe(true);
    upload();
    expect(buffer.getAllocatedGPUMemoryInBytes()).toBe(bytes);
    expect(allocatedBufferBytes(gl, buffer)).toBe(bytes);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'releases replaced colors and migrates colored geometry between contexts',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { view } = createTrackedRenderView(gc);
    const { view: otherView } = createTrackedRenderView(gc);
    const gl = view.getContext();
    const otherGL = otherView.getContext();
    const { buffer, upload } = createColoredTriangle(gc, view);
    const oldColor = buffer.getColorBO().getHandle();
    const color = gc.registerResource(vtkBufferObject.newInstance(), 1);
    color.setOpenGLRenderWindow(view);
    color.upload(new Uint8Array(12), ObjectType.ARRAY_BUFFER);
    buffer.setColorBO(color);
    expect(gl.isBuffer(oldColor)).toBe(false);
    expect(gl.isBuffer(color.getHandle())).toBe(true);
    expect(buffer.getAllocatedGPUMemoryInBytes()).toBe(
      allocatedBufferBytes(gl, buffer)
    );

    const handles = buffersOf(buffer).map((owned) => owned.getHandle());
    buffer.setOpenGLRenderWindow(otherView);
    expect(handles.every((handle) => !gl.isBuffer(handle))).toBe(true);
    expect(buffer.getAllocatedGPUMemoryInBytes()).toBe(0);
    upload();
    expect(
      buffersOf(buffer).every((owned) => otherGL.isBuffer(owned.getHandle()))
    ).toBe(true);
    expect(buffer.getAllocatedGPUMemoryInBytes()).toBe(
      allocatedBufferBytes(otherGL, buffer)
    );
    expect(gl.getError()).toBe(gl.NO_ERROR);
    expect(otherGL.getError()).toBe(otherGL.NO_ERROR);
    gc.releaseResources();
  }
);
