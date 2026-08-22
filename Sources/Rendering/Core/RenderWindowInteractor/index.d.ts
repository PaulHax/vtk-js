import { vtkObject, vtkSubscription } from '../../../interfaces';
import { Nullable } from '../../../types';
import vtkAbstractPicker from '../AbstractPicker';
import vtkInteractorStyle from '../InteractorStyle';
import vtkRenderer from '../Renderer';
import { Axis, Device, Input, MouseButton } from './Constants';

declare enum handledEvents {
  'StartAnimation',
  'Animation',
  'EndAnimation',
  'MouseEnter',
  'MouseLeave',
  'StartMouseMove',
  'MouseMove',
  'EndMouseMove',
  'LeftButtonPress',
  'LeftButtonRelease',
  'MiddleButtonPress',
  'MiddleButtonRelease',
  'RightButtonPress',
  'RightButtonRelease',
  'KeyPress',
  'KeyDown',
  'KeyUp',
  'StartMouseWheel',
  'MouseWheel',
  'EndMouseWheel',
  'StartPinch',
  'Pinch',
  'EndPinch',
  'StartPan',
  'Pan',
  'EndPan',
  'Tap',
  'LongTap',
  'StartRotate',
  'Rotate',
  'EndRotate',
  'Button3D',
  'Move3D',
  'StartPointerLock',
  'EndPointerLock',
  'StartInteraction',
  'Interaction',
  'EndInteraction',
  'AnimationFrameRateUpdate',
}

/**
 *
 */
export interface IRenderWindowInteractorInitialValues {
  initialized?: boolean;
  enabled?: boolean;
  enableRender?: boolean;
  lightFollowCamera?: boolean;
  desiredUpdateRate?: number;
  stillUpdateRate?: number;
  recognizeGestures?: boolean;
  currentGesture?: string;
  lastFrameTime?: number;
  wheelTimeoutID?: number;
  moveTimeoutID?: number;
  preventDefaultOnPointerDown?: boolean;
  preventDefaultOnPointerUp?: boolean;
  mouseScrollDebounceByPass?: boolean;
  longTapDuration?: number;
  longTapDistance?: number;
  container?: HTMLElement;
  interactorStyle?: vtkInteractorStyle;
  longTapMaximumDistance?: number;
  picker?: vtkAbstractPicker;
}

export interface IPosition {
  type: string;
}

export type InteractorEventCallback = (e: IRenderWindowInteractorEvent) => void;

export type InteractorEventType =
  | 'StartInteractionEvent'
  | 'InteractionEvent'
  | 'EndInteractionEvent';

export interface IRenderWindowInteractorEvent {
  altKey: boolean;
  controlKey: boolean;
  firstRenderer: vtkRenderer;
  pokedRenderer: vtkRenderer;
  position: { x: number; y: number; z: number };
  shiftKey: boolean;
  type: InteractorEventType;
}

export interface I3DEvent {
  gamepad: Gamepad;
  position: DOMPointReadOnly;
  orientation: DOMPointReadOnly;
  targetPosition: DOMPointReadOnly;
  targetOrientation: DOMPointReadOnly;
  device: Device;
}

export interface IButton3DEvent extends I3DEvent {
  pressed: boolean;
  input: Input;
}

export interface vtkRenderWindowInteractor extends vtkObject {
  /**
   * Set the desired update rate.
   * @param desiredUpdateRate
   */
  setDesiredUpdateRate(desiredUpdateRate: number): boolean;

  /**
   * Set the desired update rate when movement has stopped.
   * @param stillUpdateRate
   */
  setStillUpdateRate(stillUpdateRate: number): boolean;

  /**
   * Start the event loop.
   * This is provided so that you do not have to implement your own event loop.
   * You still can use your own event loop if you want.
   */
  start(): void;

  /**
   *
   * @param args
   */
  startAnimationEvent(args: any): any;

  /**
   *
   * @param args
   */
  startInteractionEvent(args: any): any;

  /**
   *
   * @param args
   */
  startMouseMoveEvent(args: any): any;

  /**
   *
   * @param args
   */
  startMouseWheelEvent(args: any): any;

  /**
   *
   * @param args
   */
  startPanEvent(args: any): any;

  /**
   *
   * @param args
   */
  startPinchEvent(args: any): any;

  /**
   *
   * @param args
   */
  startPointerLockEvent(args: any): any;

  /**
   *
   * @param args
   */
  startRotateEvent(args: any): any;

  /**
   *
   * @param args
   */
  tapEvent(args: any): any;

  /**
   * Set/Get the rendering window being controlled by this object.
   * @param aren
   */
  setRenderWindow(aren: any): void;

  /**
   * External switching between joystick/trackball/new? modes.
   * @param style
   */
  setInteractorStyle(style: Nullable<vtkInteractorStyle>): void;

  /**
   *
   */
  getInteractorStyle(): Nullable<vtkInteractorStyle>;

  /**
   *
   */
  getContainer(): Nullable<HTMLElement>;

  /**
   *
   * @param container
   */
  setContainer(container: Nullable<HTMLElement>): boolean;

  /**
   *
   */
  getPicker(): Nullable<vtkAbstractPicker>;

  /**
   *
   * @param picker
   */
  setPicker(picker: Nullable<vtkAbstractPicker>): boolean;

  /**
   *
   */
  getLongTapMaximumDistance(): number;

  /**
   *
   * @param longTapMaximumDistance
   */
  setLongTapMaximumDistance(longTapMaximumDistance: number): boolean;

  /**
   * ---------------------------------------------------------------------
   */
  initialize(): void;

