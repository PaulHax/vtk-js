import vtkOpenGLRenderWindow, {
  IOpenGLRenderWindowInitialValues,
} from '../RenderWindow';

export interface ISharedRenderWindowInitialValues extends IOpenGLRenderWindowInitialValues {
  autoClear?: boolean;
}

export type SharedRenderCallback = () => void;

export interface vtkSharedRenderWindow extends vtkOpenGLRenderWindow {
  /**
   * Reset vtk.js render state and render into a host-owned WebGL2 context.
   * Call this from the host's render loop. vtk.js renders with its own GL
   * conventions (counter-clockwise front faces, back-face culling state
   * reset); hosts needing different winding must restore it afterward.
   */
  renderShared(): void;

  /** Reset vtk.js GL state and sync size before shared-context rendering. */
  prepareSharedRender(): void;

  syncSizeFromCanvas(): boolean;

  /**
   * Redirect vtk-side render requests (interactor renders, widget updates,
   * renderWindow.render()) to the host render loop instead of drawing
   * immediately. The callback should schedule a host repaint that ends up
   * calling renderShared().
   */
  setRenderCallback(callback?: SharedRenderCallback | null): void;

  setAutoClear(autoClear: boolean): boolean;
  getAutoClear(): boolean;
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
  gl: WebGL2RenderingContext,
  options?: ISharedRenderWindowInitialValues
): vtkSharedRenderWindow;

export declare const vtkSharedRenderWindow: {
  newInstance: typeof newInstance;
  extend: typeof extend;
  createFromContext: typeof createFromContext;
};
export default vtkSharedRenderWindow;
