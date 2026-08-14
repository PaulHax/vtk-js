import { beforeEach, describe, expect, it, vi } from 'vitest';

import vtkTexture from 'vtk.js/Sources/Rendering/Core/Texture';
import vtkOpenGLTexture from 'vtk.js/Sources/Rendering/OpenGL/Texture';
import {
  Filter,
  Wrap,
} from 'vtk.js/Sources/Rendering/OpenGL/Texture/Constants';
import {
  getCompressedTextureCapabilities,
  getCompressedTextureInternalFormat,
} from 'vtk.js/Sources/Rendering/OpenGL/Texture/compressedFormats';

const ENUMS = {
  TEXTURE_2D: 0x0de1,
  TEXTURE_BINDING_2D: 0x8069,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  TEXTURE_WRAP_R: 0x8072,
  TEXTURE_BASE_LEVEL: 0x813c,
  TEXTURE_MAX_LEVEL: 0x813d,
  NEAREST: 0x2600,
  LINEAR: 0x2601,
  NEAREST_MIPMAP_NEAREST: 0x2700,
  NEAREST_MIPMAP_LINEAR: 0x2702,
  LINEAR_MIPMAP_NEAREST: 0x2701,
  LINEAR_MIPMAP_LINEAR: 0x2703,
  CLAMP_TO_EDGE: 0x812f,
  REPEAT: 0x2901,
  MIRRORED_REPEAT: 0x8370,
  RGBA: 0x1908,
  UNSIGNED_BYTE: 0x1401,
  VERSION: 0x1f02,
  COMPRESSED_RGBA8_ETC2_EAC: 0x9278,
  COMPRESSED_SRGB8_ALPHA8_ETC2_EAC: 0x9279,
};

const EXTENSIONS = {
  WEBGL_compressed_texture_astc: {
    COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93b0,
    COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR: 0x93d0,
  },
  EXT_texture_compression_bptc: {
    COMPRESSED_RGBA_BPTC_UNORM_EXT: 0x8e8c,
    COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT: 0x8e8d,
  },
  WEBGL_compressed_texture_s3tc: {
    COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3,
  },
  WEBGL_compressed_texture_s3tc_srgb: {
    COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT: 0x8c4f,
  },
  WEBGL_compressed_texture_etc: {
    COMPRESSED_RGBA8_ETC2_EAC: 0x9278,
    COMPRESSED_SRGB8_ALPHA8_ETC2_EAC: 0x9279,
  },
};

function makeContext({ extensions = EXTENSIONS, webgl2 = true } = {}) {
  let nextTexture = 0;
  const gl = {
    ...ENUMS,
    getParameter: vi.fn((parameter) =>
      parameter === ENUMS.VERSION
        ? webgl2
          ? 'WebGL 2.0 fake'
          : 'WebGL 1.0 fake'
        : null
    ),
    getExtension: vi.fn((name) => extensions[name] ?? null),
    createTexture: vi.fn(() => ({ id: ++nextTexture })),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    compressedTexImage2D: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    texStorage2D: vi.fn(),
    texSubImage2D: vi.fn(),
    generateMipmap: vi.fn(),
    getIntegerv: vi.fn(),
  };
  return gl;
}

function makeRenderWindow(context) {
  let currentContext = context;
  return {
    getContext: () => currentContext,
    setContext: (nextContext) => {
      currentContext = nextContext;
    },
    activateTexture: vi.fn(),
    deactivateTexture: vi.fn(),
    getDefaultTextureInternalFormat: vi.fn(() => 0x8058),
    getDefaultTextureByteSize: vi.fn(() => 1),
    getGLInformations: vi.fn(() => ({ RENDERER: { value: 'fake' } })),
  };
}

const makePayload = (format = 'astc-4x4', srgb = true, seed = 1) => ({
  format,
  width: 4,
  height: 4,
  srgb,
  levels: [
    { width: 4, height: 4, data: new Uint8Array(16).fill(seed) },
    { width: 2, height: 2, data: new Uint8Array(16).fill(seed + 1) },
    { width: 1, height: 1, data: new Uint8Array(16).fill(seed + 2) },
  ],
});

