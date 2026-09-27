import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

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
