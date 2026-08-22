import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import { convertItkToVtkImage } from '@kitware/vtk.js/Common/DataModel/ITKHelper';
import vtkProxyManager from '@kitware/vtk.js/Proxy/Core/ProxyManager';
import vtkLookupTableProxy, {
  RGBHSVPoint,
} from '@kitware/vtk.js/Proxy/Core/LookupTableProxy';
import vtkDataSet from '@kitware/vtk.js/Common/DataModel/DataSet';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkSkybox from '@kitware/vtk.js/Rendering/Core/Skybox';
import { FieldAssociations } from '@kitware/vtk.js/Common/DataModel/DataSet/Constants';
import type { vtkGeometryRepresentationProxy } from '@kitware/vtk.js/Proxy/Representations/GeometryRepresentationProxy';
import type { ICoincidentTopology } from '@kitware/vtk.js/Rendering/Core/Mapper/CoincidentTopologyHelper';
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

// --------------------------------------------------------------------------
// Member-surface regressions
// --------------------------------------------------------------------------

declare const renderer: vtkRenderer;
declare const skybox: vtkSkybox;
declare const mapper: vtkMapper;
declare const lookupTableProxy: vtkLookupTableProxy;
declare const geometryRepresentation: vtkGeometryRepresentationProxy;

type _RendererBackgroundTextureFlag = Expect<
  Equal<ReturnType<typeof renderer.getTexturedBackground>, boolean>
>;
type _SkyboxFormatSetterReturnsBoolean = Expect<
  Equal<ReturnType<typeof skybox.setFormat>, boolean>
>;
type _PointOffsetParameterIsSingular = Expect<
  Equal<
    ReturnType<typeof mapper.getCoincidentTopologyPointOffsetParameter>,
    ICoincidentTopology
  >
>;
type _LookupTableProxyPointsUseMacroCasing = Expect<
  Equal<ReturnType<typeof lookupTableProxy.getRgbPoints>, RGBHSVPoint[]>
>;
type _RepresentationProxyIsAProp = Expect<
  Equal<ReturnType<typeof geometryRepresentation.getNestedPickable>, boolean>
>;
type _ProxyManagerIsAProxy = Expect<
  Equal<ReturnType<typeof proxyManager.getProxyId>, string>
>;

const association: FieldAssociations =
  vtkDataSet.FieldAssociations.FIELD_ASSOCIATION_CELLS;
void association;

// @ts-expect-error the misspelled setter was replaced by setFormat
skybox.setFromat('box');
// @ts-expect-error the offset parameter getters are singular
mapper.getCoincidentTopologyPointOffsetParameters();
// @ts-expect-error macro.get lowercases the RGB/HSV prefixes
lookupTableProxy.getRGBPoints();
// @ts-expect-error macro.proxy keeps getProperties private
lookupTableProxy.getProperties();
