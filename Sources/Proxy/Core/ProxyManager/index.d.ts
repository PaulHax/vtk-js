import { vtkObject, vtkSubscription } from '../../../interfaces';
import { vtkSourceProxy } from '../SourceProxy';
import { vtkViewProxy } from '../ViewProxy';
import { vtkAbstractRepresentationProxy } from '../AbstractRepresentationProxy';
import { vtkLookupTableProxy } from '../LookupTableProxy';
import { vtkPiecewiseFunctionProxy } from '../PiecewiseFunctionProxy';
import { VtkProxy } from '../../../macros';

export type ProxyConfiguration = object;

export interface ProxyRegistrationChangeInfo {
  action: 'register' | 'unregister';
  proxyId: string;
  proxyName: string;
  proxyGroup: string;
  proxy: VtkProxy;
}

export interface IProxyManagerInitialValues {
  proxyConfiguration?: ProxyConfiguration;
}

export interface vtkProxyManager extends vtkObject {
  // core //

  setProxyConfiguration(config: ProxyConfiguration): boolean;
  getProxyConfiguration(): ProxyConfiguration;

  setActiveSource<T>(sourceProxy: vtkSourceProxy<T> | undefined): void;
  getActiveSource<T>(): vtkSourceProxy<T> | undefined;
  onActiveSourceChange(
    callback: (source: vtkSourceProxy<any>) => void,
    priority?: number
  ): vtkSubscription;
  invokeActiveSourceChange(source: vtkSourceProxy<any>): void;

  setActiveView(viewProxy: vtkViewProxy | undefined): void;
  getActiveView(): vtkViewProxy | undefined;
  onActiveViewChange(
    callback: (view: vtkViewProxy) => void,
    priority?: number
  ): vtkSubscription;
  invokeActiveViewChange(view: vtkViewProxy): void;

  onProxyRegistrationChange(
    callback: (changeInfo: ProxyRegistrationChangeInfo) => void,
    priority?: number
  ): vtkSubscription;
  invokeProxyRegistrationChange(changeInfo: ProxyRegistrationChangeInfo): void;

  getProxyById<T extends VtkProxy>(id: string): T | undefined;
  getProxyGroups(): string[];
  getProxyInGroup(groupName: string): VtkProxy[];

  getSources(): vtkSourceProxy<any>[];
  getRepresentations(): vtkAbstractRepresentationProxy[];
  getViews(): vtkViewProxy[];

  createProxy<T extends VtkProxy>(
    group: string,
    name: string,
    options?: object
  ): T | null;

  getRepresentation<T extends vtkAbstractRepresentationProxy>(
    source: vtkSourceProxy<any>,
    view: vtkViewProxy
  ): T | null;

  deleteProxy(proxy: VtkProxy): void;

  // view //

  create3DView(options?: object): vtkViewProxy;
  create2DView(options?: object): vtkViewProxy;
  render(view?: vtkViewProxy): void;
  renderAllViews(blocking?: boolean): void;
  setAnimationOnAllViews(enable?: boolean): void;
  autoAnimateViews(debounceTimeout: number): void;
  resizeAllViews(): void;
  resetCamera(view?: vtkViewProxy): void;
  createRepresentationInAllViews(source: vtkSourceProxy<any>): void;
  resetCameraInAllViews(): void;

  // properties //

  // these are specific to the proxy configuration...
  getLookupTable(arrayName: string, options?: any): vtkLookupTableProxy;
  getPiecewiseFunction(
    arrayName: string,
    options?: any
  ): vtkPiecewiseFunctionProxy;
  rescaleTransferFunctionToDataRange(
    arrayName: string,
    dataRange: [number, number]
  ): void;
}

/**
 * Decorates a given publicAPI + model with vtkProxyManager characteristics.
 *
 * @param publicAPI
 * @param model
 * @param {IProxyManagerInitialValues} [initialValues]
 */
export function extend(
  publicAPI: object,
  model: object,
  initialValues?: IProxyManagerInitialValues
): void;

/**
 * Creates a vtkProxyManager.
 * @param {IProxyManagerInitialValues} [initialValues]
 */
export function newInstance(
  initialValues?: IProxyManagerInitialValues
): vtkProxyManager;

/**
 * vtkProxyManager is the central manager for managing proxy resources
 * in vtk.js.
 */
export declare const vtkProxyManager: {
  newInstance: typeof newInstance;
  extend: typeof extend;
};

export default vtkProxyManager;
