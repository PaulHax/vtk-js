import {
	VtkAlgorithm,
	VtkObject
} from 'vtk.js/Sources/macro';

export enum ShapeType {
	TRIANGLE,
	STAR,
	ARROW_4,
	ARROW_6
}

/**
 * 
 */
interface IArrow2DSourceInitialValues {

	/**
	 * 
	 */
	height?: number;

	/**
	 * 
	 */
	width?: number;

	/**
	 * 
	 */
	thickness?: number;

	/**
	 * 
	 */
	center?: number;

	/**
	 * 
	 */
	pointType?: string;

	/**
	 * 
	 */
	origin?: any;

	/**
	 * 
	 */
	direction?: any;
}

type vtkAlgorithm = VtkObject & Pick<VtkAlgorithm,
	'getNumberOfInputPorts' |
	'getNumberOfOutputPorts' |
	'getInputArrayToProcess' |
	'getOutputData' |
	'getOutputPort' |
	'setInputArrayToProcess' |
	'shouldUpdate' |
	'update'> ;

export interface vtkArrow2DSource extends vtkAlgorithm {
	/**
	 * Get the cap the base of the cone with a polygon.
	 * @default 0
	 */
	getBase(): number;

	/**
	 * Get the center of the cone.
	 * @default [0, 0, 0]
	 */
	getCenter(): number[];

	/**
	 * Get the center of the cone.
	 */
	getCenterByReference(): number[];

	/**
	 * Get the orientation vector of the cone.
	 * @default [1.0, 0.0, 0.0]
	 */
	getDirection(): number[];

	/**
	 * Get the orientation vector of the cone.
	 */
	getDirectionByReference(): number[];

	/**
	 * Get the height of the cone.
	 * @default 1.0
	 */
	getHeight(): number;

	/**
	 * Get the base thickness of the cone.
	 * @default 0.5
	 */
	getThickness(): number;

	/**
	 * Get the number of facets used to represent the cone.
	 * @default 6
	 */
	getWidth(): number;

	/**
	 * Expose methods
	 * @param inData 
	 * @param outData 
	 */
	requestData(inData: any, outData: any): void;

	/**
	 * Turn on/off whether to cap the base of the cone with a polygon.
	 * @param base 
	 */
	setBase(base: number): boolean;

	/**
	 * Set the center of the cone.
	 * It is located at the middle of the axis of the cone.
	 * Warning: this is not the center of the base of the cone!
	 * @param x 
	 * @param y 
	 * @param z 
	 * @default [0, 0, 0]
	 */
	setCenter(x: number, y: number, z: number): boolean;

	/**
	 * Set the center of the cone.
	 * It is located at the middle of the axis of the cone.
	 * Warning: this is not the center of the base of the cone!
	 * @param center 
	 * @default [0, 0, 0]
	 */
	setCenterFrom(center: number[]): boolean;

	/**
	 * 
	 * @param x 
	 * @param y 
	 * @param z 
	 */
	setDirection(x: number, y: number, z: number): boolean;

	/**
	 * 
	 * @param direction 
	 */
	setDirectionFrom(direction: number[]): boolean;

	/** 
	 * Set the height of the cone.
	 * This is the height along the cone in its specified direction.
	 * @param height 
	 */
	setHeight(height: number): boolean;

	/**
	 * Set the base thickness of the cone.
	 * @param thickness 
	 */
	setThickness(thickness: number): boolean;

	/**
	 * Set the number of facets used to represent the cone.
	 * @param width 
	 */
	setWidth(width: number): boolean;
}

/**
 * Method used to decorate a given object (publicAPI+model) with vtkArrow2DSource characteristics.
 *
 * @param publicAPI object on which methods will be bounds (public)
 * @param model object on which data structure will be bounds (protected)
 * @param initialValues (default: {})
 */
export function extend(publicAPI: object, model: object, initialValues?: IArrow2DSourceInitialValues): void;

/**
 * Method used to create a new instance of vtkArrow2DSource.
 * @param initialValues for pre-setting some of its content
 */
export function newInstance(initialValues?: IArrow2DSourceInitialValues): vtkArrow2DSource;

/**
 * vtkArrow2DSource creates a cone centered at a specified point and pointing in a specified direction. 
 * (By default, the center is the origin and the direction is the x-axis.) Depending upon the resolution of this object,
 * different representations are created. If resolution=0 a line is created; if resolution=1, a single triangle is created;
 * if resolution=2, two crossed triangles are created. For resolution > 2, a 3D cone (with resolution number of sides)
 * is created. It also is possible to control whether the bottom of the cone is capped with a (resolution-sided) polygon,
 * and to specify the height and thickness of the cone.
 */
export declare const vtkArrow2DSource: {
	newInstance: typeof newInstance,
	extend: typeof extend,
};
export default vtkArrow2DSource;