  /**
   * Enable/Disable interactions.
   * By default interactors are enabled when initialized.
   * Initialize() must be called prior to enabling/disabling interaction.
   * These methods are used when a window/widget is being shared by multiple renderers and interactors.
   * This allows a "modal" display where one interactor is active when its data is to be displayed and all other interactors associated with the widget are disabled when their data is not displayed.
   */
  enable(): void;

  /**
   *
   */
  disable(): void;

  /**
   *
   */
  startEventLoop(): void;

  /**
   *
   */
  getCurrentRenderer(): Nullable<vtkRenderer>;

  /**
   * Manually sets the current renderer.
   * @param {vtkRenderer} ren
   */
  setCurrentRenderer(ren: vtkRenderer): void;

  /**
   *
   * @param container kept for backward compatibility.
   * @deprecated please use vtkRenderWindowInteractor.setContainer(container: HTMLElement)
   *     which will also bind events.
   */
  bindEvents(container: any): void;

  /**
   *
   * @deprecated please use vtkRenderWindowInteractor.setContainer(null) instead.
   */
  unbindEvents(): void;

  /**
   *
   * @param {KeyboardEvent} event
   */
  handleKeyPress(event: KeyboardEvent): void;

  /**
   *
   * @param {KeyboardEvent} event
   */
  handleKeyDown(event: KeyboardEvent): void;

  /**
   *
   * @param {KeyboardEvent} event
   */
  handleKeyUp(event: KeyboardEvent): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handlePointerDown(event: PointerEvent): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handlePointerUp(event: PointerEvent): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handlePointerCancel(event: PointerEvent): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handlePointerMove(event: PointerEvent): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handleMouseDown(event: PointerEvent): void;

  /**
   *
   */
  requestPointerLock(): Promise<void> | undefined;

  /**
   *
   */
  exitPointerLock(): void;

  /**
   *
   */
  isPointerLocked(): boolean;

  /**
   *
   */
  handlePointerLockChange(): void;

  /**
   *
   * @param requestor
   */
  requestAnimation(requestor: any): void;

  /**
   *
   */
  isAnimating(): boolean;

  /**
   *
   * @param requestor
   * @param {Boolean} [skipWarning]
   */
  cancelAnimation(requestor: any, skipWarning?: boolean): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handleMouseMove(event: PointerEvent): void;

  /**
   *
   */
  handleAnimation(): void;

  /**
   *
   * @param {MouseEvent} event
   */
  handleWheel(event: MouseEvent): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handlePointerEnter(event: PointerEvent): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handlePointerLeave(event: PointerEvent): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handleMouseUp(event: PointerEvent): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handleTouchStart(event: PointerEvent): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handleTouchMove(event: PointerEvent): void;

  /**
   *
   * @param {PointerEvent} event
   */
  handleTouchEnd(event: PointerEvent): void;

  /**
   *
   * @param val
   */
  setView(val: any): void;

  /**
   * @return first renderer to be used for camera manipulation
   */
  getFirstRenderer(): vtkRenderer;

  /**
   *
   * @param {Number} x
   * @param {Number} y
   */
  findPokedRenderer(x?: number, y?: number): Nullable<vtkRenderer>;

  /**
   * only render if we are not animating. If we are animating
   * then renders will happen naturally anyhow and we definitely
   * do not want extra renders as the make the apparent interaction
   * rate slower.
   */
  render(): void;

  /**
   * we know we are in multitouch now, so start recognizing
   * @param event
   * @param positions
   */
  recognizeGesture(
    event: 'TouchStart' | 'TouchMove' | 'TouchEnd',
    positions: IPosition
  ): void;

  /**
   *
   */
  handleVisibilityChange(): void;

  /**
   * Stop animating if the renderWindowInteractor is deleted.
   */
  delete(): void;
}

/**
 * Method use to decorate a given object (publicAPI+model) with vtkRenderWindowInteractor characteristics.
 *
 * @param publicAPI object on which methods will be bounds (public)
 * @param model object on which data structure will be bounds (protected)
 * @param {IRenderWindowInteractorInitialValues} [initialValues] (default: {})
 */
export function extend(
  publicAPI: object,
  model: object,
  initialValues?: IRenderWindowInteractorInitialValues
): void;

/**
 * Method use to create a new instance of vtkRenderWindowInteractor
 */
export function newInstance(
  initialValues?: IRenderWindowInteractorInitialValues
): vtkRenderWindowInteractor;

/**
 * vtkRenderWindowInteractor provides an interaction mechanism for
 * mouse/key/time events. It handles routing of mouse/key/timer messages to
 * vtkInteractorObserver and its subclasses. vtkRenderWindowInteractor also
 * provides controls for picking, rendering frame rate.
 *
 * vtkRenderWindowInteractor serves to hold user preferences and route messages
 * to vtkInteractorStyle. Callbacks are available for many events. Platform
 * specific subclasses should provide methods for manipulating timers,
 * TerminateApp, and an event loop if required via
 *
 * Initialize/Start/Enable/Disable.
 *
 * ## Caveats
 *
 * vtkRenderWindowInteractor routes events through VTK’s command/observer design
 * pattern. That is, when vtkRenderWindowInteractor (actually, one of its
 * subclasses) sees an event, it translates it into a VTK event using the
 * InvokeEvent() method. Afterward, any vtkInteractorObservers registered for
 * that event are expected to respond appropriately.
 */
export declare const vtkRenderWindowInteractor: {
  newInstance: typeof newInstance;
  extend: typeof extend;
  handledEvents: typeof handledEvents;
  Device: typeof Device;
  Input: typeof Input;
  Axis: typeof Axis;
  MouseButton: typeof MouseButton;
};
export default vtkRenderWindowInteractor;
