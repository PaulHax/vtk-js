import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createTrackedRenderView } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkOpenGLTexture from 'vtk.js/Sources/Rendering/OpenGL/Texture';
import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkPlaneSource from 'vtk.js/Sources/Filters/Sources/PlaneSource';
import vtkTexture from 'vtk.js/Sources/Rendering/Core/Texture';
import { VtkDataTypes } from 'vtk.js/Sources/Common/Core/DataArray/Constants';

function createCoreTexture(gc) {
  const image = vtkImageData.newInstance();
  image.setDimensions(2, 1, 1);
  image.getPointData().setScalars(
    vtkDataArray.newInstance({
      numberOfComponents: 3,
      values: Uint8Array.from([255, 0, 0, 0, 0, 255]),
    })
  );
  const texture = gc.registerResource(vtkTexture.newInstance());
  texture.setInputData(image);
  return texture;
}

function createTexturedActor(gc, texture = createCoreTexture(gc)) {
  const plane = gc.registerResource(vtkPlaneSource.newInstance());
  const mapper = gc.registerResource(vtkMapper.newInstance());
  mapper.setInputConnection(plane.getOutputPort());
  const actor = gc.registerResource(vtkActor.newInstance());
  actor.setMapper(mapper);
  actor.addTexture(texture);
  return actor;
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'frees an actor texture when the actor leaves the view or the view is deleted',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, view } =
      createTrackedRenderView(gc);
    const gl = view.getContext();
    const sharedTexture = createCoreTexture(gc);
    const staying = createTexturedActor(gc, sharedTexture);
    renderer.addActor(staying);
    renderer.resetCamera();
    renderWindow.render();
    const oneActorObjects = tracker.count();

    const stayingHandle = view
      .getViewNodeFor(staying)
      .getViewNodeFor(sharedTexture)
      .getHandle();
    const leaving = createTexturedActor(gc, sharedTexture);
    renderer.addActor(leaving);
    renderWindow.render();
    expect(tracker.count()).toBeGreaterThan(oneActorObjects);
    const leavingHandle = view
      .getViewNodeFor(leaving)
      .getViewNodeFor(sharedTexture)
      .getHandle();

    renderer.removeActor(leaving);
    renderWindow.render();
    expect(tracker.count()).toBe(oneActorObjects);
    expect(gl.isTexture(leavingHandle)).toBe(false);
    expect(gl.isTexture(stayingHandle)).toBe(true);
    expect(gl.getError()).toBe(gl.NO_ERROR);

    gc.releaseResources();
    expect(tracker.count()).toBe(0);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'frees a texture released without a render window and uploads it again',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, renderer, renderWindow, view } =
      createTrackedRenderView(gc);
    const background = view.captureNextImage();
    renderWindow.render();

    const actor = createTexturedActor(gc);
    renderer.addActor(actor);
    renderer.resetCamera();
    const beforeRelease = view.captureNextImage();
    renderWindow.render();
    const objectsInUse = tracker.count();
    expect(await beforeRelease).not.toBe(await background);

    const gl = view.getContext();
    gl.activeTexture(gl.TEXTURE0 + 1);
    view.getViewNodeFor(actor.getTextures()[0]).releaseGraphicsResources();
    expect(gl.getParameter(gl.ACTIVE_TEXTURE)).toBe(gl.TEXTURE0 + 1);
    expect(tracker.count()).toBe(objectsInUse - 1);

    const afterRelease = view.captureNextImage();
    renderWindow.render();
    expect(tracker.count()).toBe(objectsInUse);
    expect(await afterRelease).toBe(await beforeRelease);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'frees a texture deleted after its render window',
  () => {
    const gc = testUtils.createGarbageCollector();
    const { tracker, view, emptySceneObjects } = createTrackedRenderView(gc);

    const texture = vtkOpenGLTexture.newInstance();
    texture.setOpenGLRenderWindow(view);
    texture.create2DFromRaw({
      width: 2,
      height: 2,
      numComps: 4,
      dataType: VtkDataTypes.UNSIGNED_CHAR,
      data: null,
    });
    expect(tracker.count()).toBe(emptySceneObjects + 1);

    gc.releaseResources();
    expect(() => texture.delete()).not.toThrow();
    expect(tracker.count()).toBe(0);
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'preserves explicit texture precision across release and window changes',
  ({ skip }) => {
    const gc = testUtils.createGarbageCollector();
    const view = gc.registerResource(vtkOpenGLRenderWindow.newInstance());
    gc.registerResource(vtkRenderWindow.newInstance()).addView(view);
    view.initialize();
    const gl = view.getContext();
    if (!gl.getExtension('EXT_color_buffer_float')) {
      gc.releaseResources();
      skip('Floating-point color attachments are unavailable.');
    }
    const otherView = gc.registerResource(
      vtkOpenGLRenderWindow.newInstance({
        canvas: view.getCanvas(),
        manageCanvas: false,
      })
    );
    gc.registerResource(vtkRenderWindow.newInstance()).addView(otherView);
    otherView.initialize();

    const texture = gc.registerResource(vtkOpenGLTexture.newInstance(), 1);
    texture.setOpenGLRenderWindow(view);
    texture.setInternalFormat(gl.RGBA16F);
    const data = Float32Array.from([0.25, 0.5, 0.75, 1]);
    const upload = () =>
      expect(
        texture.create2DFromRaw({
          width: 1,
          height: 1,
          numComps: 4,
          dataType: VtkDataTypes.FLOAT,
          data,
        })
      ).toBe(true);
    upload();
    [
      () => texture.releaseGraphicsResources(),
      () => texture.setOpenGLRenderWindow(otherView),
    ].forEach((release) => {
      const handle = texture.getHandle();
      release();
      expect(gl.isTexture(handle)).toBe(false);
      upload();
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture.getHandle(),
        0
      );
      expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).toBe(
        gl.FRAMEBUFFER_COMPLETE
      );
      expect(
        gl.getFramebufferAttachmentParameter(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.FRAMEBUFFER_ATTACHMENT_RED_SIZE
        )
      ).toBe(16);
      const actual = new Float32Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, actual);
      expect(actual).toEqual(data);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    });
  }
);
