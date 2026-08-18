import vtkCompositeVRManipulator from '../CompositeVRManipulator';
import { Nullable } from '../../../types';

export interface vtk3DControllerModelSelectorManipulator extends vtkCompositeVRManipulator {
  getLastWorldPosition(): Nullable<Float64Array> | undefined;
  getLastOrientation(): Nullable<Float64Array> | undefined;
}

export interface I3DControllerModelSelectorManipulatorInitialValues extends vtkCompositeVRManipulator {}

export function extend(
  publicAPI: object,
  model: object,
  initialValues?: I3DControllerModelSelectorManipulatorInitialValues
): void;

export function newInstance(
  initialValues?: I3DControllerModelSelectorManipulatorInitialValues
): vtk3DControllerModelSelectorManipulator;

export const vtk3DControllerModelSelectorManipulator: {
  newInstance: typeof newInstance;
  extend: typeof extend;
};

export default vtk3DControllerModelSelectorManipulator;
