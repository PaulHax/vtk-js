import { it, expect, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';

import { VtkDataTypes } from 'vtk.js/Sources/Common/Core/DataArray/Constants';
import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import vtkOpenGLTexture from 'vtk.js/Sources/Rendering/OpenGL/Texture';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';

function createVolume([width, height, depth], numComps, seed) {
  const data = new Uint8Array(width * height * depth * numComps);
  for (let i = 0; i < data.length; i++) {
    data[i] = (seed + 7 * i) % 256;
  }
  return { width, height, depth, numComps, data };
}

function upload(texture, volume, updatedExtents = []) {
  return texture.create3DFromRaw({
    ...volume,
    dataType: VtkDataTypes.UNSIGNED_CHAR,
    updatedExtents,
  });
}

// Reads every texel through a framebuffer attached to each layer.
function readTexels(gl, texture, { width, height, depth, numComps }) {
  const texels = [];
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  for (let z = 0; z < depth; z++) {
    gl.framebufferTextureLayer(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      texture.getHandle(),
      0,
      z
    );
    const rgba = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    for (let i = 0; i < width * height; i++) {
      texels.push(...rgba.subarray(4 * i, 4 * i + numComps));
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(framebuffer);
  return texels;
}

it.skipIf(__VTK_TEST_NO_WEBGL__).each([
  ['a wider volume', [8, 4, 4], 4, [[0, 7, 0, 3, 1, 1]]],
  ['a deeper volume', [4, 4, 6], 4, [[0, 3, 0, 3, 5, 5]]],
  ['fewer components', [4, 4, 4], 1, [[0, 3, 0, 3, 2, 2]]],
  ['unchanged parameters without extents', [4, 4, 4], 4, []],
])(
  'uploads the whole texture for %s',
  (_, dimensions, numComps, updatedExtents) => {
    const gc = testUtils.createGarbageCollector();
    const view = gc.registerResource(vtkOpenGLRenderWindow.newInstance());
    gc.registerResource(vtkRenderWindow.newInstance()).addView(view);
    view.initialize();
    const gl = view.getContext();
    const texture = gc.registerResource(vtkOpenGLTexture.newInstance());
    texture.setOpenGLRenderWindow(view);
    expect(upload(texture, createVolume([4, 4, 4], 4, 1))).toBe(true);

    const volume = createVolume(dimensions, numComps, 100);
    expect(upload(texture, volume, updatedExtents)).toBe(true);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    expect(readTexels(gl, texture, volume)).toEqual([...volume.data]);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'preserves every CT texel when streamed range growth requires full-float storage',
  ({ skip, onTestFinished }) => {
    const gc = testUtils.createGarbageCollector();
    const view = gc.registerResource(vtkOpenGLRenderWindow.newInstance());
    gc.registerResource(vtkRenderWindow.newInstance()).addView(view);
    view.initialize();
    const gl = view.getContext();
    if (!gl.getExtension('EXT_color_buffer_float')) {
      skip('Floating-point framebuffer attachments are unavailable.');
    }
    // Exercise a GPU without float-linear or norm16 support. This forces
    // Int16 range growth beyond half-float's exact domain to change storage.
    const getExtension = gl.getExtension.bind(gl);
    const extensionSpy = vi
      .spyOn(gl, 'getExtension')
      .mockImplementation((name) =>
        ['OES_texture_float_linear', 'EXT_texture_norm16'].includes(name)
          ? null
          : getExtension(name)
      );
    onTestFinished(() => extensionSpy.mockRestore());
    const values = Int16Array.from(
      { length: 8 * 8 * 4 },
      (_, i) => -1000 + (i % 20) * 100
    );
    const scalars = gc.registerResource(vtkDataArray.newInstance({ values }));
    const texture = gc.registerResource(vtkOpenGLTexture.newInstance());
    texture.setOpenGLRenderWindow(view);
    const upload = (updatedExtents = []) =>
      texture.create3DFilterableFromDataArray({
        width: 8,
        height: 8,
        depth: 4,
        dataArray: scalars,
        updatedExtents,
      });
    expect(upload()).toBe(true);
    const initialHandle = texture.getHandle();
    expect(texture.getInternalFormat(scalars.getDataType(), 1)).toBe(gl.R16F);
    values[3 * 64 + 19] = 3000;
    scalars.dataChange();
    expect(upload([[0, 7, 0, 7, 3, 3]])).toBe(true);
    expect(texture.getInternalFormat(scalars.getDataType(), 1)).toBe(gl.R32F);
    expect(gl.isTexture(initialHandle)).toBe(false);
    expect(texture.getHandle()).not.toBe(initialHandle);
    const framebuffer = gl.createFramebuffer();
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      for (let z = 0; z < 4; z++) {
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
        const rgba = new Float32Array(64 * 4);
        gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.FLOAT, rgba);
        expect(Array.from({ length: 64 }, (_, i) => rgba[4 * i])).toEqual([
          ...values.slice(z * 64, (z + 1) * 64),
        ]);
      }
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
    }
  }
);
