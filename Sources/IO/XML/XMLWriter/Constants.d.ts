export declare enum FormatTypes {
  ASCII = 'ascii',
  BINARY = 'binary',
  APPENDED = 'appended',
}

/**
 * Mapping from a JavaScript typed array constructor name to the corresponding
 * VTK XML data array type name.
 */
export declare const TYPED_ARRAY: Record<string, string>;

declare const _default: {
  FormatTypes: typeof FormatTypes;
};
export default _default;
