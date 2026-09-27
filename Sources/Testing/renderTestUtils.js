import { expect } from 'vitest';
import macro from 'vtk.js/Sources/macros';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkConeSource from 'vtk.js/Sources/Filters/Sources/ConeSource';
import vtkForwardPass from 'vtk.js/Sources/Rendering/OpenGL/ForwardPass';
import vtkGenericRenderWindow from 'vtk.js/Sources/Rendering/Misc/GenericRenderWindow';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

// A pass-through filter that throws while failing, the way a pipeline stage
// that meets bad data throws out of the render that updates it.
export function createFailingFilter(gc) {
  const publicAPI = {};
  const model = { failing: false, failures: 0 };
  macro.obj(publicAPI, model);
  macro.algo(publicAPI, model, 1, 1);
  macro.setGet(publicAPI, model, ['failing']);
  macro.get(publicAPI, model, ['failures']);
  publicAPI.requestData = (inData, outData) => {
    if (model.failing) {
      model.failures += 1;
      throw new Error('filter failed');
    }
    outData[0] = inData[0];
  };
  return gc.registerResource(publicAPI);
}

// An opacity below one routes the actor through the translucent pass, which
// owns a framebuffer and its attachments. A filter, when given, sits between
// the cone and the mapper.
export function createConeActor(gc, { opacity = 1, filter = null } = {}) {
  const cone = gc.registerResource(vtkConeSource.newInstance());
  const mapper = gc.registerResource(vtkMapper.newInstance());
  if (filter) {
    filter.setInputConnection(cone.getOutputPort());
  }
  mapper.setInputConnection((filter ?? cone).getOutputPort());
  const actor = gc.registerResource(vtkActor.newInstance());
  actor.setMapper(mapper);
  actor.getProperty().setOpacity(opacity);
  return actor;
}

// The image the next render draws, or null when that render draws nothing.
// A capture settles inside the render that draws it.
export async function renderToImage(
  view,
  render = () => view.getRenderable().render()
) {
  const image = view.captureNextImage();
  await render();
  return Promise.race([image, null]);
}

// A render that throws must not change what the renders after it draw. The
// render before the throw uses another background, so an image left on the
// canvas cannot pass for a new one. setFailing(true) makes the next render
// throw 'filter failed'.
export async function expectSameImageAfterRenderThrows(
  { renderer, renderWindow, view },
  setFailing
) {
  const background = renderer.getBackground();
  const expected = view.captureNextImage();
  renderWindow.render();
  renderer.setBackground(1, 0, 0);
  renderWindow.render();

  setFailing(true);
  expect(() => renderWindow.render()).toThrow('filter failed');

  setFailing(false);
  renderer.setBackground(background);
  expect(await renderToImage(view)).toBe(await expected);
}

// A tracked view that has rendered an empty scene: any count beyond
// emptySceneObjects belongs to the code under test.
export function createTrackedRenderView(gc, initialValues = {}) {
  const tracker = testUtils.trackWebGLObjects();
  const genericRenderWindow = gc.registerResource(
    vtkGenericRenderWindow.newInstance({
      listenWindowResize: false,
      ...initialValues,
    })
  );
  genericRenderWindow.setContainer(testUtils.createRenderContainer(gc));
  genericRenderWindow.resize();
  const renderer = genericRenderWindow.getRenderer();
  const renderWindow = genericRenderWindow.getRenderWindow();
  const view = genericRenderWindow.getApiSpecificRenderWindow();
  renderWindow.render();
  const emptySceneObjects = tracker.count();
  return { tracker, renderer, renderWindow, view, emptySceneObjects };
}

// A view whose prop throws from its mapper once the filter fails. Forcing
// opacity keeps the pass that sorts props off the mapper, so the mapper first
// updates its input, and throws, while it draws.
export function createFailingScene(
  gc,
  createProp = (propGc, filter) => createConeActor(propGc, { filter })
) {
  const scene = createTrackedRenderView(gc);
  const filter = createFailingFilter(gc);
  const prop = createProp(gc, filter);
  prop.setForceOpaque(true);
  scene.renderer.addActor(prop);
  scene.renderer.resetCamera();
  return { ...scene, filter };
}

// Releasing a mapper's resources must leave no GPU object behind and must not
// change what the next render draws.
export async function expectSameImageAfterRelease(createActor) {
  const gc = testUtils.createGarbageCollector();
  const { tracker, renderer, renderWindow, view, emptySceneObjects } =
    createTrackedRenderView(gc);

  const actor = createActor(gc);
  renderer.addActor(actor);
  renderer.resetCamera();
  const beforeRelease = view.captureNextImage();
  renderWindow.render();
  expect(tracker.count()).toBeGreaterThan(emptySceneObjects);

  view.getViewNodeFor(actor.getMapper()).releaseGraphicsResources(view);
  expect(tracker.count()).toBe(emptySceneObjects);

  const afterRelease = view.captureNextImage();
  renderWindow.render();
  expect(tracker.count()).toBeGreaterThan(emptySceneObjects);
  expect(await afterRelease).toBe(await beforeRelease);

  gc.releaseResources();
}

// A post processing pass renders its delegate into a framebuffer it owns.
// Translucency puts resources on the delegated forward pass too, so releasing
// one has to reach through the delegate chain and not just the pass itself.
export function usePostProcessingPass(gc, view, createPass) {
  const pass = createPass(gc);
  pass.setDelegates([gc.registerResource(vtkForwardPass.newInstance())]);
  view.setRenderPasses([pass]);
  return pass;
}

// Deleting a view that renders through a post processing pass must leave no
// GPU object behind.
export function expectPassResourcesFreedOnDelete(createPass) {
  const gc = testUtils.createGarbageCollector();
  const { tracker, renderer, renderWindow, view, emptySceneObjects } =
    createTrackedRenderView(gc);

  usePostProcessingPass(gc, view, createPass);
  renderer.addActor(createConeActor(gc, { opacity: 0.5 }));
  renderer.resetCamera();
  renderWindow.render();
  expect(tracker.count()).toBeGreaterThan(emptySceneObjects);

  gc.releaseResources();
  expect(tracker.count()).toBe(0);
}

// Releasing a view's render pass resources must not change what it draws next.
export async function expectSameImageAfterPassRelease(createPass) {
  const gc = testUtils.createGarbageCollector();
  const { tracker, renderer, renderWindow, view, emptySceneObjects } =
    createTrackedRenderView(gc);

  usePostProcessingPass(gc, view, createPass);
  renderer.addActor(createConeActor(gc, { opacity: 0.5 }));
  renderer.resetCamera();

  const beforeRelease = view.captureNextImage();
  renderWindow.render();
  expect(tracker.count()).toBeGreaterThan(emptySceneObjects);

  view.releaseGraphicsResources();

  const afterRelease = view.captureNextImage();
  renderWindow.render();
  expect(await afterRelease).toBe(await beforeRelease);

  gc.releaseResources();
}
