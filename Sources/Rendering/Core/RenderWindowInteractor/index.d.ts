import { VtkObject } from "vtk.js/Sources/macro";

export enum Device {
    Unknown,
    LeftController,
    RightController,
};

export enum Input {
    Unknown,
    Trigger,
    TrackPad,
    Grip,
    ApplicationMenu,
};

export type IRenderWindowInteractorInitialValues = {
    /**
     * 
     */
    initialized: boolean;

    /**
     * 
     */
    enabled: boolean;

    /**
     * 
     */
    enableRender: boolean;

    /**
     * 
     */
    lightFollowCamera: boolean;

    /**
     * 
     */
    desiredUpdateRate: number;

    /**
     * 
     */
    stillUpdateRate: number;

    /**
     * 
     */
    recognizeGestures: boolean;

    /**
     * 
     */
    currentGesture: string;

    /**
     * 
     */
    lastFrameTime: number;

    /**
     * 
     */
    wheelTimeoutID: number;

    /**
     * 
     */
    moveTimeoutID: number;
}

interface IPosition {

    /**
     * 
     */
    type: string;
}

export interface vtkRenderWindowInteractor extends VtkObject {

    /**
 *
 * @default false
 */

    getInitialized(): boolean;
    /**
     *
     * @default null
     */

    getContainer(): any
    /**
     *
     * @default false
     */

    getEnabled(): boolean;
    /**
     *
     * @default true
     */

    getEnableRender(): boolean;
    /**
     *
     * @default null
     */

    getInteractorStyle(): any
    /**
     *
     * @default 0.1
     */

    getLastFrameTime(): number
    /**
     *
     * @default null
     */

    getView(): any;

    /**
     * 
     * @default true 
     */
    getLightFollowCamera(): boolean;

    /**
     * 
     */
    getPicker(): any;

    /**
     * 
     * @default true
     */
    getRecognizeGestures(): boolean;
    /**
     * 
     * @default 30.0
     */
    getDesiredUpdateRate(): number;

    /**
     * 
     * @default 2.0
     */
    getStillUpdateRate(): number;

    /**
     *
     */
    invokeStartAnimation(callData: any): any;

    /**
     *
     */
    invokeAnimation(callData: any): any;

    /**
     *
     */
    invokeEndAnimation(callData: any): any;

    /**
     *
     */
    invokeMouseEnter(callData: any): any;

    /**
     *
     */
    invokeMouseLeave(callData: any): any;

    /**
     *
     */
    invokeStartMouseMove(callData: any): any;

    /**
     *
     */
    invokeMouseMove(callData: any): any;

    /**
     *
     */
    invokeEndMouseMove(callData: any): any;

    /**
     *
     */
    invokeLeftButtonPress(callData: any): any;

    /**
     *
     */
    invokeLeftButtonRelease(callData: any): any;

    /**
     *
     */
    invokeMiddleButtonPress(callData: any): any;

    /**
     *
     */
    invokeMiddleButtonRelease(callData: any): any;

    /**
     *
     */
    invokeRightButtonPress(callData: any): any;

    /**
     *
     */
    invokeRightButtonRelease(callData: any): any;

    /**
     *
     */
    invokeKeyPress(callData: any): any;

    /**
     *
     */
    invokeKeyDown(callData: any): any;

    /**
     *
     */
    invokeKeyUp(callData: any): any;

    /**
     *
     */
    invokeStartMouseWheel(callData: any): any;

    /**
     *
     */
    invokeMouseWheel(callData: any): any;

    /**
     *
     */
    invokeEndMouseWheel(callData: any): any;

    /**
     *
     */
    invokeStartPinch(callData: any): any;

    /**
     *
     */
    invokePinch(callData: any): any;

    /**
     *
     */
    invokeEndPinch(callData: any): any;

    /**
     *
     */
    invokeStartPan(callData: any): any;

    /**
     *
     */
    invokePan(callData: any): any;

    /**
     *
     */
    invokeEndPan(callData: any): any;

    /**
     *
     */
    invokeStartRotate(callData: any): any;

    /**
     *
     */
    invokeRotate(callData: any): any;

    /**
     *
     */
    invokeEndRotate(callData: any): any;

    /**
     *
     */
    invokeButton3D(callData: any): any;

    /**
     *
     */
    invokeMove3D(callData: any): any;

    /**
     *
     */
    invokeStartPointerLock(callData: any): any;

    /**
     *
     */
    invokeEndPointerLock(callData: any): any;

    /**
     *
     */
    invokeStartInteractionEvent(callData: any): any;

    /**
     *
     */
    invokeInteractionEvent(callData: any): any;

    /**
     *
     */
    invokeEndInteractionEvent(callData: any): any;

