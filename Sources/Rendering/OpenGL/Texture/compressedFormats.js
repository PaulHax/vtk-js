const CANONICAL_FORMAT_ORDER = ['astc-4x4', 'bc7', 'etc2-rgba8', 's3tc-dxt5'];

function isWebGL2Context(context) {
  const version = context.getParameter?.(context.VERSION);
  return typeof version === 'string' && version.startsWith('WebGL 2');
}

function probeCompressedTextureFormats(context) {
  if (!context || typeof context.getExtension !== 'function') {
    return new Map();
  }

  const formats = new Map();
  const astc = context.getExtension('WEBGL_compressed_texture_astc');
  if (
    astc?.COMPRESSED_RGBA_ASTC_4x4_KHR !== undefined &&
    astc?.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR !== undefined
  ) {
    formats.set('astc-4x4', {
      linear: astc.COMPRESSED_RGBA_ASTC_4x4_KHR,
      srgb: astc.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR,
    });
  }

  const bptc = context.getExtension('EXT_texture_compression_bptc');
  if (
    bptc?.COMPRESSED_RGBA_BPTC_UNORM_EXT !== undefined &&
    bptc?.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT !== undefined
  ) {
    formats.set('bc7', {
      linear: bptc.COMPRESSED_RGBA_BPTC_UNORM_EXT,
      srgb: bptc.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT,
    });
  }

  if (
    isWebGL2Context(context) &&
    context.COMPRESSED_RGBA8_ETC2_EAC !== undefined &&
    context.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC !== undefined
  ) {
    formats.set('etc2-rgba8', {
      linear: context.COMPRESSED_RGBA8_ETC2_EAC,
      srgb: context.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC,
    });
  } else {
    const etc = context.getExtension('WEBGL_compressed_texture_etc');
    if (
      etc?.COMPRESSED_RGBA8_ETC2_EAC !== undefined &&
      etc?.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC !== undefined
    ) {
      formats.set('etc2-rgba8', {
        linear: etc.COMPRESSED_RGBA8_ETC2_EAC,
        srgb: etc.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC,
      });
    }
  }

  const s3tc = context.getExtension('WEBGL_compressed_texture_s3tc');
  const s3tcSrgb = context.getExtension('WEBGL_compressed_texture_s3tc_srgb');
  if (
    s3tc?.COMPRESSED_RGBA_S3TC_DXT5_EXT !== undefined &&
    s3tcSrgb?.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT !== undefined
  ) {
    formats.set('s3tc-dxt5', {
      linear: s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT,
      srgb: s3tcSrgb.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT,
    });
  }

  return formats;
}

/**
 * Returns a structured-cloneable compressed texture descriptor. Numeric WebGL
 * enums deliberately remain private to the render context.
 */
export function getCompressedTextureCapabilities(context) {
  const probed = probeCompressedTextureFormats(context);
  const compressedFormats = CANONICAL_FORMAT_ORDER.filter((format) =>
    probed.has(format)
  );
  return {
    capabilityKey: `compressed-texture-v1:${
      compressedFormats.length ? compressedFormats.join(',') : 'rgba'
    }`,
    compressedFormats,
  };
}

/** Resolves a canonical name to an enum owned by the supplied live context. */
export function getCompressedTextureInternalFormat(context, format, srgb) {
  const entry = probeCompressedTextureFormats(context).get(format);
  return entry?.[srgb ? 'srgb' : 'linear'];
}

export default {
  getCompressedTextureCapabilities,
  getCompressedTextureInternalFormat,
};
