import { CompressedTextureFormat } from '../../Core/Texture';

export interface CompressedTextureCapabilities {
  capabilityKey: string;
  compressedFormats: CompressedTextureFormat[];
}

export function getCompressedTextureCapabilities(
  context: WebGLRenderingContext | WebGL2RenderingContext
): CompressedTextureCapabilities;

/**
 * Returns the live-context internal-format enum, or undefined when unsupported.
 * Numeric enums are not part of the serializable capability descriptor.
 */
export function getCompressedTextureInternalFormat(
  context: WebGLRenderingContext | WebGL2RenderingContext,
  format: CompressedTextureFormat,
  srgb: boolean
): number | undefined;

declare const _default: {
  getCompressedTextureCapabilities: typeof getCompressedTextureCapabilities;
  getCompressedTextureInternalFormat: typeof getCompressedTextureInternalFormat;
};
export default _default;
