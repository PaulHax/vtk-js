import vtkSharedRenderWindow, {
  ISharedRenderWindowInitialValues,
  ISharedRenderOptions,
} from '../SharedRenderWindow';

export interface IRestoringSharedRenderWindowInitialValues
  extends ISharedRenderWindowInitialValues {}

export interface vtkRestoringSharedRenderWindow extends vtkSharedRenderWindow {
  /**
   * Save host GL state, run the shared render, then restore host GL state.
   *
   * Restores: capabilities (BLEND, CULL_FACE, DEPTH_TEST, SCISSOR_TEST,
   * STENCIL_TEST, POLYGON_OFFSET_FILL, SAMPLE_ALPHA_TO_COVERAGE,
   * SAMPLE_COVERAGE, RASTERIZER_DISCARD), blend equation/func/color,
   * color/depth/stencil masks and clears, depth range and func, cull and
   * front face, polygon offset, active texture unit, current program, VAO,
   * ARRAY_BUFFER / ELEMENT_ARRAY_BUFFER / PIXEL_PACK_BUFFER /
   * PIXEL_UNPACK_BUFFER bindings, renderbuffer binding, READ/DRAW
   * framebuffer bindings, viewport, scissor, line width, sample coverage
   * value, pixel store params, draw buffers, and read buffer.
   *
   * Does NOT restore: per-unit texture bindings (TEXTURE_2D, TEXTURE_3D,
   * TEXTURE_CUBE_MAP, ...), per-unit sampler bindings, uniform buffer
   * (UBO) bindings, or transform feedback bindings. Hosts that depend on
   * any of those across renderShared() must rebind them after the call.
   *
   * Adds roughly one save's worth of getParameter cost per render.
   */
  renderShared(options?: ISharedRenderOptions): void;
}

export function extend(
  publicAPI: object,
  model: object,
  initialValues?: IRestoringSharedRenderWindowInitialValues
): void;

export function newInstance(
  initialValues?: IRestoringSharedRenderWindowInitialValues
): vtkRestoringSharedRenderWindow;

export function createFromContext(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext,
  options?: IRestoringSharedRenderWindowInitialValues
): vtkRestoringSharedRenderWindow;

export declare const vtkRestoringSharedRenderWindow: {
  newInstance: typeof newInstance;
  extend: typeof extend;
  createFromContext: typeof createFromContext;
};
export default vtkRestoringSharedRenderWindow;
