import { describe, it, expect, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkImageResliceMapper from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';

import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import vtkOpenGLTexture from 'vtk.js/Sources/Rendering/OpenGL/Texture';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';

const size = 16;
const wholeExtent = [0, size - 1, 0, size - 1, 0, size - 1];
// Types the texture converts to floats on the CPU, the 16 bit ones only
// without norm16.
const scalarTypes = [
  { ArrayType: Int8Array, range: [-128, 127] },
  { ArrayType: Int16Array, range: [-1024, 3071] },
  { ArrayType: Uint16Array, range: [0, 4095] },
  { ArrayType: Int32Array, range: [-33792, 31743] },
  { ArrayType: Uint32Array, range: [0, 2 ** 32 - 1] },
  { ArrayType: Float64Array, range: [-1024.25, 3071.75] },
];

// Values across the whole range, varying within each slice.
function fillSlice(values, z, [min, max]) {
  const sliceLength = size * size;
  for (let i = 0; i < sliceLength; i++) {
    values[z * sliceLength + i] =
      min + ((max - min) * ((i * 7 + z * 3) % 16)) / 15;
  }
}

describe.each([
  ['volume', vtkVolume, vtkVolumeMapper],
  ['reslice', vtkImageSlice, vtkImageResliceMapper],
])('%s streaming', (name, Actor, Mapper) => {
  it.skipIf(__VTK_TEST_NO_WEBGL__).each(scalarTypes)(
    'draws $ArrayType.name slices streamed one at a time like a full upload',
    async ({ ArrayType, range }) => {
      const gc = testUtils.createGarbageCollector();
      const { renderer, renderWindow, view } = createTrackedRenderView(gc);
      const gl = view.getContext();
      const image = gc.registerResource(vtkImageData.newInstance());
      image.setDimensions(size, size, size);
      const values = new ArrayType(size ** 3);
      const scalars = gc.registerResource(vtkDataArray.newInstance({ values }));
      // A range known up front, as a DICOM loader knows it, keeps the texture
      // format from changing while the slices arrive.
      scalars.setRange({ min: range[0], max: range[1] }, 0);
      image.getPointData().setScalars(scalars);
      const mapper = gc.registerResource(Mapper.newInstance());
      mapper.setInputData(image);
      const actor = gc.registerResource(Actor.newInstance());
      actor.setMapper(mapper);
      const property = actor.getProperty();
      const color = gc.registerResource(vtkColorTransferFunction.newInstance());
      color.addRGBPoint(range[0], 0, 0, 0);
      color.addRGBPoint(range[1], 1, 0.5, 0.25);
      const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
      opacity.addPoint(range[0], 0);
      opacity.addPoint(range[1], 0.5);
      property.setRGBTransferFunction(0, color);
      property.setScalarOpacity(0, opacity);
      if (name === 'reslice') {
        property.setUseLookupTableScalarRange(true);
        mapper.setSlicePlane(
          gc.registerResource(
            vtkPlane.newInstance({
              origin: [7.5, 7.5, 7.5],
              normal: [1, 1, 1],
            })
          )
        );
      }
      renderer.addViewProp(actor);
      renderer.resetCamera();

      const fullUploads = vi.spyOn(gl, 'texImage3D');
      const partialUploads = vi.spyOn(gl, 'texSubImage3D');
      const render = async (capture) => {
        fullUploads.mockClear();
        partialUploads.mockClear();
        const captured = capture && view.captureNextImage();
        renderWindow.render();
        expect(gl.getError()).toBe(gl.NO_ERROR);
        const uploads = [
          ...fullUploads.mock.calls.map((a) => [0, 0, 0, ...a.slice(3, 6)]),
          ...partialUploads.mock.calls.map((a) => a.slice(2, 8)),
        ].map(([x, y, z, w, h, d]) => [
          x,
          x + w - 1,
          y,
          y + h - 1,
          z,
          z + d - 1,
        ]);
        return { image: await captured, uploads };
      };

      // The first render allocates the texture for an empty volume. Each
      // later one patches in the slice that arrived since the last.
      const empty = await render(true);
      let streamed = empty;
      for (let z = 0; z < size; z++) {
        fillSlice(values, z, range);
        scalars.modified();
        const slice = [0, size - 1, 0, size - 1, z, z];
        property.setUpdatedExtents([slice]);
        streamed = await render(z === size - 1);
        expect(streamed.uploads).toEqual([slice]);
      }
      expect(streamed.image).not.toBe(empty.image);

      scalars.modified();
      expect(await render(true)).toEqual({
        image: streamed.image,
        uploads: [wholeExtent],
      });
    }
  );
});

function createTextureContext(gc) {
  const view = gc.registerResource(vtkOpenGLRenderWindow.newInstance());
  gc.registerResource(vtkRenderWindow.newInstance()).addView(view);
  view.initialize();
  return { view, gl: view.getContext() };
}

it
  .skipIf(__VTK_TEST_NO_WEBGL__)
  .each(
    [Int32Array, Uint32Array, Float64Array].flatMap((ArrayType) =>
      [1, 4].map((numComps) => ({ ArrayType, numComps }))
    )
  )(
  'preserves full-upload rounding in forced-byte partial $ArrayType.name uploads with $numComps components',
  ({ ArrayType, numComps }) => {
    const gc = testUtils.createGarbageCollector();
    const { view, gl } = createTextureContext(gc);
    const texture = gc.registerResource(vtkOpenGLTexture.newInstance());
    texture.setOpenGLRenderWindow(view);
    texture.setOpenGLDataType(gl.UNSIGNED_BYTE);
    texture.setInternalFormat(numComps === 1 ? gl.R8 : gl.RGBA8);
    const data = ArrayType.from({ length: 4 * numComps }, (_, i) => 11 + i);
    const upload = (updatedExtents = []) =>
      texture.create3DFromRaw({
        width: 4,
        height: 1,
        depth: 1,
        numComps,
        dataType: ArrayType.name,
        data,
        updatedExtents,
      });
    expect(upload()).toBe(true);
    for (let x = 1; x <= 2; x++) {
      for (let c = 0; c < numComps; c++) {
        data[x * numComps + c] =
          (ArrayType === Float64Array && x === 1 ? 255.999999 : 16777217) + c;
      }
    }
    expect(upload([[1, 2, 0, 0, 0, 0]])).toBe(true);
    // Full uploads first cast unsupported source types to Float32. The
    // selected extents must keep that rounding before byte truncation.
    const expected = new Uint8Array(new Float32Array(data));
    const framebuffer = gl.createFramebuffer();
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTextureLayer(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        texture.getHandle(),
        0,
        0
      );
      expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).toBe(
        gl.FRAMEBUFFER_COMPLETE
      );
      const rgba = new Uint8Array(4 * 4);
      gl.readPixels(0, 0, 4, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      const actual = Array.from({ length: 4 }, (_, x) => [
        ...rgba.subarray(x * 4, x * 4 + numComps),
      ]).flat();
      expect(actual).toEqual([...expected]);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'converts only disjoint changed values and preserves other Float64 texels',
  ({ skip }) => {
    const gc = testUtils.createGarbageCollector();
    const { view, gl } = createTextureContext(gc);
    if (!gl.getExtension('EXT_color_buffer_float')) {
      skip('Floating-point framebuffer attachments are unavailable.');
    }
    const width = 9;
    const height = 7;
    const depth = 5;
    const numComps = 4;
    const values = Float64Array.from(
      { length: width * height * depth * numComps },
      (_, i) => 0.25 + (i % 131) / 4
    );
    const scalars = gc.registerResource(
      vtkDataArray.newInstance({ numberOfComponents: numComps, values })
    );
    const texture = gc.registerResource(vtkOpenGLTexture.newInstance());
    texture.setOpenGLRenderWindow(view);
    const upload = (updatedExtents = []) =>
      texture.create3DFilterableFromDataArray({
        width,
        height,
        depth,
        dataArray: scalars,
        updatedExtents,
      });
    expect(upload()).toBe(true);
    const extents = [
      [1, 3, 2, 3, 1, 2],
      [7, 8, 5, 5, 4, 4],
    ];
    const expected = new Float32Array(values);
    for (const [x0, x1, y0, y1, z0, z1] of extents) {
      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            for (let c = 0; c < numComps; c++) {
              const i = ((z * height + y) * width + x) * numComps + c;
              values[i] = 200 + c + x / 4;
              expected[i] = values[i];
            }
          }
        }
      }
    }
    scalars.dataChange();
    // Observe public typed-array allocations during the upload. The two
    // changed boxes contain 56 values; converting the volume would use 1260.
    const NativeFloat32Array = globalThis.Float32Array;
    const allocations = [];
    globalThis.Float32Array = new Proxy(NativeFloat32Array, {
      construct(target, args) {
        const value = Reflect.construct(target, args, target);
        allocations.push(value.length);
        return value;
      },
    });
    try {
      expect(upload(extents)).toBe(true);
    } finally {
      globalThis.Float32Array = NativeFloat32Array;
    }
    expect(allocations.reduce((sum, length) => sum + length, 0)).toBe(56);
    const framebuffer = gl.createFramebuffer();
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      for (let z = 0; z < depth; z++) {
        gl.framebufferTextureLayer(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          texture.getHandle(),
          0,
          z
        );
        expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).toBe(
          gl.FRAMEBUFFER_COMPLETE
        );
        const pixels = new Float32Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
        expect(pixels).toEqual(
          expected.slice(z * width * height * 4, (z + 1) * width * height * 4)
        );
      }
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
    }
  }
);