describe('compressed texture capabilities', () => {
  it('discovers canonical formats in stable order without exposing enums', () => {
    const all = getCompressedTextureCapabilities(makeContext());
    expect(all).toEqual({
      capabilityKey: 'compressed-texture-v1:astc-4x4,bc7,etc2-rgba8,s3tc-dxt5',
      compressedFormats: ['astc-4x4', 'bc7', 'etc2-rgba8', 's3tc-dxt5'],
    });
    expect(JSON.stringify(all)).not.toMatch(/377|378|359|33779|enum/i);

    const reversed = Object.fromEntries(Object.entries(EXTENSIONS).reverse());
    expect(
      getCompressedTextureCapabilities(makeContext({ extensions: reversed }))
    ).toEqual(all);
  });

  it('distinguishes core WebGL2 ETC2 from the valid WebGL extension path', () => {
    const noExtensions = {};
    expect(
      getCompressedTextureCapabilities(
        makeContext({ extensions: noExtensions, webgl2: true })
      ).compressedFormats
    ).toEqual(['etc2-rgba8']);

    const webgl1Etc = {
      WEBGL_compressed_texture_etc: EXTENSIONS.WEBGL_compressed_texture_etc,
    };
    expect(
      getCompressedTextureCapabilities(
        makeContext({ extensions: webgl1Etc, webgl2: false })
      ).compressedFormats
    ).toEqual(['etc2-rgba8']);
    expect(
      getCompressedTextureCapabilities(
        makeContext({ extensions: {}, webgl2: false })
      )
    ).toEqual({
      capabilityKey: 'compressed-texture-v1:rgba',
      compressedFormats: [],
    });
  });

  it('advertises S3TC only when both linear and sRGB variants are usable', () => {
    const linearOnly = {
      WEBGL_compressed_texture_s3tc: EXTENSIONS.WEBGL_compressed_texture_s3tc,
    };
    expect(
      getCompressedTextureCapabilities(
        makeContext({ extensions: linearOnly, webgl2: false })
      ).compressedFormats
    ).not.toContain('s3tc-dxt5');
  });

  it.each([
    ['astc-4x4', false, 0x93b0],
    ['astc-4x4', true, 0x93d0],
    ['bc7', false, 0x8e8c],
    ['bc7', true, 0x8e8d],
    ['etc2-rgba8', false, 0x9278],
    ['etc2-rgba8', true, 0x9279],
    ['s3tc-dxt5', false, 0x83f3],
    ['s3tc-dxt5', true, 0x8c4f],
  ])('maps %s srgb=%s to its live-context enum', (format, srgb, expected) => {
    expect(
      getCompressedTextureInternalFormat(makeContext(), format, srgb)
    ).toBe(expected);
  });
});

