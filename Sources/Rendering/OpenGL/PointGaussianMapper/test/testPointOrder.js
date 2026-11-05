import { it, expect, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkForwardPass from 'vtk.js/Sources/Rendering/OpenGL/ForwardPass';
import vtkRenderPass from 'vtk.js/Sources/Rendering/SceneGraph/RenderPass';
import {
  attributeIds,
  capture,
  createPointSelector,
  createPolyData,
  createScene,
  lookDownZ,
  rgbaAt,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

function useAlphaPass(scene) {
  const pass = {};
  vtkRenderPass.extend(pass, {});
  pass.getShaderReplacement = () => null;
  pass.traverse = (view, rendererNode) => {
    const gl = view.getContext();
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA
    );
    gl.depthMask(false);
    pass.setCurrentOperation('translucentPass');
    rendererNode.traverse(pass);
    gl.depthMask(true);
  };
  scene.view.setRenderPasses([
    vtkForwardPass.newInstance({ translucentPass: pass }),
  ]);
}

function makeScene(gc, coordinates = [0, 0, 0, 0, 0, 0]) {
  const poly = createPolyData(
    gc,
    coordinates,
    [255, 0, 0, 255, 0, 0, 255, 255]
  );
  for (const [name, components, values] of [
    ['scale', 3, [0.6, 0.25, 0.3, 0.4, 0.7, 0.2]],
    ['rotation', 4, [0.92388, 0, 0, 0.38268, 1, 0, 0, 0]],
    ['opacity', 1, [0.6, 0.4]],
  ]) {
    poly.getPointData().addArray(
      vtkDataArray.newInstance({
        name,
        numberOfComponents: components,
        values: Float32Array.from(values),
      })
    );
  }
  const scene = createScene(
    gc,
    vtkPointGaussianMapper.newInstance({
      emissive: false,
      anisotropic: true,
      scaleArray: 'scale',
      rotationArray: 'rotation',
      opacityArray: 'opacity',
    }),
    poly,
    60
  );
  lookDownZ(scene.renderer, 1.5);
  useAlphaPass(scene);
  return scene;
}

function orderArray(values) {
  return vtkDataArray.newInstance({ values: Uint32Array.from(values) });
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper reorders splats without uploading their resident attributes',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);
    const baseline = await capture(scene);
    const order = gc.registerResource(orderArray([0, 1]));
    scene.mapper.setPointOrder(order);
    const ordered = await capture(scene);
    expect(ordered.data).toEqual(baseline.data);

    const gl = scene.view.getContext();
    const buffers = vi.spyOn(gl, 'bufferData');
    const allocate = vi.spyOn(gl, 'texImage2D');
    const uploads = vi.spyOn(gl, 'texSubImage2D');
    try {
      order.setData(Uint32Array.of(1, 0));
      const reversed = await capture(scene);
      const before = rgbaAt(ordered, 30, 30);
      const after = rgbaAt(reversed, 30, 30);
      expect(after[0], 'red splat now blends last').toBeGreaterThan(before[0]);
      expect(after[2], 'blue splat now blends first').toBeLessThan(before[2]);
      expect(buffers.mock.calls).toHaveLength(0);
      expect(allocate.mock.calls).toHaveLength(0);
      expect(uploads.mock.calls).toHaveLength(1);
      expect(uploads.mock.calls[0].at(-1)).toEqual(Uint32Array.of(1, 0));

      uploads.mockClear();
      order.getData().reverse();
      order.modified();
      expect((await capture(scene)).data).toEqual(ordered.data);
      expect(uploads.mock.calls).toHaveLength(1);
      expect(uploads.mock.calls[0].at(-1)).toBeInstanceOf(Uint32Array);

      uploads.mockClear();
      const colors = scene.polyData.getPointData().getScalars();
      colors.getData()[0] = 0;
      colors.getData()[1] = 255;
      colors.modified();
      expect(rgbaAt(await capture(scene), 30, 30)[1]).toBeGreaterThan(0);
      expect(uploads.mock.calls).toHaveLength(1);
      expect(uploads.mock.calls[0].at(-1)).toBeInstanceOf(Uint8Array);
    } finally {
      buffers.mockRestore();
      allocate.mockRestore();
      uploads.mockRestore();
      gc.releaseResources();
    }
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper ordered textures preserve shifted positions across texture rows',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = createScene(
      gc,
      vtkPointGaussianMapper.newInstance({
        emissive: false,
        scaleFactor: 0.1,
      }),
      createPolyData(gc, [0, 0, 0]),
      60
    );
    scene.renderWindow.render();
    const width = scene.view
      .getContext()
      .getParameter(scene.view.getContext().MAX_TEXTURE_SIZE);
    const coordinates = new Float64Array((width + 1) * 3);
    for (let i = 0; i <= width; i++) coordinates[3 * i] = 1e8 - 10;
    coordinates[width * 3] = 1e8 + 1;
    scene.polyData.getPoints().setData(coordinates, 3);
    const camera = lookDownZ(scene.renderer, 1.5);
    camera.setPosition(1e8, 0, 10);
    camera.setFocalPoint(1e8, 0, 0);
    const order = gc.registerResource(orderArray([width]));
    scene.mapper.setPointOrder(order);
    expect(rgbaAt(await capture(scene), 50, 30)[0]).toBeGreaterThan(0);
    const selector = createPointSelector(scene);
    expect(
      attributeIds(await selector.selectAsync(scene.renderer, 50, 30, 50, 30))
    ).toEqual([width]);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper rejects invalid orders and draws after they are corrected',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc);
    const order = gc.registerResource(orderArray([2]));
    scene.mapper.setPointOrder(order);
    expect(rgbaAt(await capture(scene), 30, 30).slice(0, 3)).toEqual([0, 0, 0]);
    order.setData(Uint32Array.of(1));
    expect(rgbaAt(await capture(scene), 30, 30)[2]).toBeGreaterThan(0);
    order.setData(new Uint32Array());
    expect(rgbaAt(await capture(scene), 30, 30).slice(0, 3)).toEqual([0, 0, 0]);
    order.setData(Uint32Array.of(0));
    expect(rgbaAt(await capture(scene), 30, 30)[0]).toBeGreaterThan(0);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper ordered subsets retain input point ids for selection',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const scene = makeScene(gc, [-1, 0, 0, 1, 0, 0]);
    const order = gc.registerResource(orderArray([1]));
    scene.mapper.setPointOrder(order);
    const selector = createPointSelector(scene);
    expect(
      attributeIds(await selector.selectAsync(scene.renderer, 50, 30, 50, 30))
    ).toEqual([1]);
    expect(await selector.selectAsync(scene.renderer, 10, 30, 10, 30)).toEqual(
      []
    );
    order.setData(Uint32Array.of(0));
    expect(
      attributeIds(await selector.selectAsync(scene.renderer, 10, 30, 10, 30))
    ).toEqual([0]);
    gc.releaseResources();
  }
);

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper releases ordered textures and redraws after release or mode changes',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const tracker = testUtils.trackWebGLObjects();
    const scene = makeScene(gc);
    scene.renderWindow.render();
    const ordinaryObjects = tracker.count();
    const order = gc.registerResource(orderArray([0, 1]));
    scene.mapper.setPointOrder(order);
    const before = await capture(scene);
    const orderedObjects = tracker.count();
    scene.view
      .getViewNodeFor(scene.mapper)
      .releaseGraphicsResources(scene.view);
    expect(tracker.count()).toBeLessThan(orderedObjects);
    expect((await capture(scene)).data).toEqual(before.data);

    scene.mapper.setScaleFactor(0);
    scene.renderWindow.render();
    scene.mapper.setScaleFactor(1);
    expect((await capture(scene)).data).toEqual(before.data);
    scene.mapper.setPointOrder(null);
    scene.renderWindow.render();
    expect(tracker.count()).toBe(ordinaryObjects);
    expect((await capture(scene)).data).toEqual(before.data);
    gc.releaseResources();
  }
);
