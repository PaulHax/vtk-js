import { it, expect, vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPointGaussianMapper from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper';
import vtkForwardPass from 'vtk.js/Sources/Rendering/OpenGL/ForwardPass';
import vtkRenderPass from 'vtk.js/Sources/Rendering/SceneGraph/RenderPass';
import {
  DISC,
  capture,
  createPolyData,
  createScene,
  lookDownZ,
  rgbaAt,
} from 'vtk.js/Sources/Rendering/Core/PointGaussianMapper/test/pointGaussianTestUtils';

function usePremultipliedPass(scene) {
  const pass = {};
  vtkRenderPass.extend(pass, {});
  const replace = (shaders) => {
    shaders.Fragment = shaders.Fragment.replace(
      '//VTK::RenderPassFragmentShader::Impl',
      'gl_FragData[0].rgb *= gl_FragData[0].a;'
    );
  };
  pass.getShaderReplacement = () => replace;
  pass.traverse = (view, rendererNode) => {
    const gl = view.getContext();
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA
    );
    gl.depthMask(false);
    pass.setCurrentOperation('translucentPass');
    try {
      rendererNode.traverse(pass);
    } finally {
      gl.depthMask(true);
    }
  };
  scene.view.setRenderPasses([
    vtkForwardPass.newInstance({ translucentPass: pass }),
  ]);
}

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'vtkPointGaussianMapper preserves floating colors before alpha composition',
  async () => {
    for (const ordered of [false, true]) {
      const gc = testUtils.createGarbageCollector();
      try {
        const poly = createPolyData(gc, [0, 0, 0]);
        const colors = gc.registerResource(
          vtkDataArray.newInstance({
            name: 'reconstruction',
            numberOfComponents: 4,
            values: new Float32Array([2, 0, 0, 0.25]),
          })
        );
        poly.getPointData().addArray(colors);
        const mapper = vtkPointGaussianMapper.newInstance({
          emissive: false,
          scaleFactor: 0.5,
          splatShaderCode: DISC,
          directColorArray: 'reconstruction',
        });
        if (ordered) {
          mapper.setPointOrder(
            gc.registerResource(
              vtkDataArray.newInstance({ values: new Uint32Array([0]) })
            )
          );
        }
        const scene = createScene(gc, mapper, poly, 60);
        lookDownZ(scene.renderer, 1.5);
        usePremultipliedPass(scene);
        const hdr = rgbaAt(await capture(scene), 30, 30);
        expect(hdr[0]).toBeGreaterThan(120);
        expect(hdr[0]).toBeLessThan(135);
        expect(hdr[1]).toBe(0);
        const uploads = vi.spyOn(scene.view.getContext(), 'texSubImage2D');
        try {
          colors.getData()[0] = 1;
          colors.modified();
          const unit = rgbaAt(await capture(scene), 30, 30);
          expect(unit[0]).toBeGreaterThan(60);
          expect(unit[0]).toBeLessThan(70);
          if (ordered) {
            expect(uploads.mock.calls).toHaveLength(1);
            expect(uploads.mock.calls[0].at(-1)).toBeInstanceOf(Float32Array);
          }
        } finally {
          uploads.mockRestore();
        }
      } finally {
        gc.releaseResources();
      }
    }
  }
);
