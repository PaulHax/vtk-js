export declare const DataTypeByteSize: {
  Int8Array: number;
  Uint8Array: number;
  Uint8ClampedArray: number;
  Int16Array: number;
  Uint16Array: number;
  Int32Array: number;
  Uint32Array: number;
  Float32Array: number;
  Float64Array: number;
};

/**
 * Constants capturing the various VTK data types.
 */
export declare enum VtkDataTypes {
  VOID = '',
  CHAR = 'Int8Array',
  SIGNED_CHAR = 'Int8Array',
  UNSIGNED_CHAR = 'Uint8Array',
  /**
   * Should be used for VTK.js internal purpose only
   */
  UNSIGNED_CHAR_CLAMPED = 'Uint8ClampedArray',
  SHORT = 'Int16Array',
  UNSIGNED_SHORT = 'Uint16Array',
  INT = 'Int32Array',
  UNSIGNED_INT = 'Uint32Array',
  FLOAT = 'Float32Array',
  DOUBLE = 'Float64Array',
}

export declare const DefaultDataType: VtkDataTypes;

declare const _default: {
  DefaultDataType: typeof DefaultDataType;
  DataTypeByteSize: typeof DataTypeByteSize;
  VtkDataTypes: typeof VtkDataTypes;
};
export default _default;
