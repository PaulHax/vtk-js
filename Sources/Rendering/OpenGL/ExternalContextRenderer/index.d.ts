import vtkViewNode, {
  IViewNodeInitialValues,
} from '../../../Rendering/SceneGraph/ViewNode';

export interface IExternalContextRendererInitialValues extends IViewNodeInitialValues {
  context?: WebGLRenderingContext | WebGL2RenderingContext | null;
  selector?: any;
  _openGLRenderWindow?: any;
}

export interface vtkExternalContextRenderer extends vtkViewNode {
  buildPass(prepass: boolean): void;

  updateLights(): number;

  zBufferPass(prepass: boolean): void;

  opaqueZBufferPass(prepass: boolean): void;

  cameraPass(prepass: boolean): void;

  getAspectRatio(): number;

  getTiledSizeAndOrigin(): {
    usize: number;
    vsize: number;
    lowerLeftU: number;
    lowerLeftV: number;
  };

  clear(): void;

  releaseGraphicsResources(): void;

  setOpenGLRenderWindow(rw: any): void;

  getShaderCache(): any;

  getSelector(): any;

  setSelector(selector: any): boolean;
}

export function extend(
  publicAPI: object,
  model: object,
  initialValues?: IExternalContextRendererInitialValues
): void;

export function newInstance(
  initialValues?: IExternalContextRendererInitialValues
): vtkExternalContextRenderer;

export declare const vtkExternalContextRenderer: {
  newInstance: typeof newInstance;
  extend: typeof extend;
};
export default vtkExternalContextRenderer;