    /**
     *
     * @param args 
     */
    onStartAnimation(args: any): any;

    /**
     *
     * @param args 
     */
    onAnimation(args: any): any;

    /**
     *
     * @param args 
     */
    onEndAnimation(args: any): any;

    /**
     *
     * @param args 
     */
    onMouseEnter(args: any): any;

    /**
     *
     * @param args 
     */
    onMouseLeave(args: any): any;

    /**
     *
     * @param args 
     */
    onStartMouseMove(args: any): any;

    /**
     *
     * @param args 
     */
    onMouseMove(args: any): any;

    /**
     *
     * @param args 
     */
    onEndMouseMove(args: any): any;

    /**
     *
     * @param args 
     */
    onLeftButtonPress(args: any): any;

    /**
     *
     * @param args 
     */
    onLeftButtonRelease(args: any): any;

    /**
     *
     * @param args 
     */
    onMiddleButtonPress(args: any): any;

    /**
     *
     * @param args 
     */
    onMiddleButtonRelease(args: any): any;

    /**
     *
     * @param args 
     */
    onRightButtonPress(args: any): any;

    /**
     *
     * @param args 
     */
    onRightButtonRelease(args: any): any;

    /**
     *
     * @param args 
     */
    onKeyPress(args: any): any;

    /**
     *
     * @param args 
     */
    onKeyDown(args: any): any;

    /**
     *
     * @param args 
     */
    onKeyUp(args: any): any;

    /**
     *
     * @param args 
     */
    onStartMouseWheel(args: any): any;

    /**
     *
     * @param args 
     */
    onMouseWheel(args: any): any;

    /**
     *
     * @param args 
     */
    onEndMouseWheel(args: any): any;

    /**
     *
     * @param args 
     */
    onStartPinch(args: any): any;

    /**
     *
     * @param args 
     */
    onPinch(args: any): any;

    /**
     *
     * @param args 
     */
    onEndPinch(args: any): any;

    /**
     *
     * @param args 
     */
    onStartPan(args: any): any;

    /**
     *
     * @param args 
     */
    onPan(args: any): any;

    /**
     *
     * @param args 
     */
    onEndPan(args: any): any;

    /**
     *
     * @param args 
     */
    onStartRotate(args: any): any;

    /**
     *
     * @param args 
     */
    onRotate(args: any): any;

    /**
     *
     * @param args 
     */
    onEndRotate(args: any): any;

    /**
     *
     * @param args 
     */
    onButton3D(args: any): any;

    /**
     *
     * @param args 
     */
    onMove3D(args: any): any;

    /**
     *
     * @param args 
     */
    onStartPointerLock(args: any): any;

    /**
     *
     * @param args 
     */
    onEndPointerLock(args: any): any;

    /**
     *
     * @param args 
     */
    onStartInteractionEvent(args: any): any;

    /**
     *
     * @param args 
     */
    onInteractionEvent(args: any): any;

    /**
     *
     * @param args 
     */
    onEndInteractionEvent(args: any): any;

    /**
     *
     * @param args 
     */
    animationEvent(args: any): any;

    /**
     *
     * @param args 
     */
    button3DEvent(args: any): any;

    /**
     *
     * @param args 
     */
    endAnimationEvent(args: any): any;

    /**
     *
     * @param args 
     */
    endInteractionEventEvent(args: any): any;

    /**
     *
     * @param args 
     */
    endMouseMoveEvent(args: any): any;

    /**
     *
     * @param args 
     */
    endMouseWheelEvent(args: any): any;

    /**
     *
     * @param args 
     */
    endPanEvent(args: any): any;

    /**
     *
     * @param args 
     */
    endPinchEvent(args: any): any;

    /**
     *
     * @param args 
     */
    endPointerLockEvent(args: any): any;

    /**
     *
     * @param args 
     */
    endRotateEvent(args: any): any;

    /**
     *
     * @param args 
     */
    interactionEventEvent(args: any): any;

    /**
     *
     * @param args 
     */
    keyDownEvent(args: any): any;

    /**
     *
     * @param args 
     */
    keyPressEvent(args: any): any;

    /**
     *
     * @param args 
     */
    keyUpEvent(args: any): any;

    /**
     *
     * @param args 
     */
    leftButtonPressEvent(args: any): any;

    /**
     *
     * @param args 
     */
    leftButtonReleaseEvent(args: any): any;

    /**
     *
     * @param args 
     */
    middleButtonPressEvent(args: any): any;

    /**
     *
     * @param args 
     */
    middleButtonReleaseEvent(args: any): any;

    /**
     *
     * @param args 
     */
    mouseEnterEvent(args: any): any;

    /**
     *
     * @param args 
     */
    mouseLeaveEvent(args: any): any;

