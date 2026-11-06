import { describe, expect, it, vi } from 'vitest';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import HalfFloat from 'vtk.js/Sources/Common/Core/HalfFloat';
import vtkWebGPUDevice from 'vtk.js/Sources/Rendering/WebGPU/Device';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkWebGPUTextureManager from 'vtk.js/Sources/Rendering/WebGPU/TextureManager';

function createImageData(values) {
  const scalars = vtkDataArray.newInstance({
    name: 'Scalars',
    values,
    numberOfComponents: 1,
  });
  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(values.length, 1, 1);
  imageData.getPointData().setScalars(scalars);
  return imageData;
}

function createTextureManager(supportsFloat32) {
  const textureManager = vtkWebGPUTextureManager.newInstance();
  const device = {
    getTextureManager: () => ({
      getTexture: (request) => ({ getFormat: () => request.format }),
    }),
    hasCachedObject: () => undefined,
    hasFeature: (name) => name === 'float32-filterable' && supportsFloat32,
  };
  textureManager.setDevice(device);
  return textureManager;
}

describe('vtkWebGPUTextureManager image data formats', () => {
  it.each([false, true])(
    'selects a stable format when float32 filter support is %s',
    (supportsFloat32) => {
      const textureManager = createTextureManager(supportsFloat32);

      const uint8Texture = textureManager.getTextureForImageData(
        createImageData(new Uint8Array([0, 255]))
      );
      expect(uint8Texture.getFormat()).toBe('r8unorm');

      const int8Texture = textureManager.getTextureForImageData(
        createImageData(new Int8Array([-128, 127]))
      );
      expect(int8Texture.getFormat()).toBe('r16float');

      const int16Image = createImageData(new Int16Array([-1, 1]));
      const int16Texture = textureManager.getTextureForImageData(int16Image);
      expect(int16Texture.getFormat()).toBe('r16float');

      const wideInt16Texture = textureManager.getTextureForImageData(
        createImageData(new Int16Array([-2049, 2049]))
      );
      expect(wideInt16Texture.getFormat()).toBe(
        supportsFloat32 ? 'r32float' : 'r16float'
      );

      const compactInt16Texture = textureManager.getTextureForImageData(
        int16Image,
        { preferSizeOverAccuracy: true }
      );
      expect(compactInt16Texture.getFormat()).toBe('r16float');

      const floatTexture = textureManager.getTextureForImageData(
        createImageData(new Float32Array([0.1, 0.2]))
      );
      expect(floatTexture.getFormat()).toBe('r16float');
    }
  );

  it('reuses the format memo when only image metadata is modified', () => {
    const values = new Int16Array([0, 4096]);
    const imageData = createImageData(values);
    const textureManager = createTextureManager(true);

    expect(textureManager.getTextureForImageData(imageData).getFormat()).toBe(
      'r32float'
    );

    values[1] = 1;
    imageData.setOrigin(1, 2, 3);
    expect(textureManager.getTextureForImageData(imageData).getFormat()).toBe(
      'r32float'
    );
  });

  it('checks the exact half precision values again after the image data changes', () => {
    const values = new Int16Array([0, 1]);
    const imageData = createImageData(values);
    const textureManager = createTextureManager(true);

    expect(textureManager.getTextureForImageData(imageData).getFormat()).toBe(
      'r16float'
    );

    values[1] = 4096;
    imageData.modified();
    expect(textureManager.getTextureForImageData(imageData).getFormat()).toBe(
      'r32float'
    );
  });

  it('uses the exact half precision format again while the image does not change', () => {
    const imageData = createImageData(new Int16Array([0, 1]));
    const textureManager = vtkWebGPUTextureManager.newInstance();
    let featureChecks = 0;
    textureManager.setDevice({
      getTextureManager: () => ({
        getTexture: (request) => ({ getFormat: () => request.format }),
      }),
      hasCachedObject: () => undefined,
      hasFeature: (name) => {
        if (name !== 'float32-filterable') {
          return false;
        }
        featureChecks++;
        return true;
      },
    });

    textureManager.getTextureForImageData(imageData);
    textureManager.getTextureForImageData(imageData);

    expect(featureChecks).toBe(1);
  });

  it('memoizes both size-preference variants for one scalar array', () => {
    const imageData = createImageData(new Int16Array([0, 4096]));
    const textureManager = vtkWebGPUTextureManager.newInstance();
    let featureChecks = 0;
    textureManager.setDevice({
      getTextureManager: () => ({
        getTexture: (request) => ({ getFormat: () => request.format }),
      }),
      hasCachedObject: () => undefined,
      hasFeature: (name) => {
        if (name !== 'float32-filterable') {
          return false;
        }
        featureChecks++;
        return true;
      },
    });

    expect(textureManager.getTextureForImageData(imageData).getFormat()).toBe(
      'r32float'
    );
    expect(
      textureManager
        .getTextureForImageData(imageData, {
          preferSizeOverAccuracy: true,
        })
        .getFormat()
    ).toBe('r16float');
    expect(textureManager.getTextureForImageData(imageData).getFormat()).toBe(
      'r32float'
    );
    expect(featureChecks).toBe(1);
  });

  it('uses half float storage for an empty scalar array', () => {
    const textureManager = createTextureManager(true);
    const texture = textureManager.getTextureForImageData(
      createImageData(new Float32Array())
    );

    expect(texture.getFormat()).toBe('r16float');
  });
});

