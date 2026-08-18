export declare enum VectorMode {
  MAGNITUDE = 0,
  COMPONENT = 1,
  RGBCOLORS = 2,
}

export declare enum ScalarMappingTarget {
  LUMINANCE = 1,
  LUMINANCE_ALPHA = 2,
  RGB = 3,
  RGBA = 4,
}

export declare enum Scale {
  LINEAR = 0,
  LOG10 = 1,
}

declare const _default: {
  VectorMode: typeof VectorMode;
  ScalarMappingTarget: typeof ScalarMappingTarget;
  Scale: typeof Scale;
};
export default _default;
