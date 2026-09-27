import { it } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';

import { ColorSpace } from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/Constants';

import {
  addRandomArray,
  addRandomRotations,
  createPointCloud,
  createRandom,
} from './pointGaussianTestData';

import baselineSplats from './testGaussianSplats.png';
import baselineOpacity from './testGaussianSplatsOpacity.png';
import baselineAnisotropic from './testGaussianSplatsAnisotropic.png';

// Ports of VTK's TestPointGaussianMapper, TestPointGaussianMapperOpacity and
// TestPointGaussianMapperAnisotropic. The baselines match what VTK 9.6 draws
// for the same arrays.

// Renders the mapper seen along -z, zoomed in from the fitted view.
async function renderAndCompare(gc, mapper, zoom, baseline, name) {
  const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
  const renderer = gc.registerResource(vtkRenderer.newInstance());
  renderWindow.addRenderer(renderer);
  const actor = gc.registerResource(vtkActor.newInstance());
  actor.setMapper(mapper);
  renderer.addActor(actor);

  const view = gc.registerResource(renderWindow.newAPISpecificView());
  view.setContainer(testUtils.createRenderContainer(gc, 300));
  renderWindow.addView(view);
  view.setSize(300, 300);
  renderer.resetCamera();
  renderer.getActiveCamera().zoom(zoom);

  const image = view.captureNextImage();
  renderWindow.render();
  await testUtils.compareImages(await image, [baseline], name, 1);
  gc.releaseResources();
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper draws emissive splats sized by an array',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const random = createRandom(1);
    const polyData = gc.registerResource(
      createPointCloud(10000, 20 * 10000 ** 0.33, random)
    );
    addRandomArray(polyData, 'RandomPointVectors', 3, random);

    const mapper = gc.registerResource(vtkPointGaussianMapper.newInstance());
    mapper.setInputData(polyData);
    mapper.setColorModeToMapScalars();
    mapper.setScalarModeToUsePointFieldData();
    mapper.setColorByArrayName('RandomPointVectors');
    mapper.setInterpolateScalarsBeforeMapping(false);
    mapper.setScaleArray('RandomPointVectors');
    // Beyond the last component: the vector magnitude.
    mapper.setScaleArrayComponent(3);

    const colors = gc.registerResource(vtkColorTransferFunction.newInstance());
    colors.addHSVPoint(0.0, 0.1, 1.0, 0.8);
    colors.addHSVPoint(1.0, 0.2, 0.5, 1.0);
    colors.setColorSpace(ColorSpace.RGB);
    mapper.setLookupTable(colors);

    await renderAndCompare(
      gc,
      mapper,
      10,
      baselineSplats,
      'testGaussianSplats'
    );
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper maps an opacity array and runs custom splat shader code',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const random = createRandom(2);
    const polyData = gc.registerResource(
      createPointCloud(10000, 10 * 10000 ** 0.33, random)
    );
    addRandomArray(polyData, 'RandomPointScalars', 1, random);
    addRandomArray(polyData, 'RandomPointVectors', 3, random);
    const opacities = addRandomArray(polyData, 'RandomPointArray', 1, random);
    polyData.getPointData().setScalars(opacities);

    const mapper = gc.registerResource(vtkPointGaussianMapper.newInstance());
    mapper.setInputData(polyData);
    mapper.setColorModeToMapScalars();
    mapper.setScalarModeToUsePointFieldData();
    mapper.setColorByArrayName('RandomPointVectors');
    mapper.setInterpolateScalarsBeforeMapping(false);
    mapper.setScaleArray('RandomPointScalars');
    // A single-component array ignores the requested component.
    mapper.setScaleArrayComponent(1);
    mapper.setOpacityArray('RandomPointArray');
    mapper.setOpacityArrayComponent(0);
    mapper.setEmissive(false);
    // Hollow squares, which only need a bound of 1.5 deviations.
    mapper.setSplatShaderCode(
      [
        '//VTK::Color::Impl',
        '  if (abs(offsetVCVSOutput.x) > 1.0 || abs(offsetVCVSOutput.y) > 1.0) { discard; }',
        '  if (abs(offsetVCVSOutput.x) < 0.6 && abs(offsetVCVSOutput.y) < 0.6) { discard; }',
      ].join('\n')
    );
    mapper.setBoundScale(1.5);

    const colors = gc.registerResource(
      vtkColorTransferFunction.newInstance({ hSVWrap: false })
    );
    colors.addHSVPoint(0.0, 0.1, 0.7, 1.0);
    colors.addHSVPoint(1.0, 0.9, 0.7, 1.0);
    colors.setColorSpace(ColorSpace.HSV);
    mapper.setLookupTable(colors);

    const opacityFunction = gc.registerResource(
      vtkPiecewiseFunction.newInstance()
    );
    opacityFunction.addPoint(0.0, 0.3);
    opacityFunction.addPoint(1.0, 1.0);
    mapper.setScalarOpacityFunction(opacityFunction);

    await renderAndCompare(
      gc,
      mapper,
      10,
      baselineOpacity,
      'testGaussianSplatsOpacity'
    );
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper draws anisotropic splats from scales and rotations',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const random = createRandom(3);
    const polyData = gc.registerResource(createPointCloud(100, 10, random));
    addRandomArray(polyData, 'scale', 3, () => 0.01 + random());
    addRandomRotations(polyData, 'rotation', random);

    const mapper = gc.registerResource(vtkPointGaussianMapper.newInstance());
    mapper.setInputData(polyData);
    mapper.setEmissive(false);
    // Discs darkening towards their rim.
    mapper.setSplatShaderCode(
      [
        '//VTK::Color::Impl',
        '  float dist = sqrt(dot(offsetVCVSOutput.xy, offsetVCVSOutput.xy));',
        '  if (dist > 1.0) { discard; }',
        '  float scale = (1.0 - dist);',
        '  ambientColor *= scale;',
        '  diffuseColor *= scale;',
      ].join('\n')
    );
    mapper.setBoundScale(1.0);
    mapper.setAnisotropic(true);
    mapper.setScaleArray('scale');
    mapper.setRotationArray('rotation');
    mapper.setLowpassMatrix(1e-5, 0, 1e-5);

    await renderAndCompare(
      gc,
      mapper,
      2,
      baselineAnisotropic,
      'testGaussianSplatsAnisotropic'
    );
  }
);
