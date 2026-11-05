import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkPointGaussianMapper from '@kitware/vtk.js/Rendering/Core/PointGaussianMapper';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';

import GUI from 'lil-gui';

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  background: [0, 0, 0],
});
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();

// ----------------------------------------------------------------------------
// A point cloud on a noisy sphere, with a scalar used for colour, size and
// opacity, and a random orientation per point for anisotropic splats.
// ----------------------------------------------------------------------------

const numberOfPoints = 20000;
const coordinates = new Float32Array(3 * numberOfPoints);
const values = new Float32Array(numberOfPoints);
const scales = new Float32Array(3 * numberOfPoints);
const rotations = new Float32Array(4 * numberOfPoints);
for (let i = 0; i < numberOfPoints; i++) {
  const z = 2 * Math.random() - 1;
  const phi = 2 * Math.PI * Math.random();
  const radius = 10 * (1 + 0.1 * Math.random());
  const ring = Math.sqrt(1 - z * z);
  coordinates.set(
    [radius * ring * Math.cos(phi), radius * ring * Math.sin(phi), radius * z],
    3 * i
  );
  values[i] = 0.5 + 0.5 * Math.sin(3 * phi) * z;
  scales.set([1, 0.3 + Math.random(), 0.2], 3 * i);
  const angle = Math.PI * Math.random();
  rotations.set([Math.cos(angle), 0, 0, Math.sin(angle)], 4 * i);
}

const polyData = vtkPolyData.newInstance();
polyData.getPoints().setData(coordinates, 3);
const pointData = polyData.getPointData();
pointData.setScalars(vtkDataArray.newInstance({ name: 'value', values }));
pointData.addArray(
  vtkDataArray.newInstance({
    name: 'scale',
    numberOfComponents: 3,
    values: scales,
  })
);
pointData.addArray(
  vtkDataArray.newInstance({
    name: 'rotation',
    numberOfComponents: 4,
    values: rotations,
  })
);

const colors = vtkColorTransferFunction.newInstance();
colors.addRGBPoint(0, 0.1, 0.3, 1.0);
colors.addRGBPoint(1, 1.0, 0.6, 0.1);

const opacities = vtkPiecewiseFunction.newInstance();
opacities.addPoint(0, 0.2);
opacities.addPoint(1, 1.0);

const mapper = vtkPointGaussianMapper.newInstance();
mapper.setInputData(polyData);
mapper.setLookupTable(colors);

const actor = vtkActor.newInstance();
actor.setMapper(mapper);
renderer.addActor(actor);
renderer.resetCamera();

// ----------------------------------------------------------------------------
// UI control handling
// ----------------------------------------------------------------------------

const SHAPES = {
  Gaussian: null,
  Disc: [
    '//VTK::Color::Impl',
    '  if (dot(offsetVCVSOutput, offsetVCVSOutput) > 1.0) { discard; }',
  ].join('\n'),
  'Hollow square': [
    '//VTK::Color::Impl',
    '  if (abs(offsetVCVSOutput.x) > 1.0 || abs(offsetVCVSOutput.y) > 1.0) { discard; }',
    '  if (abs(offsetVCVSOutput.x) < 0.6 && abs(offsetVCVSOutput.y) < 0.6) { discard; }',
  ].join('\n'),
};

const params = {
  scaleFactor: 0.15,
  emissive: false,
  shape: 'Gaussian',
  scaleByValue: false,
  opacityByValue: false,
  anisotropic: false,
};

function update() {
  mapper.setScaleFactor(params.scaleFactor);
  mapper.setEmissive(params.emissive);
  mapper.setSplatShaderCode(SHAPES[params.shape]);
  // Shapes that end at one deviation need a smaller quad than a Gaussian.
  mapper.setBoundScale(params.shape === 'Gaussian' ? 3 : 1.5);
  mapper.setAnisotropic(params.anisotropic);
  mapper.setRotationArray(params.anisotropic ? 'rotation' : null);
  if (params.anisotropic) {
    mapper.setScaleArray('scale');
  } else {
    mapper.setScaleArray(params.scaleByValue ? 'value' : null);
  }
  mapper.setOpacityArray(params.opacityByValue ? 'value' : null);
  mapper.setScalarOpacityFunction(params.opacityByValue ? opacities : null);
  renderWindow.render();
}

const gui = new GUI();
gui
  .add(params, 'scaleFactor', 0, 1, 0.01)
  .name('Scale factor (0: points)')
  .onChange(update);
gui.add(params, 'emissive').name('Emissive').onChange(update);
gui.add(params, 'shape', Object.keys(SHAPES)).name('Shape').onChange(update);
gui.add(params, 'scaleByValue').name('Scale by value').onChange(update);
gui.add(params, 'opacityByValue').name('Opacity by value').onChange(update);
gui.add(params, 'anisotropic').name('Anisotropic').onChange(update);
update();

// -----------------------------------------------------------
// Make some variables global so that you can inspect and
// modify objects in your browser's developer console:
// -----------------------------------------------------------

global.mapper = mapper;
global.actor = actor;
global.renderer = renderer;
global.renderWindow = renderWindow;
