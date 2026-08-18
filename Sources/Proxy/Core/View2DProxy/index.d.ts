import { vtkViewProxy } from '../ViewProxy';

export interface vtkView2DProxy extends vtkViewProxy {
  getAxis(): number;
}

export function extend(
  publicAPI: object,
  model: object,
  initialValues?: object
): void;

export function newInstance(initialValues?: object): vtkView2DProxy;

export declare const vtkView2DProxy: {
  newInstance: typeof newInstance;
  extend: typeof extend;
};

export default vtkView2DProxy;
