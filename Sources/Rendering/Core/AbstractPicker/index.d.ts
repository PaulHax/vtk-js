import { VtkObject } from 'vtk.js/Sources/macro';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer'

/**
 * 
 */
export interface vtkAbstractPicker extends VtkObject {

	/**
	 * 
	 * @param actor 
	 */
	addPickList(actor : vtkActor): void;

	/**
	 * 
	 * @param actor 
	 */
	deletePickList(actor : vtkActor): void;

	/**
	 * 
	 *
	 */
	getPickFromList(): boolean;

	/**
	 *
	 */
	getPickList(): boolean;

	/**
	 * Get the picked position
	 * @returns 
	 * @default [0.0, 0.0, 0.0]
	 */
	getPickPosition(): number[];

	/**
	 * 
	 * Get the picked position
	 * @returns 
	 * @default [0.0, 0.0, 0.0]
	 */
	getPickPositionByReference(): number[];
	
	/**
	 * 
	 */
	getRenderer(): vtkRenderer;

	/**
	 * 
	 * @returns 
	 * @default [0.0, 0.0, 0.0]
	 */
	getSelectionPoint(): number[];

	/**
	 * 
	 * @returns 
	 * @default [0.0, 0.0, 0.0]
	 */
	getSelectionPointByReference(): number[];

	/**
	 * 
	 */
	initialize(): void;

	/**
	 * Set pickList to empty array.
	 */
	initializePickList(): void;

	/**
	 * 
	 * @param pickFromList 
	 * @default 0
	 */
	setPickFromList(pickFromList: number): boolean;

	/**
	 * 
	 * @param pickList 
	 * @default []
	 */
	setPickList(pickList: vtkActor[]): boolean;
}

/**
 * Method used to decorate a given object (publicAPI+model) with vtkAbstractPicker characteristics.
 *
 * @param publicAPI object on which methods will be bounds (public)
 * @param model object on which data structure will be bounds (protected)
 * @param initialValues (default: {})
 */
export function extend(publicAPI: object, model: object, initialValues?: object): void;

/**
 * vtkAbstractPicker is an abstract superclass that defines a minimal API for its concrete subclasses.
 * The minimum functionality of a picker is to return the x-y-z global coordinate position of a pick (the pick itself is defined in display coordinates).
 * 
 * The API to this class is to invoke the Pick() method with a selection point (in display coordinates - pixels)
 * and a renderer. Then get the resulting pick position in global coordinates with the GetPickPosition() method.
 * @see vtkPointPicker
 */
export declare const vtkAbstractPicker: {
    extend: typeof extend,
};
export default vtkAbstractPicker;
