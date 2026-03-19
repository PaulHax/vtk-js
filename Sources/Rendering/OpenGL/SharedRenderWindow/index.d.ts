import vtkOpenGLRenderWindow, {
  IOpenGLRenderWindowInitialValues,
} from '../RenderWindow';

export interface ISharedRenderWindowInitialValues
  extends IOpenGLRenderWindowInitialValues {
  autoClear?: boolean;
  autoClearColor?: boolean;
  autoClearDepth?: boolean;
  useExternalCanvas?: boolean;
}

export type SharedRenderCallback = () => void;

export interface vtkSharedRenderWindow extends vtkOpenGLRenderWindow {
  /** Prepare shared state, render, then restore shared state. */
  renderShared(options?: Record<string, any>): void;

  /** Reset GL state and sync size before shared-context rendering. */
  prepareSharedRender(options?: Record<string, any>): void;

  restoreSharedState(): void;

  syncSizeFromCanvas(): boolean;

  /** Sync size and reset shader cache when another library touched the context. */
  prepareExternalRender(): void;

  setRenderCallback(callback?: SharedRenderCallback | null): void;

  setAutoClear(autoClear: boolean): boolean;
  getAutoClear(): boolean;

  setAutoClearColor(autoClearColor: boolean): boolean;
  getAutoClearColor(): boolean;

  setAutoClearDepth(autoClearDepth: boolean): boolean;
  getAutoClearDepth(): boolean;

  setUseExternalCanvas(useExternalCanvas: boolean): boolean;
  getUseExternalCanvas(): boolean;
}

export function extend(
  publicAPI: object,
  model: object,
  initialValues?: ISharedRenderWindowInitialValues
): void;

export function newInstance(
  initialValues?: ISharedRenderWindowInitialValues
): vtkSharedRenderWindow;

export function createFromContext(
  canvas: HTMLCanvasElement,
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  options?: ISharedRenderWindowInitialValues
): vtkSharedRenderWindow;

export declare const vtkSharedRenderWindow: {
  newInstance: typeof newInstance;
  extend: typeof extend;
  createFromContext: typeof createFromContext;
};
export default vtkSharedRenderWindow;