    /**
     *
     * @param args 
     */
    mouseMoveEvent(args: any): any;

    /**
     *
     * @param args 
     */
    mouseWheelEvent(args: any): any;

    /**
     *
     * @param args 
     */
    move3DEvent(args: any): any;

    /**
     *
     * @param args 
     */
    panEvent(args: any): any;

    /**
     *
     * @param args 
     */
    pinchEvent(args: any): any;

    /**
     *
     * @param args 
     */
    rightButtonPressEvent(args: any): any;

    /**
     *
     * @param args 
     */
    rightButtonReleaseEvent(args: any): any;

    /**
     *
     * @param args 
     */
    rotateEvent(args: any): any;

    /**
     * Turn on/off the automatic repositioning of lights as the camera moves.
     * @param lightFollowCamera 
     */
    setLightFollowCamera(lightFollowCamera: boolean): boolean;

    /**
     * Set the object used to perform pick operations.
     * @param picker 
     */
    setPicker(picker: any): boolean;

    /**
     * 
     * @param recognizeGestures 
     */
    setRecognizeGestures(recognizeGestures: boolean): boolean;

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
    startInteractionEventEvent(args: any): any;


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
     * Set/Get the rendering window being controlled by this object.
     * @param aren 
     */
    setRenderWindow(aren: any): void;

    /**
     * External switching between joystick/trackball/new? modes.
     * @param style 
     */
    setInteractorStyle(style: any): void;

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
    getCurrentRenderer(): void;

    /**
     * 
     * @param container 
     */
    bindEvents(container: any): void;

    /**
     * 
     */
    unbindEvents(): void;

    /**
     * 
     * @param event 
     */
    handleKeyPress(event: any): void;

    /**
     * 
     * @param event 
     */
    handleKeyDown(event: any): void;

    /**
     * 
     * @param event 
     */
    handleKeyUp(event: any): void;

    /**
     * 
     * @param event 
     */
    handleMouseDown(event: any): void;

    /**
     * 
     */
    requestPointerLock(): void;

    /**
     * 
     */
    exitPointerLock(): void;

    /**
     * 
     * @return  
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
     * @return  
     */
    isAnimating(): boolean;

    /**
     * 
     * @param requestor 
     * @param skipWarning 
     */
    cancelAnimation(requestor: any, skipWarning: any): void;

    /**
     * 
     */
    switchToVRAnimation(): void;

    /**
     * 
     */
    returnFromVRAnimation(): void;

    /**
     * 
     * @param displayId 
     */
    updateGamepads(displayId: any): void;

    /**
     * 
     * @param event 
     */
    handleMouseMove(event: any): void;

    /**
     * 
     */
    handleAnimation(): void;

    /**
     * 
     * @param event 
     */
    handleWheel(event: any): void;

    /**
     * 
     * @param event 
     */
    handleMouseEnter(event: any): void;

    /**
     * 
     * @param event 
     */
    handleMouseLeave(event: any): void;

    /**
     * 
     * @param event 
     */
    handleMouseUp(event: any): void;

    /**
     * 
     * @param event 
     */
    handleTouchStart(event: any): void;

    /**
     * 
     * @param event 
     */
    handleTouchMove(event: any): void;

    /**
     * 
     * @param event 
     */
    handleTouchEnd(event: any): void;

    /**
     * 
     * @param val 
     */
    setView(val: any): void;

    /**
     * 
     * @param x 
     * @param y 
     */
    findPokedRenderer(x: number, y: number): void;

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
    recognizeGesture(event: string, positions: IPosition): void;

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
 * @param initialValues (default: {})
 */
export function extend(publicAPI: object, model: object, initialValues?: IRenderWindowInteractorInitialValues): void;

/**
 * Method use to create a new instance of vtkRenderWindowInteractor 
 */
export function newInstance(initialValues?: IRenderWindowInteractorInitialValues): vtkRenderWindowInteractor;

/** 
 * vtkRenderWindow is an abstract object to specify the behavior of a rendering window. 
 * A rendering window is a window in a graphical user interface where renderers draw their images. 
 * Methods are provided to synchronize the rendering process, set window size, and control double buffering. 
 * The window also allows rendering in stereo. The interlaced render stereo type is for output to a VRex stereo projector.
 * All of the odd horizontal lines are from the left eye, and the even lines are from the right eye. 
 * The user has to make the render window aligned with the VRex projector, or the eye will be swapped.
 * 
 * @see vtkActor
 * @see vtkCoordinate
 * @see vtkProp
 * @see vtkRenderer
 * @see vtkRenderWindow
 * @see vtkVolume
 */
export declare const vtkRenderWindowInteractor: {
    newInstance: typeof newInstance,
    extend: typeof extend,
};
export default vtkRenderWindowInteractor;
