import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import { convertItkToVtkImage } from '@kitware/vtk.js/Common/DataModel/ITKHelper';
import vtkProxyManager from '@kitware/vtk.js/Proxy/Core/ProxyManager';
import vtkGlyph3DMapper from '@kitware/vtk.js/Rendering/Core/Glyph3DMapper';
import vtkImageArrayMapper from '@kitware/vtk.js/Rendering/Core/ImageArrayMapper';
import { SlabTypes } from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper/Constants';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { vtkSubscription } from '@kitware/vtk.js/interfaces';

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
type _ItkConversionIsNullable = Expect<
  Equal<ReturnType<typeof convertItkToVtkImage>, vtkImageData | null>
>;
type _ModifiedSubscriptionIsNullable = Expect<
  Equal<ReturnType<typeof imageArrayMapper.onModified>, vtkSubscription | null>
>;

const slabType: SlabTypes = SlabTypes.MEAN;
void slabType;

// @ts-expect-error runtime constant objects do not provide enum reverse maps
SlabTypes[SlabTypes.MEAN];
