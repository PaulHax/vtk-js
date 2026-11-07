import { expect, it, onTestFinished } from 'vitest';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkWebGPUDevice from 'vtk.js/Sources/Rendering/WebGPU/Device';

/* eslint-disable no-undef, no-bitwise */
const compactOptions = {
  allowScalarEncoding: true,
  preferSizeOverAccuracy: true,
};

async function createDevice(ctx, tier1 = false) {
  const adapter = await navigator.gpu.requestAdapter();
  expect(adapter).not.toBeNull();
  if (tier1 && !adapter.features.has('texture-formats-tier1')) {
    ctx.skip('texture-formats-tier1 unavailable');
  }
  const handle = await adapter.requestDevice({
    requiredFeatures: tier1 ? ['texture-formats-tier1'] : [],
  });
  onTestFinished(() => handle.destroy());
  const device = vtkWebGPUDevice.newInstance();
  device.initialize(handle);
  return device;
}

function createImage(values) {
  const image = vtkImageData.newInstance();
  image.setDimensions(1, 1, values.length);
  image.getPointData().setScalars(vtkDataArray.newInstance({ values }));
  return image;
}

// Read each texel center and the interpolated value halfway through the volume.
async function sampleTexture(device, texture) {
  const handle = device.getHandle();
  const depth = texture.getDepth();
  const size = (depth + 1) * 4;
  handle.pushErrorScope('validation');
  const output = handle.createBuffer({
    size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readback = handle.createBuffer({
    size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const decoding = handle.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  handle.queue.writeBuffer(
    decoding,
    0,
    new Float32Array([texture.getScalarScale(), texture.getScalarOffset()])
  );
  const pipeline = await handle.createComputePipelineAsync({
    layout: 'auto',
    compute: {
      module: handle.createShaderModule({
        code: `
          @group(0) @binding(0) var image: texture_3d<f32>;
          @group(0) @binding(1) var linearSampler: sampler;
          @group(0) @binding(2) var<storage, read_write> result: array<f32>;
          @group(0) @binding(3) var<uniform> decoding: vec2<f32>;
          @compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id: vec3<u32>) {
            let z = select((f32(id.x) + 0.5) / ${depth}.0, 0.5, id.x == ${depth}u);
            let value = textureSampleLevel(image, linearSampler, vec3f(0.5, 0.5, z), 0).r;
            result[id.x] = value * decoding.x + decoding.y;
          }`,
      }),
      entryPoint: 'main',
    },
  });
  const bindings = handle.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: texture.getHandle().createView() },
      {
        binding: 1,
        resource: handle.createSampler({
          minFilter: 'linear',
          magFilter: 'linear',
        }),
      },
      { binding: 2, resource: { buffer: output } },
      { binding: 3, resource: { buffer: decoding } },
    ],
  });
  const encoder = handle.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindings);
  pass.dispatchWorkgroups(depth + 1);
  pass.end();
  encoder.copyBufferToBuffer(output, 0, readback, 0, size);
  handle.queue.submit([encoder.finish()]);
  expect(await handle.popErrorScope()).toBeNull();
  await readback.mapAsync(GPUMapMode.READ);
  const result = Array.from(new Float32Array(readback.getMappedRange()));
  readback.unmap();
  output.destroy();
  readback.destroy();
  decoding.destroy();
  return result;
}

it.skipIf(!__VTK_TEST_WEBGPU__).for([false, true])(
  'linearly samples the full 16-bit scalar range in compact storage (tier1: %s)',
  async (tier1, ctx) => {
    const device = await createDevice(ctx, tier1);
    const manager = device.getTextureManager();
    for (const values of [
      new Uint16Array([0, 0, 65535, 65535]),
      new Int16Array([-32768, -32768, 32767, 32767]),
    ]) {
      const image = createImage(values);
      const texture = manager.getTextureForImageData(image, compactOptions);
      expect(texture.getFormat()).toBe('r16float');
      expect(manager.getTextureForImageData(image, compactOptions)).toBe(
        texture
      );
      expect(await sampleTexture(device, texture)).toEqual([
        ...values,
        (values[0] + values[3]) / 2,
      ]);
    }
  }
);

it.skipIf(!__VTK_TEST_WEBGPU__)(
  'preserves untouched samples when a partial update expands the compact range',
  async (ctx) => {
    const device = await createDevice(ctx);
    const manager = device.getTextureManager();
    const values = new Int16Array([-10000, 0, 10000, 0]);
    const image = createImage(values);
    const texture = manager.getTextureForImageData(image, compactOptions);
    values[3] = 5000;
    image.modified();
    const patched = manager.getTextureForImageData(image, {
      ...compactOptions,
      existingTexture: texture,
      updatedExtents: [[0, 0, 0, 0, 3, 3]],
    });
    expect(patched).toBe(texture);
    expect(await sampleTexture(device, patched)).toEqual([
      -10000, 0, 10000, 5000, 5000,
    ]);

    values[2] = 30000;
    image.modified();
    const expanded = manager.getTextureForImageData(image, {
      ...compactOptions,
      existingTexture: patched,
      updatedExtents: [[0, 0, 0, 0, 2, 2]],
    });
    expect(await sampleTexture(device, expanded)).toEqual([
      -10000, 0, 30000, 5000, 15000,
    ]);
    expect(manager.getTextureForImageData(image, compactOptions)).toBe(
      expanded
    );

    values[0] = -5000;
    image.modified();
    const rewritten = manager.getTextureForImageData(image, compactOptions);
    expect(rewritten).toBe(expanded);
    expect(await sampleTexture(device, rewritten)).toEqual([
      -5000, 0, 30000, 5000, 15000,
    ]);
  }
);

it.skipIf(!__VTK_TEST_WEBGPU__)(
  'expands a constant compact volume and separates encoded and raw consumers',
  async (ctx) => {
    const device = await createDevice(ctx);
    const manager = device.getTextureManager();
    const values = new Uint16Array(4);
    const image = createImage(values);
    const empty = manager.getTextureForImageData(image, compactOptions);
    expect(await sampleTexture(device, empty)).toEqual([0, 0, 0, 0, 0]);
    values[3] = 65535;
    image.modified();
    const filled = manager.getTextureForImageData(image, {
      ...compactOptions,
      existingTexture: empty,
      updatedExtents: [[0, 0, 0, 0, 3, 3]],
    });
    expect(await sampleTexture(device, filled)).toEqual([0, 0, 0, 65535, 0]);

    const signedImage = createImage(new Int16Array([-10000, 10000]));
    const encoded = manager.getTextureForImageData(signedImage, compactOptions);
    const raw = manager.getTextureForImageData(signedImage);
    expect(raw).not.toBe(encoded);
    expect(raw.getScalarScale()).toBe(1);
    expect(raw.getScalarOffset()).toBe(0);
    expect(await sampleTexture(device, raw)).toEqual([-10000, 10000, 0]);
    expect(await sampleTexture(device, encoded)).toEqual([-10000, 10000, 0]);
  }
);
