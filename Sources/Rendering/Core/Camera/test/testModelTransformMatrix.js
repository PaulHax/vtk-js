import { describe, it, expect, beforeEach } from 'vitest';
import { mat4 } from 'gl-matrix';
import vtkCamera from 'vtk.js/Sources/Rendering/Core/Camera';
import vtkTransform from 'vtk.js/Sources/Common/Transform/Transform';

let camera;

// getViewMatrix() returns the camera's shared internal buffer, so any snapshot
// must be cloned before the next call overwrites it.
const snapshotViewMatrix = () => mat4.clone(camera.getViewMatrix());

function matricesClose(a, b, eps = 1e-6) {
  for (let i = 0; i < 16; i++) {
    if (Math.abs(a[i] - b[i]) > eps) {
      return false;
    }
  }
  return true;
}

describe('Camera Model Transform Matrix', () => {
  beforeEach(() => {
    camera = vtkCamera.newInstance();
  });

  describe('modelTransformMatrix accessor', () => {
    it('defaults to null', () => {
      expect(camera.getModelTransformMatrix()).toBeNull();
    });

    it('round-trips through set / get / clear', () => {
      const transform = vtkTransform.newInstance();
      transform.scale(2, 3, 4);
      const matrix = transform.getMatrix();

      camera.setModelTransformMatrix(matrix);
      expect(camera.getModelTransformMatrix()).toEqual(matrix);

      camera.setModelTransformMatrix(null);
      expect(camera.getModelTransformMatrix()).toBeNull();

      transform.delete();
    });
  });

  describe('getViewMatrix composition', () => {
    it('applies the model transform in world space (modelTransform * viewMatrix), not camera space (viewMatrix * modelTransform)', () => {
      camera.setPosition(5, 5, 5);
      camera.setFocalPoint(0, 0, 0);
      camera.setViewUp(0, 1, 0);

      // A translation does not commute with the view rotation/translation, so
      // this genuinely distinguishes the two multiplication orders.
      const transform = vtkTransform.newInstance();
      transform.translate(1, 0, 0);
      const modelTransform = transform.getMatrix();

      camera.setModelTransformMatrix(null);
      const viewMatrix = snapshotViewMatrix();

      camera.setModelTransformMatrix(modelTransform);
      const composed = snapshotViewMatrix();

      const worldSpace = mat4.multiply(mat4.create(), modelTransform, viewMatrix);
      const cameraSpace = mat4.multiply(mat4.create(), viewMatrix, modelTransform);

      expect(matricesClose(composed, worldSpace)).toBe(true);
      expect(matricesClose(composed, cameraSpace)).toBe(false);

      transform.delete();
    });

    it('keeps the world-space transform consistent across camera orientations (vertical exaggeration)', () => {
      // 2x vertical exaggeration: a non-uniform world-space Z scale.
      const transform = vtkTransform.newInstance();
      transform.scale(1, 1, 2);
      const modelTransform = transform.getMatrix();

      camera.setPosition(0, 0, 10);
      camera.setFocalPoint(0, 0, 0);
      camera.setViewUp(0, 1, 0);

      // The exaggeration must stay world-space (pre-multiplied) no matter how
      // the camera is oriented -- this is the property the fix guarantees.
      [() => {}, () => camera.azimuth(37), () => camera.elevation(50)].forEach(
        (rotate) => {
          rotate();

          camera.setModelTransformMatrix(null);
          const viewMatrix = snapshotViewMatrix();

          camera.setModelTransformMatrix(modelTransform);
          const composed = snapshotViewMatrix();

          const worldSpace = mat4.multiply(
            mat4.create(),
            modelTransform,
            viewMatrix
          );
          expect(matricesClose(composed, worldSpace)).toBe(true);
        }
      );

      transform.delete();
    });
  });
});
