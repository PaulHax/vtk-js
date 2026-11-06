import { describe, expect, it, onTestFinished } from 'vitest';

import vtkWebGPUDevice from 'vtk.js/Sources/Rendering/WebGPU/Device';
import vtkWebGPUTexture from 'vtk.js/Sources/Rendering/WebGPU/Texture';

function createTexture(format, destroyed = []) {
  const writes = [];
  const handle = {
    createTexture: () => ({
      createView: () => ({}),
      destroy: () => destroyed.push(format),
    }),
    queue: {
      writeTexture: (...args) => writes.push(args),
    },
  };
  const texture = vtkWebGPUTexture.newInstance();
  texture.create(
    {
      getHandle: () => handle,
      hasFeature: (name) => name === 'float32-filterable',
    },
    { width: 2, height: 1, depth: 1, format, usage: 1 }
  );
  return { texture, writes };
}

describe('vtkWebGPUTexture normalized 16 bit formats', () => {
  it.each([
    ['r16snorm', Int16Array, [-32767, 1234], 32767],
    ['r16unorm', Uint16Array, [65535, 1234], 65535],
  ])(
    'uploads %s integer values from native and float sources',
    (format, ArrayType, values, scale) => {
      const { texture, writes } = createTexture(format);
      texture.writeImageData({
        nativeArray: new ArrayType(values),
        width: 2,
        height: 1,
        depth: 1,
      });

      texture.writeSubImageData({
        x: 1,
        width: 1,
        nativeArray: new Float32Array([values[0]]),
      });

      expect(writes).toHaveLength(2);
      const upload = writes[0][1];
      expect(upload).toBeInstanceOf(ArrayType);
      expect(Array.from(upload.subarray(0, 2))).toEqual(values);
      const patch = writes[1][1];
      expect(patch).toBeInstanceOf(ArrayType);
      expect(patch[0]).toBe(values[0]);
      expect(texture.getScale()).toBe(scale);
      const view = texture.createView('scalars');
      expect(view.getBindGroupLayoutEntry().texture.sampleType).toBe(
        'unfilterable-float'
      );
    }
  );

  it('destroys its GPU texture', () => {
    const destroyed = [];
    const { texture } = createTexture('r16float', destroyed);
    texture.destroy();

    expect(destroyed).toEqual(['r16float']);
    expect(texture.getHandle()).toBe(null);
  });
});

it.skipIf(!__VTK_TEST_WEBGPU__).for([false, true])(
  'binds tier1 normalized texture views with float32 filtering %s',
  async (float32Filterable, { skip }) => {
    const adapter = await navigator.gpu.requestAdapter();
    expect(adapter).not.toBeNull();
    const requiredFeatures = ['texture-formats-tier1'];
    if (float32Filterable) requiredFeatures.push('float32-filterable');
    for (const feature of requiredFeatures) {
      skip(!adapter.features.has(feature), `${feature} unavailable`);
    }
    const handle = await adapter.requestDevice({ requiredFeatures });
    onTestFinished(() => handle.destroy());
    const device = vtkWebGPUDevice.newInstance();
    device.initialize(handle);

    for (const prefix of ['r', 'rg', 'rgba']) {
      for (const [suffix, sampleType] of [
        ['16snorm', 'unfilterable-float'],
        ['16unorm', 'unfilterable-float'],
        ['32float', float32Filterable ? 'float' : 'unfilterable-float'],
      ]) {
        const format = prefix + suffix;
        const texture = vtkWebGPUTexture.newInstance();
        texture.create(device, { width: 1, height: 1, format });
        const view = texture.createView('scalars');
        const entry = view.getBindGroupLayoutEntry();
        expect(entry.texture.sampleType, format).toBe(sampleType);
        handle.pushErrorScope('validation');
        handle.createBindGroup({
          layout: handle.createBindGroupLayout({
            entries: [{ binding: 0, ...entry }],
          }),
          entries: [{ binding: 0, ...view.getBindGroupEntry() }],
        });
        expect(await handle.popErrorScope(), format).toBeNull();
        texture.destroy();
      }
    }
  }
);
