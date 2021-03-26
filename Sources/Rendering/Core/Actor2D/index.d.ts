import vtkProp from 'vtk.js/Sources/Rendering/Core/Prop';
import vtkCoordinate from 'vtk.js/Sources/Rendering/Core/Coordinate';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkProperty from 'vtk.js/Sources/Rendering/Core/Property';


/**
 * 
 */
interface IActor2DInitialValues {
	/**
	 * 
	 */
	mapper: vtkMapper;

	/**
	 * 
	 */
	property: vtkProperty;

	/**
	 * 
	 */
	layerNumber: number;

	/**
	 * 
	 */
	positionCoordinate: any;

	/**
	 * 
	 */
	positionCoordinate2: any;
}

export interface vtkActor2D extends vtkProp {
	/**
	 * 
	 * @returns  
	 */
	getActors2D(): any;

	/**
	 * 
	 * @returns  
	 */
	getIsOpaque(): boolean;


	/**
	 * Return the property object that controls this actors surface
	 * properties. This should be an instance of a vtkProperty object. Every
	 * actor must have a property associated with it. If one isn’t specified,
	 * then one will be generated automatically. Multiple actors can share one
	 * property object.
	 */
	getProperty(): vtkProperty;

	/**
	 * 
	 * @returns  
	 */
	hasTranslucentPolygonalGeometry(): boolean;

	/**
	 * ----------------------------------------------------------------------------
	 * Set the Prop2D's position in display coordinates.
	 * @param XPos 
	 * @param YPos 
	 */
	setDisplayPosition(XPos: any, YPos: any): void;

	/**
	 * ----------------------------------------------------------------------------
	 * @param w 
	 */
	setWidth(w: number): void;

	/**
	 * ----------------------------------------------------------------------------
	 * @param w 
	 */
	setHeight(h: number): void;

	/**
	 * ----------------------------------------------------------------------------
	 */
	getWidth(): number;

	/**
	 * ----------------------------------------------------------------------------
	 */
	getHeight(): number;

	/**
	 * Get the bounds for this Actor as [Xmin,Xmax,Ymin,Ymax,Zmin,Zmax].
	 * @returns 
	 */
	getBounds(): number[];

	/**
	 * Description:
	 * Return the actual vtkCoordinate reference that the mapper should use
	 * to position the actor. This is used internally by the mappers and should
	 * be overridden in specialized subclasses and otherwise ignored.
	 */
	getActualPositionCoordinate(): vtkCoordinate;

	/**
	 * 
	 */
	getActualPositionCoordinate2(): vtkCoordinate;
}

/**
 * Method use to decorate a given object (publicAPI+model) with vtkActor2D characteristics.
 *
 * @param publicAPI object on which methods will be bounds (public)
 * @param model object on which data structure will be bounds (protected)
 * @param initialValues (default: {})
 */
export function extend(publicAPI: object, model: object, initialValues?: IActor2DInitialValues): void;

/**
 * Method use to create a new instance of vtkActor2D
 * @param initialValues for pre-setting some of its content
 */
export function newInstance(initialValues?: IActor2DInitialValues): vtkActor2D;

/**
 * vtkActor2D is used to represent a 2D entity in a rendering scene. It inherits
 * functions related to the actors position, and orientation from
 * vtkProp. The actor also has scaling and maintains a reference to the
 * defining geometry (i.e., the mapper), rendering properties, and possibly a
 * texture map.
 * @see vtkMapper2D
 * @see vtkProperty2D 
 */
export declare const vtkActor2D: {
	newInstance: typeof newInstance,
	extend: typeof extend,
};
export default vtkActor2D;
