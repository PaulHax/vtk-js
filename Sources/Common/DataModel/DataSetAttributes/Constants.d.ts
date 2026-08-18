export declare enum AttributeTypes {
  SCALARS = 0,
  VECTORS = 1,
  NORMALS = 2,
  TCOORDS = 3,
  TENSORS = 4,
  GLOBALIDS = 5,
  PEDIGREEIDS = 6,
  EDGEFLAG = 7,
  NUM_ATTRIBUTES = 8,
}

export declare enum AttributeLimitTypes {
  MAX = 0,
  EXACT = 1,
  NOLIMIT = 2,
}

export declare enum CellGhostTypes {
  /**
   * The cell is present on multiple processors
   */
  DUPLICATECELL = 1,
  /**
   * The cell has more neighbors than in a regular mesh
   */
  HIGHCONNECTIVITYCELL = 2,
  /**
   * The cell has less neighbors than in a regular mesh
   */
  LOWCONNECTIVITYCELL = 4,
  /**
   * Other cells are present that refines it
   */
  REFINEDCELL = 8,
  /**
   * The cell is on the exterior of the data set
   */
  EXTERIORCELL = 16,
  /**
   * The cell is needed to maintain connectivity, but the data values should be
   * ignored
   */
  HIDDENCELL = 32,
}

export declare enum PointGhostTypes {
  /**
   * The point is present on multiple processors
   */
  DUPLICATEPOINT = 1,
  /**
   * The point is needed to maintain connectivity, but the data values should be
   * ignored
   */
  HIDDENPOINT = 2,
}

export declare enum AttributeCopyOperations {
  COPYTUPLE = 0,
  INTERPOLATE = 1,
  PASSDATA = 2,
  /**
   * All of the above
   */
  ALLCOPY = 3,
}

export declare const ghostArrayName: string;

export declare enum DesiredOutputPrecision {
  /**
   * Use the point type that does not truncate any data
   */
  DEFAULT = 0,
  /**
   * Use Float32Array
   */
  SINGLE = 1,
  /**
   * Use Float64Array
   */
  DOUBLE = 2,
}

declare const _default: {
  AttributeCopyOperations: typeof AttributeCopyOperations;
  AttributeLimitTypes: typeof AttributeLimitTypes;
  AttributeTypes: typeof AttributeTypes;
  CellGhostTypes: typeof CellGhostTypes;
  DesiredOutputPrecision: typeof DesiredOutputPrecision;
  PointGhostTypes: typeof PointGhostTypes;
  ghostArrayName: typeof ghostArrayName;
};
export default _default;
