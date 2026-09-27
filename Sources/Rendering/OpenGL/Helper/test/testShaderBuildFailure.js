import { afterEach, describe, expect, it, vi } from 'vitest';
import macro from 'vtk.js/Sources/macros';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createConeActor,
  createTrackedRenderView,
} from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkConeSource from 'vtk.js/Sources/Filters/Sources/ConeSource';
import vtkGlyph3DMapper from 'vtk.js/Sources/Rendering/Core/Glyph3DMapper';
import vtkImageCPRMapper from 'vtk.js/Sources/Rendering/Core/ImageCPRMapper';
import vtkImageMapper from 'vtk.js/Sources/Rendering/Core/ImageMapper';
import vtkImageResliceMapper from 'vtk.js/Sources/Rendering/Core/ImageResliceMapper';
import vtkImageSlice from 'vtk.js/Sources/Rendering/Core/ImageSlice';
import vtkLight from 'vtk.js/Sources/Rendering/Core/Light';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkPlane from 'vtk.js/Sources/Common/DataModel/Plane';
import vtkPlaneSource from 'vtk.js/Sources/Filters/Sources/PlaneSource';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkSkybox from 'vtk.js/Sources/Rendering/Core/Skybox';
import vtkTexture from 'vtk.js/Sources/Rendering/Core/Texture';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';

afterEach(() => {
  vi.restoreAllMocks();
  macro.setLoggerFunction('error', console.error);
});

const createImage = () => testUtils.createImage([16, 16, 16], [1, 1, 1]);

function createVolume(gc) {
  const image = createImage();
  const mapper = gc.registerResource(vtkVolumeMapper.newInstance());
  mapper.setInputData(image);
  const volume = gc.registerResource(vtkVolume.newInstance());
  volume.setMapper(mapper);
  const [low, high] = image.getPointData().getScalars().getRange();
  const color = gc.registerResource(vtkColorTransferFunction.newInstance());
  color.addRGBPoint(low, 0, 0, 1);
  color.addRGBPoint(high, 1, 0.5, 0);
  const opacity = gc.registerResource(vtkPiecewiseFunction.newInstance());
  opacity.addPoint(low, 0);
  opacity.addPoint(high, 1);
  volume.getProperty().setRGBTransferFunction(0, color);
  volume.getProperty().setScalarOpacity(0, opacity);
  return volume;
}

function createImageSlice(gc, mapper) {
  const slice = gc.registerResource(vtkImageSlice.newInstance());
  slice.setMapper(gc.registerResource(mapper));
  return slice;
}

function createAxisAlignedSlice(gc) {
  const mapper = vtkImageMapper.newInstance();
  mapper.setInputData(createImage());
  mapper.setSlice(8);
  return createImageSlice(gc, mapper);
}

function createResliceSlice(gc) {
  const mapper = vtkImageResliceMapper.newInstance();
  mapper.setInputData(createImage());
  mapper.setSlicePlane(
    gc.registerResource(
      vtkPlane.newInstance({ origin: [8, 8, 8], normal: [0, 1, 1] })
    )
  );
  return createImageSlice(gc, mapper);
}

function createCurvedReformationSlice(gc) {
  const centerline = gc.registerResource(vtkPolyData.newInstance());
  centerline.getPoints().setData(Float32Array.from([8, 8, 0, 8, 8, 15]), 3);
  centerline.getLines().setData(Uint16Array.from([2, 0, 1]));
  const mapper = vtkImageCPRMapper.newInstance();
  mapper.setImageData(createImage());
  mapper.setCenterlineData(centerline);
  mapper.setUseUniformOrientation(true);
  mapper.setWidth(16);
  return createImageSlice(gc, mapper);
}

function createGlyphActor(gc) {
  const planeSource = gc.registerResource(vtkPlaneSource.newInstance());
  const coneSource = gc.registerResource(vtkConeSource.newInstance());
  const mapper = gc.registerResource(vtkGlyph3DMapper.newInstance());
  mapper.setInputConnection(planeSource.getOutputPort(), 0);
  mapper.setInputConnection(coneSource.getOutputPort(), 1);
  const actor = gc.registerResource(vtkActor.newInstance());
  actor.setMapper(mapper);
  return actor;
}

function createSkybox(gc) {
  const texture = gc.registerResource(vtkTexture.newInstance());
  texture.setInputData(testUtils.createImage([16, 16, 1], [1, 1, 1]));
  const skybox = gc.registerResource(vtkSkybox.newInstance());
  skybox.setFormat('background');
  skybox.addTexture(texture);
  return skybox;
}

// A shader build fails when the context is lost while it runs:
// getShaderParameter answers null, and in some browsers so do createShader and
// createProgram. That frame must skip the prop, and the next render must draw
// it again without logging an error.
function renderWithFailedBuild({ view, renderWindow }, failingCall) {
  const gl = view.getContext();
  vi.spyOn(gl, failingCall).mockReturnValueOnce(null);
  const failed = view.captureNextImage();
  renderWindow.render();

  const errors = [];
  macro.setLoggerFunction('error', (...args) => errors.push(args));
  const recovered = view.captureNextImage();
  renderWindow.render();
  macro.setLoggerFunction('error', console.error);
  expect(errors).toEqual([]);
  expect(gl.getError()).toBe(gl.NO_ERROR);
  return { failed, recovered };
}

// A recovered frame must match a build that never failed. The window release
// keeps mapper owned textures, such as the volume's jitter noise, so the
// pixels repeat.
async function expectRecovered(scene, builds) {
  scene.view.releaseGraphicsResources();
  const reference = scene.view.captureNextImage();
  scene.renderWindow.render();
  for (const { failed, recovered } of builds) {
    expect(await failed).not.toBe(await reference);
    expect(await recovered).toBe(await reference);
  }
}

async function expectRecoveryFromFailedBuilds(
  createProp,
  failingCall = 'getShaderParameter'
) {
  const gc = testUtils.createGarbageCollector();
  const scene = createTrackedRenderView(gc);
  scene.renderer.addViewProp(createProp(gc));
  scene.renderer.resetCamera();
  const firstBuild = renderWithFailedBuild(scene, failingCall);
  scene.view.releaseGraphicsResources();
  const rebuild = renderWithFailedBuild(scene, failingCall);
  await expectRecovered(scene, [firstBuild, rebuild]);
  gc.releaseResources();
}

describe.skipIf(__VTK_TEST_NO_WEBGL__)('failed shader build', () => {
  it.each([
    ['volume', createVolume],
    ['axis aligned image slice', createAxisAlignedSlice],
    ['resliced image', createResliceSlice],
    ['curved planar reformation', createCurvedReformationSlice],
    ['poly data actor', createConeActor],
    ['glyph actor', createGlyphActor],
    ['skybox', createSkybox],
  ])('renders the %s again on the next frame', (name, createProp) =>
    expectRecoveryFromFailedBuilds(createProp)
  );

  it.each(['createShader', 'createProgram'])(
    'renders the volume again after %s answers null',
    (failingCall) => expectRecoveryFromFailedBuilds(createVolume, failingCall)
  );

  // Nothing but the program handle asks for this rebuild again after it fails
  it('rebuilds poly data shaders after a failed rebuild for new lights', async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = createTrackedRenderView(gc);
    scene.renderer.addActor(createConeActor(gc));
    scene.renderer.resetCamera();
    scene.renderWindow.render();

    scene.renderer.addLight(gc.registerResource(vtkLight.newInstance()));
    const build = renderWithFailedBuild(scene, 'getShaderParameter');
    await expectRecovered(scene, [build]);
    gc.releaseResources();
  });
});
