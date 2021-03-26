import { vec3 } from 'gl-matrix';
import vtkDataSet from 'vtk.js/Sources/Common/DataModel/DataSet';

/**
 * 
 */
interface IPointSetInitialValues {
}

export interface vtkPointSet extends vtkDataSet {

	/**
	 * Compute the (X, Y, Z) bounds of the data.
	 */
	computeBounds(): void;

	/**
	 * Get the bounds as [xmin, xmax, ymin, ymax, zmin, zmax].
	 */
	getBounds():  number[];

	/**
	 * 
	 */
	getNumberOfPoints(): number;

	/**
	 * 
	 */
	getPoints(): any;

	/**
	 * 
	 */
	setPoints(points: any): boolean;
}

/**
 * Method used to decorate a given object (publicAPI+model) with vtkPointSet characteristics.
 *
 * @param publicAPI object on which methods will be bounds (public)
 * @param model object on which data structure will be bounds (protected)
 * @param initialValues (default: {})
 */
export function extend(publicAPI: object, model: object, initialValues?: IPointSetInitialValues): void;

/**
 * Method used to create a new instance of vtkPointSet.
 * @param initialValues for pre-setting some of its content
 */
export function newInstance(initialValues?: IPointSetInitialValues): vtkPointSet;

/**
 * vtkPointSet is an abstract class that specifies the interface for
 * datasets that explicitly use "point" arrays to represent geometry.
 * 
 * For example, vtkPolyData and vtkUnstructuredGrid require point arrays
 * to specify point position, while vtkStructuredPoints generates point
 * positions implicitly.
 */
export declare const vtkPointSet: {
	newInstance: typeof newInstance,
	extend: typeof extend,
};
export default vtkPointSet;
