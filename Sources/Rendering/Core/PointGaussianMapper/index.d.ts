import { Nullable, Vector3 } from '../../../types';
import vtkPiecewiseFunction from '../../../Common/DataModel/PiecewiseFunction';
import vtkMapper, { IMapperInitialValues } from '../Mapper';

export type IPointGaussianMapperInitialValues = IMapperInitialValues & {
  scaleArray?: Nullable<string>;
  scaleArrayComponent?: number;
  scaleFunction?: Nullable<vtkPiecewiseFunction>;
  scaleTableSize?: number;
  opacityArray?: Nullable<string>;
  opacityArrayComponent?: number;
  scalarOpacityFunction?: Nullable<vtkPiecewiseFunction>;
  opacityTableSize?: number;
  scaleFactor?: number;
  splatShaderCode?: Nullable<string>;
  emissive?: boolean;
  boundScale?: number;
  anisotropic?: boolean;
  rotationArray?: Nullable<string>;
  lowpassMatrix?: Vector3;
};

export type vtkPointGaussianMapper = vtkMapper & {
  /**
   * Get the name of the point data array that scales the splats.
   */
  getScaleArray(): Nullable<string>;

  /**
   * Set the name of the point data array that scales the splats. Each value,
   * after the optional scale function, is a splat's standard deviation before
   * the scale factor. With anisotropic splats the array must have three
   * components, one standard deviation per axis. Default is null: every
   * splat has a standard deviation of one.
   * @param {Nullable<String>} scaleArray
   */
  setScaleArray(scaleArray: Nullable<string>): boolean;

  /**
   * Get the component of the scale array to use.
   */
  getScaleArrayComponent(): number;

  /**
   * Set the component of the scale array to use. A single-component array
   * always uses its only component, a fractional component rounds down, and
   * one outside the tuple uses the tuple magnitude. Ignored for anisotropic
   * splats. Default is 0.
   * @param {Number} scaleArrayComponent
   */
  setScaleArrayComponent(scaleArrayComponent: number): boolean;

  /**
   * Get the optional function that maps scale array values.
   */
  getScaleFunction(): Nullable<vtkPiecewiseFunction>;

  /**
   * Set an optional function that maps scale array values to standard
   * deviations. It is sampled over its own range into a table of
   * scaleTableSize entries, and values outside that range clamp to its ends.
   * Only used with a scale array, and not for anisotropic splats.
   * @param {Nullable<vtkPiecewiseFunction>} scaleFunction
   */
  setScaleFunction(scaleFunction: Nullable<vtkPiecewiseFunction>): boolean;

  /**
   * Get the number of samples taken from the scale function.
   */
  getScaleTableSize(): number;

  /**
   * Set the number of samples taken from the scale function. Default is 1024.
   * @param {Number} scaleTableSize
   */
  setScaleTableSize(scaleTableSize: number): boolean;

  /**
   * Get the name of the point data array that sets the opacities.
   */
  getOpacityArray(): Nullable<string>;

  /**
   * Set the name of the point data array that sets each point's opacity, in
   * place of the alpha of its colour. Values are mapped through the optional
   * scalar opacity function, then multiplied by the property opacity. An
   * array with values below one makes the prop translucent, unless it is
   * emissive. Default is null.
   * @param {Nullable<String>} opacityArray
   */
  setOpacityArray(opacityArray: Nullable<string>): boolean;

  /**
   * Get the component of the opacity array to use.
   */
  getOpacityArrayComponent(): number;

  /**
   * Set the component of the opacity array to use, with the same rules as
   * scaleArrayComponent. Default is 0.
   * @param {Number} opacityArrayComponent
   */
  setOpacityArrayComponent(opacityArrayComponent: number): boolean;

  /**
   * Get the optional function that maps opacity array values.
   */
  getScalarOpacityFunction(): Nullable<vtkPiecewiseFunction>;

  /**
   * Set an optional function that maps opacity array values to opacities,
   * sampled like the scale function. Only used with an opacity array.
   * @param {Nullable<vtkPiecewiseFunction>} scalarOpacityFunction
   */
  setScalarOpacityFunction(
    scalarOpacityFunction: Nullable<vtkPiecewiseFunction>
  ): boolean;

  /**
   * Get the number of samples taken from the scalar opacity function.
   */
  getOpacityTableSize(): number;

  /**
   * Set the number of samples taken from the scalar opacity function.
   * Default is 1024.
   * @param {Number} opacityTableSize
   */
  setOpacityTableSize(opacityTableSize: number): boolean;

  /**
   * Get the factor applied to every splat's standard deviation.
   */
  getScaleFactor(): number;

  /**
   * Set the factor applied to every splat's standard deviation, after the
   * scale function. Zero draws simple points of the actor point size, one
   * vertex per point, instead of splats. Default is 1.
   * @param {Number} scaleFactor
   */
  setScaleFactor(scaleFactor: number): boolean;

  /**
   * Get the fragment shader code that shades the splats.
   */
  getSplatShaderCode(): Nullable<string>;

  /**
   * Set fragment shader code that replaces the default Gaussian falloff of
   * the splats. It replaces the //VTK::Color::Impl tag, so start the code
   * with that tag to keep the default colouring. It can read and modify
   * `opacity`, `diffuseColor` and `ambientColor`, and read
   * `offsetVCVSOutput`, the offset from the splat centre in standard
   * deviations. Non-emissive splats with custom code render as opaque
   * geometry unless an opacity makes them translucent, so code that fades
   * `opacity` also needs, for example, the actor forced translucent. Not
   * used for simple points. Default is null.
   * @param {Nullable<String>} splatShaderCode
   */
  setSplatShaderCode(splatShaderCode: Nullable<string>): boolean;

  /**
   * Get whether points and splats emit light.
   */
  getEmissive(): boolean;

  /**
   * Set whether points and splats emit light. Emissive points blend
   * additively and write no depth. They render with the opaque geometry, in
   * actor order, so add their actors after the opaque ones: opaque geometry
   * drawn after them covers them even where it is behind them. A property
   * opacity below one, or an actor forced translucent, makes them ordinary
   * translucent geometry; an opacity array, or an actor forced opaque, dims
   * them and keeps them additive. When false, simple points and splats with
   * custom shader code render as opaque geometry, and splats with the
   * default Gaussian falloff, like anything with an opacity below one,
   * render as translucent geometry. Default is true.
   * @param {Boolean} emissive
   */
  setEmissive(emissive: boolean): boolean;

  /**
   * Get the half extent of each splat's quad, in standard deviations.
   */
  getBoundScale(): number;

  /**
   * Set the half extent of each splat's quad, in standard deviations. The
   * default of 3 contains the visible part of a Gaussian. Custom splat
   * shader code that draws a smaller shape can lower it to shade fewer
   * fragments. Default is 3.
   * @param {Number} boundScale
   */
  setBoundScale(boundScale: number): boolean;

  /**
   * Get whether splats are anisotropic.
   */
  getAnisotropic(): boolean;

  /**
   * Set whether splats are anisotropic 3D Gaussians: stretched by the three
   * components of the scale array and oriented by the rotation array.
   * Default is false.
   * @param {Boolean} anisotropic
   */
  setAnisotropic(anisotropic: boolean): boolean;

  /**
   * Get the name of the point data array that orients anisotropic splats.
   */
  getRotationArray(): Nullable<string>;

  /**
   * Set the name of the point data array that orients anisotropic splats.
   * Each tuple is a quaternion with the real part first. Default is null:
   * unrotated.
   * @param {Nullable<String>} rotationArray
   */
  setRotationArray(rotationArray: Nullable<string>): boolean;

  /**
   * Get the low-pass filter added to the projected splat covariance.
   */
  getLowpassMatrix(): Vector3;

  /**
   * Get a reference to the low-pass filter added to the projected splat
   * covariance.
   */
  getLowpassMatrixByReference(): Vector3;

  /**
   * Set a low-pass filter added to each splat's projected 2D covariance,
   * for example to keep splats at least a pixel wide. The symmetric matrix
   * [a b; b c] is given as (a, b, c), in squared normalized device
   * coordinates: a variance of v square pixels in a view of W by H pixels
   * is (4v / W^2, 0, 4v / H^2). Default is (0, 0, 0).
   * @param {Number} a
   * @param {Number} b
   * @param {Number} c
   */
  setLowpassMatrix(a: number, b: number, c: number): boolean;

  /**
   * Set a low-pass filter added to each splat's projected 2D covariance.
   * @param {Vector3} lowpassMatrix
   */
  setLowpassMatrix(lowpassMatrix: Vector3): boolean;

  /**
   * Set the low-pass filter from an array, copying its values.
   * @param {Vector3} lowpassMatrix
   */
  setLowpassMatrixFrom(lowpassMatrix: Vector3): boolean;

  /**
   * Point Gaussians always colour each point from a single colour, so they
   * never use texture colouring.
   */
  canUseTextureMapForColoring(): boolean;

  /**
   * Not supported: the point buffers carry no custom attributes. Logs a
   * warning and returns false.
   * @param {String[]} customShaderAttributes
   */
  setCustomShaderAttributes(customShaderAttributes: string[]): boolean;
};

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
 * @param {IPointGaussianMapperInitialValues} [initialValues] for pre-setting some of its content
 */
export function newInstance(
  initialValues?: IPointGaussianMapperInitialValues
): vtkPointGaussianMapper;

/**
 * vtkPointGaussianMapper draws each point of a vtkPolyData as a Gaussian
 * splat, or as a simple point when the scale factor is zero, without needing
 * cells. When the polydata has verts cells, only the points they reference
 * are drawn. It matches VTK's vtkPointGaussianMapper: splats are sized by a
 * scale array through an optional piecewise function, their opacity can come
 * from an opacity array, custom fragment shader code can draw other shapes,
 * and anisotropic splats render 3D Gaussian splatting data from scale and
 * rotation arrays. Point Gaussians are unlit. By default the splats emit
 * light; see setEmissive for how that orders them with other geometry.
 * Splats do not support actors in the DISPLAY coordinate system.
 *
 * Hardware selection returns point ids, and for cells the ids of the verts
 * cells that draw the points, or the point ids when there are no verts cells.
 */
export declare const vtkPointGaussianMapper: {
  newInstance: typeof newInstance;
  extend: typeof extend;
};
export default vtkPointGaussianMapper;
