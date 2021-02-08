import macro from 'vtk.js/Sources/macro';
import vtkBoundingBox from 'vtk.js/Sources/Common/DataModel/BoundingBox';
import vtkLine from 'vtk.js/Sources/Common/DataModel/Line';
import vtkPlaneManipulator from 'vtk.js/Sources/Widgets/Manipulators/PlaneManipulator';
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math';

import {
  boundPointOnPlane,
  getAssociatedLinesName,
  updateState,
  rotateVector,
} from 'vtk.js/Sources/Widgets/Widgets3D/ResliceCursorWidget/helpers';

import {
  ScrollingMethods,
  InteractionMethodsName,
} from 'vtk.js/Sources/Widgets/Widgets3D/ResliceCursorWidget/Constants';

export default function widgetBehavior(publicAPI, model) {
  let isDragging = null;
  let isScrolling = false;

  // Reset "updateMethodName" attribute when no actors are selected
  // Useful to update 'updateMethodeName' to the correct name which
  // will be TranslateCenter by default
  publicAPI.resetUpdateMethod = () => {
    if (model.representations.length !== 0) {
      model.representations[0].getSelectedState();
    }
  };

  publicAPI.startScrolling = (newPosition) => {
    if (newPosition) {
      model.previousPosition = newPosition;
    }
    isScrolling = true;
    publicAPI.resetUpdateMethod();
    publicAPI.startInteraction();
  };

  publicAPI.endScrolling = () => {
    isScrolling = false;
    publicAPI.endInteraction();
  };

  publicAPI.updateCursor = () => {
    switch (model.activeState.getUpdateMethodName()) {
      case InteractionMethodsName.TranslateCenter:
        model.openGLRenderWindow.setCursor('move');
        break;
      case InteractionMethodsName.RotateLine:
        model.openGLRenderWindow.setCursor('alias');
        break;
      case InteractionMethodsName.TranslateAxis:
        model.openGLRenderWindow.setCursor('pointer');
        break;
      default:
        model.openGLRenderWindow.setCursor('default');
        break;
    }
  };

  publicAPI.handleLeftButtonPress = (callData) => {
    if (model.activeState && model.activeState.getActive()) {
      isDragging = true;
      const viewName = model.widgetState.getActiveViewName();
      const currentPlaneNormal = model.widgetState[
        `get${viewName}PlaneNormal`
      ]();
      model.planeManipulator.setOrigin(model.widgetState.getCenter());
      model.planeManipulator.setNormal(currentPlaneNormal);

      publicAPI.startInteraction();
    } else if (
      model.widgetState.getScrollingMethod() ===
      ScrollingMethods.LEFT_MOUSE_BUTTON
    ) {
      publicAPI.startScrolling(callData.position);
    } else {
      return macro.VOID;
    }

    return macro.EVENT_ABORT;
  };

  publicAPI.handleMouseMove = (callData) => {
    if (isDragging && model.pickable) {
      return publicAPI.handleEvent(callData);
    }
    if (isScrolling) {
      if (model.previousPosition.y !== callData.position.y) {
        const step = model.previousPosition.y - callData.position.y;
        publicAPI.translateCenterOnCurrentDirection(
          step,
          callData.pokedRenderer
        );
        model.previousPosition = callData.position;

        publicAPI.invokeInternalInteractionEvent();
      }
    }
    return macro.VOID;
  };

  publicAPI.handleLeftButtonRelease = () => {
    if (isDragging || isScrolling) {
      publicAPI.endScrolling();
    }
    isDragging = false;
    model.widgetState.deactivate();
  };

  publicAPI.handleRightButtonPress = (calldata) => {
    if (
      model.widgetState.getScrollingMethod() ===
      ScrollingMethods.RIGHT_MOUSE_BUTTON
    ) {
      publicAPI.startScrolling(calldata.position);
    }
  };

  publicAPI.handleRightButtonRelease = (calldata) => {
    if (
      model.widgetState.getScrollingMethod() ===
      ScrollingMethods.RIGHT_MOUSE_BUTTON
    ) {
      publicAPI.endScrolling();
    }
  };

  publicAPI.handleStartMouseWheel = (callData) => {
    publicAPI.resetUpdateMethod();
    publicAPI.startInteraction();
  };

  publicAPI.handleMouseWheel = (calldata) => {
    const step = calldata.spinY;
    isScrolling = true;
    publicAPI.translateCenterOnCurrentDirection(step, calldata.pokedRenderer);

    publicAPI.invokeInternalInteractionEvent();
    isScrolling = false;

    return macro.EVENT_ABORT;
  };

  publicAPI.handleEndMouseWheel = (calldata) => {
    publicAPI.endScrolling();
  };

  publicAPI.handleMiddleButtonPress = (calldata) => {
    if (
      model.widgetState.getScrollingMethod() ===
      ScrollingMethods.MIDDLE_MOUSE_BUTTON
    ) {
      publicAPI.startScrolling(calldata.position);
    }
  };

  publicAPI.handleMiddleButtonRelease = (calldata) => {
    if (
      model.widgetState.getScrollingMethod() ===
      ScrollingMethods.MIDDLE_MOUSE_BUTTON
    ) {
      publicAPI.endScrolling();
    }
  };

  publicAPI.handleEvent = (callData) => {
    if (model.activeState.getActive()) {
      publicAPI[model.activeState.getUpdateMethodName()](callData);
      publicAPI.invokeInternalInteractionEvent();
      return macro.EVENT_ABORT;
    }
    return macro.VOID;
  };

  publicAPI.invokeInternalInteractionEvent = () => {
    const methodName = model.activeState
      ? model.activeState.getUpdateMethodName()
      : '';
    const computeFocalPointOffset =
      methodName !== InteractionMethodsName.RotateLine;
    const canUpdateFocalPoint =
      methodName === InteractionMethodsName.RotateLine;
    publicAPI.invokeInteractionEvent({
      computeFocalPointOffset,
      canUpdateFocalPoint,
    });
  };

  publicAPI.startInteraction = () => {
    publicAPI.invokeStartInteractionEvent();
    // When interacting, plane actor and lines must be re-rendered on other views
    publicAPI.getViewWidgets().forEach((viewWidget) => {
      viewWidget.getInteractor().requestAnimation(publicAPI);
    });
  };

  publicAPI.endInteraction = () => {
    publicAPI.invokeEndInteractionEvent();
    publicAPI.getViewWidgets().forEach((viewWidget) => {
      viewWidget.getInteractor().cancelAnimation(publicAPI);
    });
  };

  publicAPI.translateCenterOnCurrentDirection = (nbSteps, renderer) => {
    const dirProj = renderer
      .getRenderWindow()
      .getRenderers()[0]
      .getActiveCamera()
      .getDirectionOfProjection();

    // Direction of the projection is the inverse of what we want
    const direction = vtkMath.multiplyScalar(dirProj, -1);

    const oldCenter = model.widgetState.getCenter();
    const image = model.widgetState.getImage();
    const imageSpacing = image.getSpacing();

    // Use Chebyshev norm
    // https://math.stackexchange.com/questions/71423/what-is-the-term-for-the-projection-of-a-vector-onto-the-unit-cube
    const absDirProj = dirProj.map((value) => Math.abs(value));
    const index = absDirProj.indexOf(Math.max(...absDirProj));
    const movingFactor = nbSteps * (imageSpacing[index] / dirProj[index]);

    // Define the potentially new center
    let newCenter = [
      oldCenter[0] + movingFactor * direction[0],
      oldCenter[1] + movingFactor * direction[1],
      oldCenter[2] + movingFactor * direction[2],
    ];
    newCenter = publicAPI.getBoundedCenter(newCenter);

    model.widgetState.setCenter(newCenter);
    updateState(model.widgetState);
  };

  publicAPI[InteractionMethodsName.TranslateAxis] = (calldata) => {
    const stateLine = model.widgetState.getActiveLineState();
    const worldCoords = model.planeManipulator.handleEvent(
      calldata,
      model.openGLRenderWindow
    );

    const point1 = stateLine.getPoint1();
    const point2 = stateLine.getPoint2();

    // Translate the current line along the other line
    const otherLineName = getAssociatedLinesName(stateLine.getName());
    const otherLine = model.widgetState[`get${otherLineName}`]();
    const otherLineVector = vtkMath.subtract(
      otherLine.getPoint2(),
      otherLine.getPoint1(),
      []
    );
    vtkMath.normalize(otherLineVector);
    const axisTranslation = otherLineVector;

    const currentLineVector = vtkMath.subtract(point2, point1, [0, 0, 0]);
    vtkMath.normalize(currentLineVector);

    const dot = vtkMath.dot(currentLineVector, otherLineVector);
    // lines are colinear, translate along perpendicular axis from current line
    if (dot === 1 || dot === -1) {
      vtkMath.cross(
        currentLineVector,
        model.planeManipulator.getNormal(),
        axisTranslation
      );
    }

    const closestPoint = [];
    vtkLine.distanceToLine(worldCoords, point1, point2, closestPoint);

    const translationVector = vtkMath.subtract(worldCoords, closestPoint, []);
    const translationDistance = vtkMath.dot(translationVector, axisTranslation);

    const center = model.widgetState.getCenter();
    let newOrigin = vtkMath.multiplyAccumulate(
      center,
      axisTranslation,
      translationDistance,
      [0, 0, 0]
    );
    newOrigin = publicAPI.getBoundedCenter(newOrigin);
    model.widgetState.setCenter(newOrigin);
    updateState(model.widgetState);
  };

  publicAPI.getBoundedCenter = (newCenter) => {
    const oldCenter = model.widgetState.getCenter();
    const imageBounds = model.widgetState.getImage().getBounds();
    const bounds = vtkBoundingBox.newInstance({ bounds: imageBounds });

    if (bounds.containsPoint(...newCenter)) {
      return newCenter;
    }

    return boundPointOnPlane(newCenter, oldCenter, imageBounds);
  };

  publicAPI[InteractionMethodsName.TranslateCenter] = (calldata) => {
    let worldCoords = model.planeManipulator.handleEvent(
      calldata,
      model.openGLRenderWindow
    );
    worldCoords = publicAPI.getBoundedCenter(worldCoords);
    model.activeState.setCenter(worldCoords);
    updateState(model.widgetState);
  };

  publicAPI[InteractionMethodsName.RotateLine] = (calldata) => {
    const activeLine = model.widgetState.getActiveLineState();
    const planeNormal = model.planeManipulator.getNormal();
    const worldCoords = model.planeManipulator.handleEvent(
      calldata,
      model.openGLRenderWindow
    );

    const center = model.widgetState.getCenter();
    const previousWorldPosition = activeLine[
      `get${model.widgetState.getActiveRotationPointName()}`
    ]();

    const previousVectorToOrigin = [0, 0, 0];
    vtkMath.subtract(previousWorldPosition, center, previousVectorToOrigin);
    vtkMath.normalize(previousVectorToOrigin);

    const currentVectorToOrigin = [0, 0, 0];
    vtkMath.subtract(worldCoords, center, currentVectorToOrigin);
    vtkMath.normalize(currentVectorToOrigin);

    const rotationAngle = vtkMath.angleBetweenVectors(
      previousVectorToOrigin,
      currentVectorToOrigin
    );

    // Define the direction of the rotation
    const cross = [0, 0, 0];
    vtkMath.cross(currentVectorToOrigin, previousVectorToOrigin, cross);
    vtkMath.normalize(cross);

    const sign = vtkMath.dot(cross, planeNormal) > 0 ? -1 : 1;
    const radianAngle = rotationAngle * sign;

    // Rotate associated line's plane normal
    const planeName = activeLine.getPlaneName();
    const normal = model.widgetState[`get${planeName}PlaneNormal`]();
    const newNormal = rotateVector(normal, planeNormal, radianAngle);

    model.widgetState[`set${planeName}PlaneNormal`](newNormal);

    if (model.widgetState.getKeepOrthogonality()) {
      const associatedLineName = getAssociatedLinesName(activeLine.getName());
      const associatedLine = model.widgetState[`get${associatedLineName}`]();
      const associatedPlaneName = associatedLine.getPlaneName();
      const associatedNormal = model.widgetState[
        `get${associatedPlaneName}PlaneNormal`
      ]();

      const newAssociatedNormal = rotateVector(
        associatedNormal,
        planeNormal,
        radianAngle
      );

      model.widgetState[`set${associatedPlaneName}PlaneNormal`](
        newAssociatedNormal
      );
    }
    updateState(model.widgetState);
  };

  // --------------------------------------------------------------------------
  // initialization
  // --------------------------------------------------------------------------

  model.planeManipulator = vtkPlaneManipulator.newInstance();
}
