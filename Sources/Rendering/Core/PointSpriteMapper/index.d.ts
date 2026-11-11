import vtkPointGaussianMapper, {
  IPointGaussianMapperInitialValues,
} from '../PointGaussianMapper';

export type IPointSpriteMapperInitialValues =
  IPointGaussianMapperInitialValues & {
    pointSizeScale?: number;
    circle?: boolean;
    worldSize?: number;
    maximumPointCount?: number;
  };

export type vtkPointSpriteMapper = vtkPointGaussianMapper & {
  /**
   * Get the multiplier applied to the point size.
   */
  getPointSizeScale(): number;

  /**
   * Set a multiplier applied to the actor point size and, when it is
   * enabled, to worldSize, for example a device pixel ratio. Simple points
   * only. Default is 1.
   * @param {Number} pointSizeScale
   */
  setPointSizeScale(pointSizeScale: number): boolean;

  /**
   * Get whether points are drawn round.
   */
  getCircle(): boolean;

  /**
   * Set whether points are drawn as discs instead of squares. The corners
   * are discarded, so they neither draw nor select. Simple points only.
   * Default is false.
   * @param {Boolean} circle
   */
  setCircle(circle: boolean): boolean;

  /**
   * Get the point diameter in model units (0 when sizing in pixels).
   */
  getWorldSize(): number;

  /**
   * Set the point diameter in model units. Each point's pixel size then
   * follows its distance to the camera (perspective) or the parallel scale,
   * through the actor's scale, assumed isotropic. The actor point size,
   * times pointSizeScale, is the smallest size in pixels and the WebGL point
   * size range the largest.
   * Zero sizes points in pixels from the actor point size. Simple points
   * only. Default is 0.
   * @param {Number} worldSize
   */
  setWorldSize(worldSize: number): boolean;

  /**
   * Get the largest number of points drawn, or -1 for all of them.
   */
  getMaximumPointCount(): number;

  /**
   * Draw only the first maximumPointCount points (or splats). Changing the
   * count uploads nothing, so restoring the full cloud is immediate.
   * Finite values are truncated, negative values draw every point, and
   * non-finite values are ignored. Default is -1.
   * @param {Number} maximumPointCount
   */
  setMaximumPointCount(maximumPointCount: number): boolean;
};

/**
 * Method use to decorate a given object (publicAPI+model) with
 * vtkPointSpriteMapper characteristics.
 *
 * @param publicAPI object on which methods will be bounds (public)
 * @param model object on which data structure will be bounds (protected)
 * @param {IPointSpriteMapperInitialValues} [initialValues] (default: {})
 */
export function extend(
  publicAPI: object,
  model: object,
  initialValues?: IPointSpriteMapperInitialValues
): void;

/**
 * Method use to create a new instance of vtkPointSpriteMapper
 * @param {IPointSpriteMapperInitialValues} [initialValues] for pre-setting some of its content
 */
export function newInstance(
  initialValues?: IPointSpriteMapperInitialValues
): vtkPointSpriteMapper;

/**
 * vtkPointSpriteMapper is a vtkPointGaussianMapper for dense point clouds.
 * It defaults to opaque simple points (scaleFactor 0, emissive off) and adds
 * controls for them: a point size multiplier, round points, point sizes in
 * model units, and a draw limit that shows a prefix of the points without
 * uploading them again, for progressive loading.
 */
export declare const vtkPointSpriteMapper: {
  newInstance: typeof newInstance;
  extend: typeof extend;
};
export default vtkPointSpriteMapper;
