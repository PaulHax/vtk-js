import '@kitware/vtk.js/favicon';

import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkInteractorStyleTrackballCameraStandard from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCameraStandard';

import controlPanel from './controller.html';

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  background: [0.2, 0.3, 0.4],
});
const renderWindow = fullScreenRenderer.getRenderWindow();
const renderer = fullScreenRenderer.getRenderer();
renderWindow.addRenderer(renderer);
const interactor = fullScreenRenderer.getInteractor();
const coneSource = vtkConeSource.newInstance({ height: 1.0 });

const mapper = vtkMapper.newInstance();
mapper.setInputConnection(coneSource.getOutputPort());

const actor = vtkActor.newInstance();
actor.setMapper(mapper);
renderer.addActor(actor);
renderer.resetCamera();
renderWindow.render();

// -----------------------------------------------------------
// Setup interactor style
// -----------------------------------------------------------
const trackballCamera = vtkInteractorStyleTrackballCameraStandard.newInstance();
interactor.setInteractorStyle(trackballCamera);

fullScreenRenderer.addController(controlPanel);

document.querySelector('#motionFactor').addEventListener('change', (e) => {
  const newMotionFactor = Number(e.target.value);
  trackballCamera.setMotionFactor(newMotionFactor);
  renderWindow.render();
});

document.querySelector('#zoomFactor').addEventListener('change', (e) => {
  const newZoomFactor = Number(e.target.value);
  trackballCamera.setZoomFactor(newZoomFactor);
  renderWindow.render();
});
