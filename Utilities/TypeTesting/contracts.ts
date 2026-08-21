import vtkDataArray from '../../Sources/Common/Core/DataArray';
import vtkPiecewiseFunction from '../../Sources/Common/DataModel/PiecewiseFunction';
import { convertItkToVtkImage } from '../../Sources/Common/DataModel/ITKHelper';
import vtkProxyManager from '../../Sources/Proxy/Core/ProxyManager';
import vtkGlyph3DMapper from '../../Sources/Rendering/Core/Glyph3DMapper';
import vtkImageArrayMapper from '../../Sources/Rendering/Core/ImageArrayMapper';
import vtkViewNode from '../../Sources/Rendering/SceneGraph/ViewNode';
import { SlabTypes } from '../../Sources/Rendering/Core/ImageResliceMapper/Constants';
import type vtkImageData from '../../Sources/Common/DataModel/ImageData';
import type { vtkSubscription } from '../../Sources/interfaces';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

declare const dataArray: vtkDataArray;
declare const piecewiseFunction: vtkPiecewiseFunction;
declare const proxyManager: vtkProxyManager;
declare const glyphMapper: vtkGlyph3DMapper;
declare const imageArrayMapper: vtkImageArrayMapper;
declare const viewNode: vtkViewNode;

type _InitializeReturnsSelf = Expect<
  Equal<ReturnType<typeof dataArray.initialize>, vtkDataArray>
>;
type _AddPointReturnsIndex = Expect<
  Equal<ReturnType<typeof piecewiseFunction.addPoint>, number>
>;
type _ActiveViewSetterReturnsVoid = Expect<
  Equal<ReturnType<typeof proxyManager.setActiveView>, void>
>;
type _GlyphScaleDataIsNullable = Expect<
  Equal<ReturnType<typeof glyphMapper.getScaleArrayData>, vtkDataArray | null>
>;
type _ImageArraySliceSetterReturnsVoid = Expect<
  Equal<ReturnType<typeof imageArrayMapper.setSlice>, void>
>;
type _ViewNodeFactoryIsNullable = Expect<
  Equal<ReturnType<typeof viewNode.createViewNode>, vtkViewNode | null>
>;
type _ItkConversionIsNullable = Expect<
  Equal<ReturnType<typeof convertItkToVtkImage>, vtkImageData | null>
>;
type _ModifiedSubscriptionIsNullable = Expect<
  Equal<ReturnType<typeof imageArrayMapper.onModified>, vtkSubscription | null>
>;

const slabType: SlabTypes = SlabTypes.MAX;
void slabType;

// Runtime constants are plain objects and have no numeric enum reverse map.
// @ts-expect-error numeric reverse lookup is not part of the runtime API
SlabTypes[SlabTypes.MAX];