describe('offset scalar texture uploads', () => {
  function createDevice() {
    const writeTexture = vi.fn();
    const device = vtkWebGPUDevice.newInstance();
    device.initialize({
      features: new Set(['float32-filterable']),
      createTexture: ({ format }) => ({ format }),
      queue: { writeTexture },
    });
    return { manager: device.getTextureManager(), writeTexture };
  }

  it.each([
    new Int16Array([-1024, 1, 3072]),
    new Uint16Array([61439, 62501, 65535]),
  ])('stores and updates a range spanning 4096 exactly', (values) => {
    const { manager, writeTexture } = createDevice();
    const image = createImageData(values);
    const options = { allowScalarOffset: true };
    const raw = manager.getTextureForImageData(image);
    const texture = manager.getTextureForImageData(image, options);
    const offset = texture.getScalarOffset();
    expect(raw.getHandle().format).toBe('r32float');
    expect(texture.getHandle().format).toBe('r16float');
    expect(manager.getTextureForImageData(image, options)).toBe(texture);
    expect(manager.getTextureForImageData(image)).toBe(raw);
    const data = writeTexture.mock.lastCall[1];
    expect(
      Array.from(data.subarray(0, 3), (v) => HalfFloat.fromHalf(v) + offset)
    ).toEqual(Array.from(values));

    const compact = manager.getTextureForImageData(image, {
      preferSizeOverAccuracy: true,
    });
    expect(compact.getFormat()).toBe('r16float');
    expect(compact.getScalarOffset()).toBe(0);
    expect(compact).not.toBe(texture);

    values[1]++;
    image.modified();
    const patch = {
      ...options,
      existingTexture: texture,
      updatedExtents: [[1, 1, 0, 0, 0, 0]],
    };
    expect(manager.getTextureForImageData(image, patch)).toBe(texture);
    const [destination, updated, , size] = writeTexture.mock.lastCall;
    expect(destination.origin.x).toBe(1);
    expect(size.width).toBe(1);
    expect(HalfFloat.fromHalf(updated[0]) + offset).toBe(values[1]);

    values[0]--;
    image.modified();
    const promoted = manager.getTextureForImageData(image, {
      ...patch,
      updatedExtents: [[0, 0, 0, 0, 0, 0]],
    });
    expect(promoted.getHandle().format).toBe('r32float');
    expect(promoted.getScalarOffset()).toBe(0);
    expect(Array.from(writeTexture.mock.lastCall[1].subarray(0, 3))).toEqual(
      Array.from(values)
    );
  });

  it('shares unshifted textures and reads in-place edits on full uploads', () => {
    const { manager } = createDevice();
    const values = new Int16Array([-2, 2]);
    const image = createImageData(values);
    const raw = manager.getTextureForImageData(image);
    expect(
      manager.getTextureForImageData(image, { allowScalarOffset: true })
    ).toBe(raw);

    const other = createImageData(values);
    other.getPointData().getScalars().getRange();
    values[1] = 3001;
    other.modified();
    const encoded = manager.getTextureForImageData(other, {
      allowScalarOffset: true,
    });
    expect(encoded.getFormat()).toBe('r16float');
    expect(encoded.getScalarOffset()).toBeGreaterThan(0);
    values[1] = 12000;
    other.modified();
    expect(
      manager
        .getTextureForImageData(other, { allowScalarOffset: true })
        .getFormat()
    ).toBe('r32float');
  });
  it.each([false, true])(
    'checks the full image after compact storage (previously shared: %s)',
    (shared) => {
      const { manager, writeTexture } = createDevice();
      const values = new Uint16Array([1001, shared ? 1002 : 3001]);
      const image = createImageData(values);
      if (shared) {
        manager.getTextureForImageData(image, { allowScalarOffset: true });
        values[1] = 3001;
        image.modified();
      }
      const compact = manager.getTextureForImageData(image, {
        preferSizeOverAccuracy: true,
      });
      values[0]++;
      image.modified();
      const accurate = manager.getTextureForImageData(image, {
        allowScalarOffset: true,
        existingTexture: compact,
        updatedExtents: [[0, 0, 0, 0, 0, 0]],
      });
      const [, data, , size] = writeTexture.mock.lastCall;
      expect(size.width).toBe(2);
      if (shared) {
        expect(accurate.getFormat()).toBe('r32float');
        expect(data[1]).toBe(3001);
      } else {
        expect(accurate.getFormat()).toBe('r16float');
        expect(HalfFloat.fromHalf(data[1]) + accurate.getScalarOffset()).toBe(
          3001
        );
      }
    }
  );
});
