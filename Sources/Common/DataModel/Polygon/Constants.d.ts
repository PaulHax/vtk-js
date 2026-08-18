export declare const EPSILON: number;
export declare const FLOAT_EPSILON: number;
export declare const TOLERANCE: number;

/**
 * Different states which pointInPolygon could return.
 */
export declare enum PolygonWithPointIntersectionState {
  FAILURE = -1,
  OUTSIDE = 0,
  INSIDE = 1,
  INTERSECTION = 2,
  ON_LINE = 3,
}