describe('vtkOpenGLTexture compressed uploads', () => {
  let context;
  let renderWindow;
  let openGLTexture;

  beforeEach(() => {
    context = makeContext();
    renderWindow = makeRenderWindow(context);
    openGLTexture = vtkOpenGLTexture.newInstance();
    openGLTexture.setOpenGLRenderWindow(renderWindow);
  });

  it.each([
    ['astc-4x4', false, 0x93b0],
    ['astc-4x4', true, 0x93d0],
    ['bc7', false, 0x8e8c],
    ['bc7', true, 0x8e8d],
    ['etc2-rgba8', false, 0x9278],
    ['etc2-rgba8', true, 0x9279],
    ['s3tc-dxt5', false, 0x83f3],
    ['s3tc-dxt5', true, 0x8c4f],
  ])(
    'uploads every %s srgb=%s mip exactly once',
    (format, srgb, internalFormat) => {
      const payload = makePayload(format, srgb);

      expect(openGLTexture.create2DFromCompressed(payload)).toBe(true);

      expect(context.compressedTexImage2D).toHaveBeenCalledTimes(3);
      payload.levels.forEach((level, index) => {
        expect(context.compressedTexImage2D).toHaveBeenNthCalledWith(
          index + 1,
          context.TEXTURE_2D,
          index,
          internalFormat,
          level.width,
          level.height,
          0,
          level.data
        );
      });
      expect(context.texImage2D).not.toHaveBeenCalled();
      expect(context.generateMipmap).not.toHaveBeenCalled();
      expect(context.pixelStorei).not.toHaveBeenCalled();
      expect(openGLTexture.getAllocatedGPUMemoryInBytes()).toBe(48);
    }
  );

  it('fails closed before allocation when the requested variant is unsupported', () => {
    const unsupportedContext = makeContext({ extensions: {}, webgl2: false });
    const texture = vtkOpenGLTexture.newInstance();
    texture.setOpenGLRenderWindow(makeRenderWindow(unsupportedContext));

    expect(texture.create2DFromCompressed(makePayload('bc7'))).toBe(false);
    expect(unsupportedContext.createTexture).not.toHaveBeenCalled();
    expect(unsupportedContext.compressedTexImage2D).not.toHaveBeenCalled();
    expect(texture.getHandle()).toBe(0);

    expect(
      texture.create2DFromCompressed({ ...makePayload(), srgb: 'yes' })
    ).toBe(false);
    expect(unsupportedContext.createTexture).not.toHaveBeenCalled();
  });

  it('uses supplied mips and normal interpolation/repeat sampler state', () => {
    const renderable = vtkTexture.newInstance({
      interpolate: true,
      repeat: true,
    });
    renderable.setCompressedData(makePayload());
    openGLTexture.setRenderable(renderable);

    openGLTexture.render(renderWindow);

    expect(openGLTexture.getGenerateMipmap()).toBe(false);
    expect(openGLTexture.getMinificationFilter()).toBe(
      Filter.LINEAR_MIPMAP_LINEAR
    );
    expect(openGLTexture.getMagnificationFilter()).toBe(Filter.LINEAR);
    expect(openGLTexture.getWrapS()).toBe(Wrap.REPEAT);
    expect(openGLTexture.getWrapT()).toBe(Wrap.REPEAT);
    expect(context.generateMipmap).not.toHaveBeenCalled();
    expect(context.texParameteri).toHaveBeenCalledWith(
      context.TEXTURE_2D,
      context.TEXTURE_MAX_LEVEL,
      2
    );
    expect(context.texParameteri).toHaveBeenCalledWith(
      context.TEXTURE_2D,
      context.TEXTURE_MIN_FILTER,
      context.LINEAR_MIPMAP_LINEAR
    );
  });

  it('maps the exact independent sampler including mirrored repeat', () => {
    const renderable = vtkTexture.newInstance();
    renderable.setSampler({
      magFilter: 'nearest',
      minFilter: 'linear-mipmap-nearest',
      wrapS: 'repeat',
      wrapT: 'mirrored-repeat',
    });
    renderable.setCompressedData(makePayload());
    openGLTexture.setRenderable(renderable);
    openGLTexture.render(renderWindow);

    expect(openGLTexture.getMinificationFilter()).toBe(
      Filter.LINEAR_MIPMAP_NEAREST
    );
    expect(openGLTexture.getMagnificationFilter()).toBe(Filter.NEAREST);
    expect(openGLTexture.getWrapS()).toBe(Wrap.REPEAT);
    expect(openGLTexture.getWrapT()).toBe(Wrap.MIRRORED_REPEAT);
  });

  it('can upload normalized RGBA without pixel-store vertical flipping', () => {
    const renderable = vtkTexture.newInstance();
    renderable.setFlipY(false);
    renderable.setSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
      wrapS: 'clamp-to-edge',
      wrapT: 'clamp-to-edge',
    });
    renderable.setJsImageData({
      width: 1,
      height: 2,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
    });
    openGLTexture.setRenderable(renderable);
    openGLTexture.render(renderWindow);

    expect(openGLTexture.getHandle()).not.toBe(0);
    expect(context.pixelStorei).not.toHaveBeenCalledWith(
      context.UNPACK_FLIP_Y_WEBGL,
      true
    );
  });

  it('uploads an incomplete mip prefix with a non-mipmap minification filter', () => {
    const renderable = vtkTexture.newInstance();
    renderable.setSampler({
      magFilter: 'linear',
      minFilter: 'linear-mipmap-linear',
      wrapS: 'clamp-to-edge',
      wrapT: 'clamp-to-edge',
    });
    renderable.setCompressedData({
      ...makePayload(),
      levels: makePayload().levels.slice(0, 2),
    });
    openGLTexture.setRenderable(renderable);

    openGLTexture.render(renderWindow);
    openGLTexture.render(renderWindow);

    expect(context.compressedTexImage2D).toHaveBeenCalledTimes(2);
    expect(openGLTexture.getMinificationFilter()).toBe(Filter.LINEAR);
    expect(context.texParameteri).toHaveBeenCalledWith(
      context.TEXTURE_2D,
      context.TEXTURE_MAX_LEVEL,
      1
    );
    expect(context.texParameteri).toHaveBeenCalledWith(
      context.TEXTURE_2D,
      context.TEXTURE_MIN_FILTER,
      context.LINEAR
    );
  });

  it('does not copy compressed mip bytes again on steady renders', () => {
    const renderable = vtkTexture.newInstance();
    renderable.setCompressedData(makePayload());
    const initialData = renderable.getCompressedData();
    let getterCalls = 0;
    const countedRenderable = {
      getCompressedData: () => {
        getterCalls += 1;
        return initialData;
      },
      hasCompressedData: renderable.hasCompressedData,
      isCompressedDataComplete: renderable.isCompressedDataComplete,
      getInterpolate: renderable.getInterpolate,
      getRepeat: renderable.getRepeat,
      getInputData: renderable.getInputData,
      getImage: renderable.getImage,
      getImageBitmap: renderable.getImageBitmap,
      getCanvas: renderable.getCanvas,
      getJsImageData: renderable.getJsImageData,
      getMTime: renderable.getMTime,
    };
    openGLTexture.setRenderable(countedRenderable);

    openGLTexture.render(renderWindow);
    openGLTexture.render(renderWindow);
    openGLTexture.render(renderWindow);

    expect(getterCalls).toBe(1);
    expect(context.compressedTexImage2D).toHaveBeenCalledTimes(3);
  });

  it('deletes compressed storage before rebuilding from another source', () => {
    const renderable = vtkTexture.newInstance({ resizable: true });
    renderable.setCompressedData(makePayload());
    openGLTexture.setRenderable(renderable);
    openGLTexture.render(renderWindow);
    const compressedHandle = openGLTexture.getHandle();

    renderable.setJsImageData({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([1, 2, 3, 4]),
    });
    openGLTexture.render(renderWindow);

    expect(context.deleteTexture).toHaveBeenCalledWith(compressedHandle);
    expect(context.texImage2D).toHaveBeenCalledTimes(1);
    expect(context.texParameteri).toHaveBeenCalledWith(
      context.TEXTURE_2D,
      context.TEXTURE_MAX_LEVEL,
      1000
    );
  });

  it('deletes and replaces an existing compressed texture', () => {
    const renderable = vtkTexture.newInstance();
    renderable.setCompressedData(makePayload());
    openGLTexture.setRenderable(renderable);
    openGLTexture.render(renderWindow);
    const firstHandle = openGLTexture.getHandle();

    renderable.setCompressedData(makePayload('bc7', true, 10));
    openGLTexture.render(renderWindow);

    expect(context.deleteTexture).toHaveBeenCalledWith(firstHandle);
    expect(openGLTexture.getHandle()).not.toBe(firstHandle);
    expect(context.compressedTexImage2D).toHaveBeenCalledTimes(6);
  });

  it('rebuilds on context change and fails closed on an unsupported new context', () => {
    const renderable = vtkTexture.newInstance();
    renderable.setCompressedData(makePayload('astc-4x4'));
    openGLTexture.setRenderable(renderable);
    openGLTexture.render(renderWindow);
    const firstHandle = openGLTexture.getHandle();

    const secondContext = makeContext();
    const secondWindow = makeRenderWindow(secondContext);
    openGLTexture.render(secondWindow);
    expect(context.deleteTexture).toHaveBeenCalledWith(firstHandle);
    expect(secondContext.compressedTexImage2D).toHaveBeenCalledTimes(3);

    const thirdContext = makeContext({ extensions: {}, webgl2: false });
    const thirdWindow = makeRenderWindow(thirdContext);
    const secondHandle = openGLTexture.getHandle();
    openGLTexture.render(thirdWindow);
    expect(secondContext.deleteTexture).toHaveBeenCalledWith(secondHandle);
    expect(thirdContext.createTexture).not.toHaveBeenCalled();
    expect(openGLTexture.getHandle()).toBe(0);
    expect(openGLTexture.getAllocatedGPUMemoryInBytes()).toBe(0);
  });

  it('rebuilds when a render window replaces its context in place', () => {
    const renderable = vtkTexture.newInstance();
    renderable.setCompressedData(makePayload('etc2-rgba8'));
    openGLTexture.setRenderable(renderable);
    openGLTexture.render(renderWindow);
    const firstHandle = openGLTexture.getHandle();

    const replacementContext = makeContext();
    renderWindow.setContext(replacementContext);
    openGLTexture.render(renderWindow);

    expect(context.deleteTexture).toHaveBeenCalledWith(firstHandle);
    expect(replacementContext.compressedTexImage2D).toHaveBeenCalledTimes(3);
    expect(openGLTexture.getHandle()).not.toBe(firstHandle);
  });
});
