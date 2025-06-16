import macro from 'vtk.js/Sources/macros';
import vtkInteractorStyleTrackballCamera from 'vtk.js/Sources/Interaction/Style/InteractorStyleTrackballCamera';
import vtkInteractorStyleConstants from 'vtk.js/Sources/Rendering/Core/InteractorStyle/Constants';

const { States } = vtkInteractorStyleConstants;

function vtkInteractorStyleTrackballCameraStandard(publicAPI, model) {
  model.classHierarchy.push('vtkInteractorStyleTrackballCameraStandard');

  // Add right-click panning behavior (same as left-click + shift)
  publicAPI.handleRightButtonPress = (callData) => {
    const pos = callData.position;
    model.previousPosition = pos;
    publicAPI.startPan();
  };

  publicAPI.handleRightButtonRelease = () => {
    if (model.state === States.IS_PAN) {
      publicAPI.endPan();
    }
  };

  publicAPI.handleMiddleButtonPress = (callData) => {
    const pos = callData.position;
    model.previousPosition = pos;
    publicAPI.startDolly();
  };

  publicAPI.handleMiddleButtonRelease = () => {
    if (model.state === States.IS_DOLLY) {
      publicAPI.endDolly();
    }
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {};

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Inheritance - extend the base trackball camera style
  vtkInteractorStyleTrackballCamera.extend(publicAPI, model, initialValues);

  // Object specific methods
  vtkInteractorStyleTrackballCameraStandard(publicAPI, model);
}

export const newInstance = macro.newInstance(
  extend,
  'vtkInteractorStyleTrackballCameraStandard'
);

export default { newInstance, extend };
