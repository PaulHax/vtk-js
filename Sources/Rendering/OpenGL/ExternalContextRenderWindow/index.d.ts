import vtkOpenGLRenderWindow, {
  IOpenGLRenderWindowInitialValues,
} from '../RenderWindow';

export interface IExternalContextRenderWindowInitialValues extends IOpenGLRenderWindowInitialValues {
  autoClear?: boolean;
}

export type ExternalRenderCallback = () => void;

/**
 * GL state the host declares so vtk.js does not have to read it back.
 *
 * Every gl.getParameter of dynamic state is a synchronous CPU/GPU sync point
 * that stalls the calling thread until prior GPU work drains. A host that
 * declares its state here makes renderExternal() free of GL readbacks.
 */
export interface IHostGLState {
  /**
   * The framebuffer bound when renderExternal() is called (null for the
   * default framebuffer). When omitted, vtk.js falls back to querying
   * FRAMEBUFFER_BINDING.
   */
  framebuffer?: WebGLFramebuffer | null;

  /**
   * The draw-buffer list to (re)apply for that framebuffer. When omitted and
   * framebuffer is non-null, vtk.js falls back to querying DRAW_BUFFERi.
   */
  drawBuffers?: GLenum[];
}

export interface vtkExternalContextRenderWindow extends vtkOpenGLRenderWindow {
  /**
   * Reset vtk.js render state and render into the host-owned WebGL2 context.
   * Call this from the host's render loop.
   *
   * Contract with the host:
   * - On entry, nothing is assumed: every piece of GL state vtk.js depends
   *   on is force-set (blind writes, no save). Pass hostState to also avoid
   *   the framebuffer-binding readbacks.
   * - On exit, GL state is left as vtk.js used it (CCW front faces, vtk
   *   blend/depth state, program and VAO cleared). The host must re-establish
   *   its own state before its next draw. State-tracking hosts already do:
   *   MapLibre/Mapbox invalidate their tracker after every custom-layer
   *   render, three.js exposes resetState() for the same purpose.
   */
  renderExternal(hostState?: IHostGLState): void;

  /**
   * Reset vtk.js GL state and sync size before an external-context render.
   * Called by renderExternal(); exposed for hosts that drive the render pass
   * themselves.
   */
  prepareExternalRender(hostState?: IHostGLState): void;

  syncSizeFromCanvas(): boolean;

  /**
   * Redirect vtk-side render requests (interactor renders, widget updates,
   * renderWindow.render()) to the host render loop instead of drawing
   * immediately. The callback should schedule a host repaint that ends up
   * calling renderExternal().
   */
  setRenderCallback(callback?: ExternalRenderCallback | null): void;

  /**
   * When true, each renderer applies its preserveColorBuffer and
   * preserveDepthBuffer settings. When false, renderer clears leave the host
   * framebuffer contents unchanged.
   */
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
