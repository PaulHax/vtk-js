/**
 * Boundary conditions available to compute open splines.
 */
export declare enum BoundaryCondition {
  /**
   * Desired slope at boundary point is derivative from two points (boundary and
   * second interior)
   */
  DEFAULT = 0,
  /**
   * Desired slope at boundary point is the boundary value given
   */
  DERIVATIVE = 1,
  /**
   * Second derivative at boundary point is the boundary value given
   */
  SECOND_DERIVATIVE = 2,
  /**
   * Desired second derivative at boundary point is the boundary value given
   * times second derivative at first interior point
   */
  SECOND_DERIVATIVE_INTERIOR_POINT = 3,
}

declare const _default: {
  BoundaryCondition: typeof BoundaryCondition;
};
export default _default;
