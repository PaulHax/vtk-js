import vtkCompositeMouseManipulator, {
  ICompositeMouseManipulatorInitialValues,
} from '../../../Interaction/Manipulators/CompositeMouseManipulator';
import { vtkObject } from '../../../interfaces';

export interface IMouseRangeManipulatorInitialValues extends ICompositeMouseManipulatorInitialValues {
  usePointerLock?: boolean;
}

export interface vtkMouseRangeManipulator
  extends vtkCompositeMouseManipulator, vtkObject {
  setHorizontalListener(
    min: number,
    max: number,
    step: number,
    getValue: number | (() => number),
    setValue: (v: number) => void,
    scale?: number,
    exponentialScroll?: boolean
  );
  setVerticalListener(
    min: number,
    max: number,
    step: number,
    getValue: number | (() => number),
    setValue: (v: number) => void,
    scale?: number,
    exponentialScroll?: boolean
  );
  setScrollListener(
    min: number,
    max: number,
    step: number,
    getValue: number | (() => number),
    setValue: (v: number) => void,
    scale?: number,
    exponentialScroll?: boolean
  );
  removeHorizontalListener();
  removeVerticalListener();
  removeScrollListener();
  removeAllListeners();

  /**
   *
   */
  getUsePointerLock(): boolean | undefined;

  /**
   *
   */
  setUsePointerLock(usePointerLock: boolean): boolean;
}

export function extend(
  publicAPI: object,
  model: object,
  initialValues?: IMouseRangeManipulatorInitialValues
): void;
export function newInstance(
  initialValues?: IMouseRangeManipulatorInitialValues
): vtkMouseRangeManipulator;

export declare const vtkMouseRangeManipulator: {
  newInstance: typeof newInstance;
  extend: typeof extend;
};

export default vtkMouseRangeManipulator;
