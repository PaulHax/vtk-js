import vtkBoundingBox from '../../Sources/Common/DataModel/BoundingBox';
import vtkDataArray from '../../Sources/Common/Core/DataArray';
import vtkPiecewiseFunction from '../../Sources/Common/DataModel/PiecewiseFunction';
import { convertItkToVtkImage } from '../../Sources/Common/DataModel/ITKHelper';
import vtkProxyManager from '../../Sources/Proxy/Core/ProxyManager';
import vtkLookupTableProxy, {
  RGBHSVPoint,
} from '../../Sources/Proxy/Core/LookupTableProxy';
import type { vtkGeometryRepresentationProxy } from '../../Sources/Proxy/Representations/GeometryRepresentationProxy';
import vtkDataSet from '../../Sources/Common/DataModel/DataSet';
import vtkMapper from '../../Sources/Rendering/Core/Mapper';
import vtkRenderer from '../../Sources/Rendering/Core/Renderer';
import vtkSkybox from '../../Sources/Rendering/Core/Skybox';
import vtkPlaneManipulator from '../../Sources/Widgets/Manipulators/PlaneManipulator';
import resliceCursorBehavior from '../../Sources/Widgets/Widgets3D/ResliceCursorWidget/behavior';
import { FieldAssociations } from '../../Sources/Common/DataModel/DataSet/Constants';
import type { ICoincidentTopology } from '../../Sources/Rendering/Core/Mapper/CoincidentTopologyHelper';
import type { Vector3 } from '../../Sources/types';
import vtkGlyph3DMapper from '../../Sources/Rendering/Core/Glyph3DMapper';
import vtkImageArrayMapper from '../../Sources/Rendering/Core/ImageArrayMapper';
import vtkViewNode from '../../Sources/Rendering/SceneGraph/ViewNode';
import { SlabTypes } from '../../Sources/Rendering/Core/ImageResliceMapper/Constants';
import type vtkImageData from '../../Sources/Common/DataModel/ImageData';
import type { vtkSubscription } from '../../Sources/interfaces';
import vtkLine from '../../Sources/Common/DataModel/Line';
import vtkCellTypes from '../../Sources/Common/DataModel/CellTypes';
import { CellType } from '../../Sources/Common/DataModel/CellTypes/Constants';
import ClassHierarchy from '../../Sources/Common/Core/ClassHierarchy';
import vtkAngleWidget from '../../Sources/Widgets/Widgets3D/AngleWidget';
import vtkSphereHandleRepresentation from '../../Sources/Widgets/Representations/SphereHandleRepresentation';
import vtkConcentricCylinderSource from '../../Sources/Filters/Sources/ConcentricCylinderSource';
import type vtkPolyData from '../../Sources/Common/DataModel/PolyData';

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

// --------------------------------------------------------------------------
// Member-surface regressions
// --------------------------------------------------------------------------

declare const renderer: vtkRenderer;
declare const skybox: vtkSkybox;
declare const mapper: vtkMapper;
declare const lookupTableProxy: vtkLookupTableProxy;
declare const geometryRepresentation: vtkGeometryRepresentationProxy;
declare const manipulator: vtkPlaneManipulator;

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
// Representation proxies decorate themselves with vtkProp.
type _RepresentationProxyIsAProp = Expect<
  Equal<ReturnType<typeof geometryRepresentation.getNestedPickable>, boolean>
>;
// The proxy manager is itself a proxy.
type _ProxyManagerIsAProxy = Expect<
  Equal<ReturnType<typeof proxyManager.getProxyId>, string>
>;
// Manipulator origins and normals are unset until a setter runs.
type _ManipulatorHandleOriginIsUnsetAtFirst = Expect<
  Equal<
    ReturnType<typeof manipulator.getHandleOriginByReference>,
    Vector3 | null | undefined
  >
>;
// The reslice cursor behavior module exports the decorator, not an instance.
type _ResliceCursorBehaviorIsADecorator = Expect<
  Equal<ReturnType<typeof resliceCursorBehavior>, void>
>;

// A bounding box instance owns its bounds; only the free functions take one.
const boundingBox = vtkBoundingBox.newInstance({});
const boundingBoxCenter: Vector3 = boundingBox.getCenter();
void boundingBoxCenter;
// @ts-expect-error instance methods do not repeat the bounds argument
boundingBox.getLength(boundingBox.getBounds(), 0);

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
// @ts-expect-error macro.proxy keeps listProxyProperties private
lookupTableProxy.listProxyProperties();

// Constants that index.js spreads onto the module default are reachable there.
const intersectionState: number = vtkLine.IntersectionState.ON_LINE;
void intersectionState;
const vertexCellType: number = CellType.VTK_VERTEX;
void vertexCellType;
// @ts-expect-error CellTypes does not spread its constants onto the default
vtkCellTypes.CellType;

// Widget representations are macro.algo nodes, so they carry the pipeline API.
const sphereHandle = vtkSphereHandleRepresentation.newInstance();
const sphereHandlePort = sphereHandle.getOutputPort();
void sphereHandlePort;
declare const sphereHandleInput: vtkImageData;
sphereHandle.setInputData(sphereHandleInput);

// A widget factory reports its own state type, not the base one.
const angleWidget = vtkAngleWidget.newInstance();
const angleHandles = angleWidget.getWidgetState().getHandleList();
void angleHandles;

// Sources with hand-written collection methods keep them alongside the macros.
const concentricCylinder = vtkConcentricCylinderSource.newInstance();
concentricCylinder.addRadius(1, 0);
type _ConcentricCylinderRadiusCount = Expect<
  Equal<ReturnType<typeof concentricCylinder.getNumberOfRadius>, number>
>;

// ClassHierarchy subclasses Array without redeclaring its statics.
const classHierarchy = new ClassHierarchy();
type _ClassHierarchyPushReturnsLength = Expect<
  Equal<ReturnType<typeof classHierarchy.push>, number>
>;
// @ts-expect-error the declaration carries no static members
ClassHierarchy.from([]);

// getOutputData narrows to the caller's type without a cast, and still falls
// back to any for the untyped call the rest of the API relies on.
const cylinderForOutput = vtkConcentricCylinderSource.newInstance();
type _TypedOutputData = Expect<
  Equal<
    ReturnType<typeof cylinderForOutput.getOutputData<vtkPolyData>>,
    vtkPolyData
  >
>;
const untypedOutput = cylinderForOutput.getOutputData();
const untypedOutputAsDataSet: vtkDataSet = untypedOutput;
void untypedOutputAsDataSet;
