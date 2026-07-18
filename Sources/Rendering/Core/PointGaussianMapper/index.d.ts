import vtkMapper, { IMapperInitialValues } from '../Mapper';

export interface IPointGaussianMapperInitialValues extends IMapperInitialValues {
  scaleFactor?: number;
  circle?: boolean;
  worldSize?: number;
}

export interface vtkPointGaussianMapper extends vtkMapper {
  /**
   * Get the screen-space point-size multiplier.
   */
  getScaleFactor(): number;

  /**
   * Multiplier applied on top of the actor point size (screen-space pixels).
   * @param scaleFactor 1 by default.
   */
  setScaleFactor(scaleFactor: number): boolean;

  /**
   * Whether points render as round splats (a gl_PointCoord edge discard)
   * instead of opaque squares.
   */
  getCircle(): boolean;

  /**
   * @param circle false (opaque square) by default.
   */
  setCircle(circle: boolean): boolean;

  /**
   * Get the world-space point diameter (0 when screen-space sizing is active).
   */
  getWorldSize(): number;

  /**
   * Point diameter in model units. When > 0, each point's pixel size is
   * derived from its distance to the camera (perspective) or the parallel
   * scale (orthographic), multiplied by scaleFactor and the actor
   * transform's scale (assumed isotropic — anisotropic actor scaling uses
   * the x-axis norm). The screen-space actor point size acts as the pixel
   * floor (sub-pixel splats keep the classic fixed-size look) and the
   * implementation's gl_PointSize range caps the ceiling.
   * When 0 (default), points use the actor point size in screen pixels.
   * @param worldSize 0 by default.
   */
  setWorldSize(worldSize: number): boolean;
}

/**
 * Method use to decorate a given object (publicAPI+model) with
 * vtkPointGaussianMapper characteristics.
 *
 * @param publicAPI object on which methods will be bounds (public)
 * @param model object on which data structure will be bounds (protected)
 * @param {IPointGaussianMapperInitialValues} [initialValues] (default: {})
 */
export function extend(
  publicAPI: object,
  model: object,
  initialValues?: IPointGaussianMapperInitialValues
): void;

/**
 * Method use to create a new instance of vtkPointGaussianMapper
 */
export function newInstance(
  initialValues?: IPointGaussianMapperInitialValues
): vtkPointGaussianMapper;

/**
 * vtkPointGaussianMapper inherits from vtkMapper.
 */
export declare const vtkPointGaussianMapper: {
  newInstance: typeof newInstance;
  extend: typeof extend;
};
export default vtkPointGaussianMapper;
