const CANONICAL_FORMAT_ORDER = ['astc-4x4', 'bc7', 'etc2-rgba8', 's3tc-dxt5'];

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

  // ETC2 is a core WebGL2 format, but the enums are only ever reachable through
  // WEBGL_compressed_texture_etc: a WebGL2 context exposes neither the
  // constants nor a working format until that extension has been requested.
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

  // Unlike ASTC and BPTC, the linear and sRGB S3TC variants come from two
  // independent optional extensions. Register whichever variants the context
  // actually exposes instead of requiring the pair.
  const s3tc = context.getExtension('WEBGL_compressed_texture_s3tc');
  const s3tcSrgb = context.getExtension('WEBGL_compressed_texture_s3tc_srgb');
  const s3tcLinearFormat = s3tc?.COMPRESSED_RGBA_S3TC_DXT5_EXT;
  const s3tcSrgbFormat = s3tcSrgb?.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT;
  if (s3tcLinearFormat !== undefined || s3tcSrgbFormat !== undefined) {
    formats.set('s3tc-dxt5', {
      linear: s3tcLinearFormat,
      srgb: s3tcSrgbFormat,
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
