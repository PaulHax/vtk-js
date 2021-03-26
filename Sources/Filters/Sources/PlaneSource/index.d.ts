import { vec3 } from 'gl-matrix';
import {
	VtkAlgorithm,
	VtkObject
} from 'vtk.js/Sources/macro';

/**
 * 
 */
interface IPlaneSourceInitialValues {

	/**
	 * 
	 */
	xResolution?: number;
		
	/**
	 * 
	 */
	yResolution?: number;
		
	/**
	 * 
	 */
	origin?: Array<number>;
		
	/**
	 * 
	 */
	point1?: Array<number>;
		
	/**
	 * 
	 */
	point2?: Array<number>;
		
	/**
	 * 
	 */
	pointType?: string;
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

export interface vtkPlaneSource extends vtkAlgorithm {

	/**
	 * Get the center of the plane.
	 * @default [0, 0, 0]
	 */
	getCenter(): number[];

	/**
	 * Get the center of the plane.
	 */
	getCenterByReference(): number[];

	/**
	 * Get the normal of the plane.
	 * @default [0, 0, 1]
	 */
	getNormal(): number[];

	 /**
	  * Get the normal of the plane.
	  */
	getNormalByReference(): number[];

	/**
	 * Get the origin of the plane, lower-left corner.
	 * @default [0, 0, 0]
	 */
	getOrigin(): number[];

	 /**
	  * Get the origin of the plane, lower-left corner.
	  */
	getOriginByReference(): number[];

	/**
	 * Get the x axes of the plane.
	 * @default [1, 0, 0]
	 */
	getPoint1(): number[];

	/**
	 * Get the x axes of the plane.
	 */
	getPoint1ByReference(): number[];

	/**
	 * Get the y axes of the plane.
	 * @default [0, 1, 0]
	 */
	getPoint2(): number[];

	/**
	 * Get the y axes of the plane.
	 */
	getPoint2ByReference(): number[];

	/**
	 * Get the x resolution of the plane.
	 * @default 10
	 */
	getXResolution(): number;

	/**
	 * Get the y resolution of the plane.
	 * @default 10
	 */
	getYResolution(): number;

	/**
	 * 
	 * @param inData 
	 * @param outData 
	 */
	requestData(inData: any, outData: any): void;

	/**
	 * Rotate plane around a given axis
	 * @param angle theta Angle (radian) to rotate about
	 * @param rotationAxis Axis to rotate around
	 */
	rotate(angle: number, rotationAxis: vec3): void;

	/**
	 * Set the center of the plane.
	 * @param x 
	 * @param y 
	 * @param z 
	 */
	setCenter(x: number, y: number, z: number): void;

	/**
	 * Set the center of the plane.
	 * @param center 
	 */
	setCenter(center: number[]): void;

	/**
	 * Set the normal of the plane.
	 * @param normal 
	 */
	setNormal(normal: number[]): void;

	/**
	 * Set the origin of the plane.
	 * @param x 
	 * @param y 
	 * @param z 
	 */
	setOrigin(x: number, y: number, z: number): boolean;

	/**
	 * Set the origin of the plane.
	 * @param point2 
	 */
	setOriginFrom(origin: number[]): boolean;

	/**
	 * Specify a point defining the first axis of the plane.
	 * @param x 
	 * @param y 
	 * @param z 
	 */
	setPoint1(x: number, y: number, z: number): boolean;

	/**
	 * Specify a point defining the first axis of the plane.
	 * @param point1 
	 */
	setPoint1(point1: number[]): boolean;

	/**
	 * Specify a point defining the second axis of the plane.
	 * @param x 
	 * @param y 
	 * @param z 
	 */
	setPoint2(x: number, y: number, z: number): boolean;

	/**
	 * Specify a point defining the second axis of the plane.
	 * @param point2 
	 */
	setPoint2(point2: number[]): boolean;

	/**
	 * Set the number of facets used to represent the cone.
	 * @param resolution 
	 */
	setXResolution(xResolution: number): boolean;

	/**
	 * Set the number of facets used to represent the cone.
	 * @param resolution 
	 */
	setYResolution(xResolution: number): boolean;

	/**
	 * 
	 * @param v1 
	 * @param v2 
	 */
	updatePlane(v1: vec3, v2: vec3): boolean;
}

/**
 * Method used to decorate a given object (publicAPI+model) with vtkPlaneSource characteristics.
 *
 * @param publicAPI object on which methods will be bounds (public)
 * @param model object on which data structure will be bounds (protected)
 * @param initialValues (default: {})
 */
export function extend(publicAPI: object, model: object, initialValues?: IPlaneSourceInitialValues): void;

/**
 * Method used to create a new instance of vtkPlaneSource.
 * @param initialValues for pre-setting some of its content
 */
export function newInstance(initialValues?: IPlaneSourceInitialValues): vtkPlaneSource;

/**
 * vtkPlaneSource creates an m x n array of quadrilaterals arranged as a regular
 * tiling in a plane. The plane is defined by specifying an origin point, and then
 * two other points that, together with the origin, define two axes for the plane.
 * These axes do not have to be orthogonal - so you can create a parallelogram.
 * (The axes must not be parallel.) The resolution of the plane (i.e., number of
 * subdivisions) is controlled by the ivars XResolution and YResolution.
 * 
 * By default, the plane is centered at the origin and perpendicular to the z-axis,
 * with width and height of length 1 and resolutions set to 1.
 */
export declare const vtkPlaneSource: {
	newInstance: typeof newInstance,
	extend: typeof extend,
};
export default vtkPlaneSource;