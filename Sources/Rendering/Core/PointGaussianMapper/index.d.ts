import vtkMapper, { IMapperInitialValues } from '../Mapper';

export interface IPointGaussianMapperInitialValues extends IMapperInitialValues {
  scaleFactor?: number;
  circle?: boolean;
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
