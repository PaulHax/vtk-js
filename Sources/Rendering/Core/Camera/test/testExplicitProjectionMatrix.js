import { describe, it, expect, beforeEach } from 'vitest';
import { mat4 } from 'gl-matrix';
import { allowLogs } from 'vtk.js/Sources/Testing/logging';
import { areEquals } from 'vtk.js/Sources/Common/Core/Math';
import vtkCamera from 'vtk.js/Sources/Rendering/Core/Camera';

let camera;

describe('Camera Explicit Projection Matrix', () => {
  beforeEach(() => {
    camera = vtkCamera.newInstance();
  });

  describe('getProjectionMatrix with an explicit matrix', () => {
    it('scales the explicit matrix by 1/physicalScale', () => {
      // Stands in for a projection supplied by a caller, such as
      // WebXR's XRView.projectionMatrix.
      const explicit = mat4.perspective(
        mat4.create(),
        Math.PI / 3,
        1.5,
        0.5,
        75
      );
      camera.setExplicitProjectionMatrix(explicit);
      camera.setPhysicalScale(2.5);

      const result = camera.getProjectionMatrix(1.5, -1, 1);

      // Reimplemented independently, so this isn't a tautological test.
      const scale = 1 / 2.5;
      const expected = mat4.scale(mat4.create(), explicit, [
        scale,
        scale,
        scale,
      ]);
      mat4.transpose(expected, expected);

      expect(areEquals(result, expected)).toBe(true);
      // Sanity: the scale must actually have an effect (not silently 1:1).
      expect(areEquals(result, mat4.transpose(mat4.create(), explicit))).toBe(
        false
      );
    });

    it('leaves the explicit matrix unscaled at the default physicalScale of 1', () => {
      const explicit = mat4.ortho(mat4.create(), -2, 2, -1, 1, 0.1, 50);
      camera.setExplicitProjectionMatrix(explicit);

      const result = camera.getProjectionMatrix(1.0, -1, 1);
      const expected = mat4.transpose(mat4.create(), explicit);

      expect(areEquals(result, expected)).toBe(true);
    });

    it('reverts to the computed projection once the explicit matrix is cleared', () => {
      camera.setClippingRange(0.1, 100);
      camera.setViewAngle(40);
      const computed = camera.getProjectionMatrix(1.2, -1, 1);

      camera.setExplicitProjectionMatrix(mat4.create());
      expect(areEquals(camera.getProjectionMatrix(1.2, -1, 1), computed)).toBe(
        false
      );

      camera.setExplicitProjectionMatrix(null);
      expect(areEquals(camera.getProjectionMatrix(1.2, -1, 1), computed)).toBe(
        true
      );
    });
  });

  describe('getProjectionMatrix out parameter', () => {
    it('writes into an output buffer supplied by the caller and returns it', () => {
      camera.setClippingRange(0.1, 100);
      const out = new Float64Array(16);

      const result = camera.getProjectionMatrix(1.33, -1, 1, out);

      expect(result).toBe(out);
      expect(areEquals(result, camera.getProjectionMatrix(1.33, -1, 1))).toBe(
        true
      );
    });

    it('writes an explicit matrix result into an output buffer supplied by the caller', () => {
      const explicit = mat4.perspective(mat4.create(), Math.PI / 4, 1, 1, 10);
      camera.setExplicitProjectionMatrix(explicit);
      const out = new Float64Array(16);

      const result = camera.getProjectionMatrix(1, -1, 1, out);

      expect(result).toBe(out);
      expect(areEquals(result, camera.getProjectionMatrix(1, -1, 1))).toBe(
        true
      );
    });

    it('still allocates its own buffer when no out is given (backward compatible)', () => {
      camera.setClippingRange(0.1, 100);
      const a = camera.getProjectionMatrix(1, -1, 1);
      const b = camera.getProjectionMatrix(1, -1, 1);

      expect(a).not.toBe(b);
      expect(areEquals(a, b)).toBe(true);
    });
  });

  describe('setProjectionMatrix alias', () => {
    it('sets and clears the explicit projection matrix', () => {
      allowLogs('warn');
      const explicit = mat4.perspective(mat4.create(), 1, 1, 1, 20);
      camera.setProjectionMatrix(explicit);

      expect(camera.getExplicitProjectionMatrix()).toBe(explicit);
      const expected = mat4.transpose(mat4.create(), explicit);
      expect(areEquals(camera.getProjectionMatrix(1, -1, 1), expected)).toBe(
        true
      );

      camera.setProjectionMatrix(null);
      expect(camera.getExplicitProjectionMatrix()).toBeNull();
    });
  });
});
