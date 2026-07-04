import vtkOpenGLRenderWindow, {
  IOpenGLRenderWindowInitialValues,
} from '../RenderWindow';

export interface IExternalContextRenderWindowInitialValues extends IOpenGLRenderWindowInitialValues {
  autoClear?: boolean;
}

export type ExternalRenderCallback = () => void;

export interface vtkExternalContextRenderWindow extends vtkOpenGLRenderWindow {
  /**
   * Reset vtk.js render state and render into a host-owned WebGL2 context.
   * Call this from the host's render loop. vtk.js renders with its own GL
   * conventions (counter-clockwise front faces, back-face culling state
   * reset); hosts needing different winding must restore it afterward.
   */
  renderExternal(): void;

  /** Reset vtk.js GL state and sync size before shared-context rendering. */
  prepareExternalRender(): void;

  syncSizeFromCanvas(): boolean;

  /**
   * Redirect vtk-side render requests (interactor renders, widget updates,
   * renderWindow.render()) to the host render loop instead of drawing
   * immediately. The callback should schedule a host repaint that ends up
   * calling renderExternal().
   */
  setRenderCallback(callback?: ExternalRenderCallback | null): void;

  setAutoClear(autoClear: boolean): boolean;
  getAutoClear(): boolean;
}

export function extend(
  publicAPI: object,
  model: object,
  initialValues?: IExternalContextRenderWindowInitialValues
): void;

export function newInstance(
  initialValues?: IExternalContextRenderWindowInitialValues
): vtkExternalContextRenderWindow;

export function createFromContext(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext,
  options?: IExternalContextRenderWindowInitialValues
): vtkExternalContextRenderWindow;

export declare const vtkExternalContextRenderWindow: {
  newInstance: typeof newInstance;
  extend: typeof extend;
  createFromContext: typeof createFromContext;
};
export default vtkExternalContextRenderWindow;
