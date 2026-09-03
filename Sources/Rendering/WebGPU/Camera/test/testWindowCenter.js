import { describe, it, expect, beforeEach } from 'vitest';
import { mat4 } from 'gl-matrix';
import { areEquals } from 'vtk.js/Sources/Common/Core/Math';
import vtkCamera from 'vtk.js/Sources/Rendering/Core/Camera';
import vtkWebGPUCamera from 'vtk.js/Sources/Rendering/WebGPU/Camera';

const ASPECT = 1.5;

function makeWebGPUCamera(coreCamera) {
  const webgpuCamera = vtkWebGPUCamera.newInstance();
  webgpuCamera.setRenderable(coreCamera);
  return webgpuCamera;
}

describe('WebGPU Camera native parallel projection window center', () => {
  let camera;
  let webgpuCamera;

  beforeEach(() => {
    camera = vtkCamera.newInstance();
    camera.setParallelProjection(true);
    camera.setParallelScale(2);
    camera.setClippingRange(1, 50);
    webgpuCamera = makeWebGPUCamera(camera);
  });

  it('matches what delegating to Core would produce for an off-center window', () => {
    camera.setWindowCenter(0.3, -0.2);

    const outMat = new Float64Array(16);
    webgpuCamera.getProjectionMatrix(
      outMat,
      ASPECT,
      camera.getClippingRangeByReference(),
      camera.getWindowCenterByReference()
    );

    // Recover Core's raw, zero-transpose convention and apply this
    // backend's reversed-Z remap, same as the explicit-matrix delegation.
    const expected = camera.getProjectionMatrix(ASPECT, -1, 1);
    mat4.transpose(expected, expected);
    const Z_REMAP = mat4.create();
    Z_REMAP[10] = -0.5;
    Z_REMAP[14] = 0.5;
    mat4.multiply(expected, Z_REMAP, expected);

    expect(areEquals(outMat, expected)).toBe(true);
  });

  it('maps the window edges to the correct side, not mirrored', () => {
    // A positive windowCenter brings more of +x into frame, so the optical
    // axis (view-space x=0) must land left of NDC center: negative.
    camera.setWindowCenter(0.5, 0);

    const outMat = new Float64Array(16);
    webgpuCamera.getProjectionMatrix(
      outMat,
      ASPECT,
      camera.getClippingRangeByReference(),
      camera.getWindowCenterByReference()
    );

    expect(outMat[12]).toBeLessThan(0);
  });

  it('leaves the centered window (every existing caller) unchanged', () => {
    const outMat = new Float64Array(16);
    webgpuCamera.getProjectionMatrix(
      outMat,
      ASPECT,
      camera.getClippingRangeByReference(),
      camera.getWindowCenterByReference()
    );

    // toBeCloseTo, not toBe: negating a signed zero yields -0, which
    // Object.is (and so toBe) treats as distinct from 0.
    expect(outMat[12]).toBeCloseTo(0, 9);
    expect(outMat[13]).toBeCloseTo(0, 9);
  });
});
