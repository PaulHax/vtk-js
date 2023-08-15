import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Profiles/Glyph';

import { throttle } from '@kitware/vtk.js/macros';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPolyLineWidget from '@kitware/vtk.js/Widgets/Widgets3D/PolyLineWidget';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';
import vtkInteractorObserver from '@kitware/vtk.js/Rendering/Core/InteractorObserver';

import { bindSVGRepresentation } from 'vtk.js/Examples/Widgets/Utilities/SVGHelpers';

import { FieldAssociations } from '@kitware/vtk.js/Common/DataModel/DataSet/Constants';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';

import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';

import controlPanel from './controlPanel.html';

const { computeWorldToDisplay } = vtkInteractorObserver;

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  background: [0, 0, 0],
});
const renderer = fullScreenRenderer.getRenderer();

const cone = vtkConeSource.newInstance();
const mapper = vtkMapper.newInstance();
const actor = vtkActor.newInstance();

actor.setMapper(mapper);
mapper.setInputConnection(cone.getOutputPort());
actor.getProperty().setOpacity(0.5);

// renderer.addActor(actor);

// ----------------------------------------------------------------------------
// Widget manager
// ----------------------------------------------------------------------------

const widgetManager = vtkWidgetManager.newInstance();
widgetManager.setRenderer(renderer);

const widget = vtkPolyLineWidget.newInstance({ lineThickness: 20 });
widget.placeWidget(cone.getOutputData().getBounds());

const widgetInstance = widgetManager.addWidget(widget);
widgetInstance.setClosePolyLine(true);
widgetInstance.setLineThickness(20);

const picker = vtkCellPicker.newInstance();
picker.setPickFromList(1);
picker.setTolerance(0);
picker.initializePickList();

const polylineActor = widgetInstance.getRepresentations()[1].getActors()[0];
picker.addPickList(polylineActor);

renderer.resetCamera();
widgetManager.enablePicking();
widgetManager.grabFocus(widget);

bindSVGRepresentation(renderer, widget.getWidgetState(), {
  mapState(widgetState, { size }) {
    const states = widgetState.getStatesWithLabel('handles') || [];
    return states
      .filter((state) => state.getVisible() && state.getOrigin())
      .map((state) => {
        const coords = computeWorldToDisplay(renderer, ...state.getOrigin());
        return [coords[0], size[1] - coords[1]];
      });
  },
  render(data, h) {
    return data.map(([x, y], index) =>
      h(
        'text',
        {
          key: index,
          attrs: {
            x,
            y,
            dx: 12,
            dy: -12,
            fill: 'white',
            'font-size': 32,
          },
        },
        `L${index}`
      )
    );
  },
});

const renderWindow = renderer.getRenderWindow();
const interactor = renderWindow.getInteractor();
const apiSpecificRenderWindow = interactor.getView();
const hardwareSelector = apiSpecificRenderWindow.getSelector();
hardwareSelector.setCaptureZValues(true);
// TODO: bug in FIELD_ASSOCIATION_POINTS mode
// hardwareSelector.setFieldAssociation(
//   FieldAssociations.FIELD_ASSOCIATION_POINTS
// );
hardwareSelector.setFieldAssociation(FieldAssociations.FIELD_ASSOCIATION_CELLS);

// ----------------------------------------------------------------------------
// Create Mouse listener for picking on mouse move
// ----------------------------------------------------------------------------

function eventToWindowXY(event) {
  // We know we are full screen => window.innerXXX
  // Otherwise we can use pixel device ratio or else...
  const { clientX, clientY } = event;
  const [width, height] = apiSpecificRenderWindow.getSize();
  const x = Math.round((width * clientX) / window.innerWidth);
  const y = Math.round(height * (1 - clientY / window.innerHeight)); // Need to flip Y
  return [x, y];
}

function processSelections(selections) {
  if (!selections || selections.length === 0) {
    return;
  }
  const {
    // worldPosition: rayHitWorldPosition,
    // compositeID,
    // prop,
    // propID,
    attributeID,
  } = selections[0].getProperties();

  console.log(attributeID);
  renderWindow.render();
}

// ----------------------------------------------------------------------------

function pickOnMouseEvent(event) {
  if (interactor.isAnimating()) {
    // We should not do picking when interacting with the scene
    return;
  }
  const [x, y] = eventToWindowXY(event);

  hardwareSelector.getSourceDataAsync(renderer, x, y, x, y).then((result) => {
    if (result) {
      processSelections(result.generateSelection(x, y, x, y));
    } else {
      processSelections(null);
    }
  });
}
const throttleMouseHandler = throttle(pickOnMouseEvent, 20);

document.addEventListener('mousemove', throttleMouseHandler);

// -----------------------------------------------------------
// UI control handling
// -----------------------------------------------------------

fullScreenRenderer.addController(controlPanel);

document.querySelector('button').addEventListener('click', () => {
  widgetManager.grabFocus(widget);
});

document
  .querySelector('input[type=checkbox]')
  .addEventListener('change', (ev) => {
    widgetManager.setUseSvgLayer(ev.target.checked);
  });

renderWindow.getInteractor().onRightButtonPress((callData) => {
  if (renderer !== callData.pokedRenderer) {
    return;
  }

  const pos = callData.position;
  const point = [pos.x, pos.y, 0.0];
  console.log(`Pick at: ${point}`);
  picker.pick(point, renderer);

  if (picker.getActors().length === 0) {
    const pickedPoint = picker.getPickPosition();
    console.log(`No cells picked, default: ${pickedPoint}`);
    const sphere = vtkSphereSource.newInstance();
    sphere.setCenter(pickedPoint);
    sphere.setRadius(0.01);
    const sphereMapper = vtkMapper.newInstance();
    sphereMapper.setInputData(sphere.getOutputData());
    const sphereActor = vtkActor.newInstance();
    sphereActor.setMapper(sphereMapper);
    sphereActor.getProperty().setColor(1.0, 0.0, 0.0);
    renderer.addActor(sphereActor);
  } else {
    const pickedCellId = picker.getCellId();
    console.log('Picked cell: ', pickedCellId);

    const pickedPoints = picker.getPickedPositions();
    for (let i = 0; i < pickedPoints.length; i++) {
      const pickedPoint = pickedPoints[i];
      console.log(`Picked: ${pickedPoint}`);
      const sphere = vtkSphereSource.newInstance();
      sphere.setCenter(pickedPoint);
      sphere.setRadius(0.01);
      const sphereMapper = vtkMapper.newInstance();
      sphereMapper.setInputData(sphere.getOutputData());
      const sphereActor = vtkActor.newInstance();
      sphereActor.setMapper(sphereMapper);
      sphereActor.getProperty().setColor(0.0, 1.0, 0.0);
      renderer.addActor(sphereActor);
    }
  }
  renderWindow.render();
});
