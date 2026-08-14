/* eslint-disable no-bitwise */
import macro from 'vtk.js/Sources/macros';

const COMPRESSED_FORMATS = new Set([
  'astc-4x4',
  'bc7',
  'etc2-rgba8',
  's3tc-dxt5',
]);
const MAG_FILTERS = new Set(['nearest', 'linear']);
const MIN_FILTERS = new Set([
  'nearest',
  'linear',
  'nearest-mipmap-nearest',
  'linear-mipmap-nearest',
  'nearest-mipmap-linear',
  'linear-mipmap-linear',
]);
const WRAP_MODES = new Set(['clamp-to-edge', 'mirrored-repeat', 'repeat']);

function cloneSampler(sampler) {
  if (sampler === null) return null;
  if (!sampler || typeof sampler !== 'object') {
    throw new TypeError('texture sampler must be an object or null');
  }
  if (!MAG_FILTERS.has(sampler.magFilter)) {
    throw new TypeError(`unsupported texture magFilter: ${sampler.magFilter}`);
  }
  if (!MIN_FILTERS.has(sampler.minFilter)) {
    throw new TypeError(`unsupported texture minFilter: ${sampler.minFilter}`);
  }
  if (!WRAP_MODES.has(sampler.wrapS) || !WRAP_MODES.has(sampler.wrapT)) {
    throw new TypeError('unsupported texture wrap mode');
  }
  return {
    magFilter: sampler.magFilter,
    minFilter: sampler.minFilter,
    wrapS: sampler.wrapS,
    wrapT: sampler.wrapT,
  };
}

function samplerEquals(left, right) {
  return (
    left === right ||
    (left &&
      right &&
      left.magFilter === right.magFilter &&
      left.minFilter === right.minFilter &&
      left.wrapS === right.wrapS &&
      left.wrapT === right.wrapT)
  );
}

function assertPositiveInteger(value, name) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite integer`);
  }
}

function compressedLevelByteLength(width, height) {
  return Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
}

function cloneCompressedData(payload) {
  if (payload === null) {
    return null;
  }
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('compressed data must be an object or null');
  }
  if (!COMPRESSED_FORMATS.has(payload.format)) {
    throw new TypeError(
      `unsupported compressed texture format: ${payload.format}`
    );
  }
  assertPositiveInteger(payload.width, 'compressed texture width');
  assertPositiveInteger(payload.height, 'compressed texture height');
  if (typeof payload.srgb !== 'boolean') {
    throw new TypeError('compressed texture srgb must be a boolean');
  }
  if (!Array.isArray(payload.levels) || payload.levels.length === 0) {
    throw new TypeError('compressed texture levels must be a non-empty array');
  }

  const maximumLevelCount =
    Math.floor(Math.log2(Math.max(payload.width, payload.height))) + 1;
  if (payload.levels.length > maximumLevelCount) {
    throw new TypeError('compressed texture has levels beyond 1x1');
  }

  let expectedWidth = payload.width;
  let expectedHeight = payload.height;
  const levels = payload.levels.map((level, index) => {
    if (!level || typeof level !== 'object') {
      throw new TypeError(
        `compressed texture level ${index} must be an object`
      );
    }
    assertPositiveInteger(
      level.width,
      `compressed texture level ${index} width`
    );
    assertPositiveInteger(
      level.height,
      `compressed texture level ${index} height`
    );
    if (level.width !== expectedWidth || level.height !== expectedHeight) {
      throw new TypeError(
        `compressed texture level ${index} must be ${expectedWidth}x${expectedHeight}`
      );
    }
    if (!(level.data instanceof Uint8Array)) {
      throw new TypeError(
        `compressed texture level ${index} data must be a Uint8Array`
      );
    }
    const expectedByteLength = compressedLevelByteLength(
      level.width,
      level.height
    );
    if (level.data.byteLength !== expectedByteLength) {
      throw new TypeError(
        `compressed texture level ${index} data must contain ${expectedByteLength} bytes`
      );
    }
    const result = {
      width: level.width,
      height: level.height,
      data: new Uint8Array(level.data),
    };
    expectedWidth = Math.max(1, expectedWidth >> 1);
    expectedHeight = Math.max(1, expectedHeight >> 1);
    return result;
  });

  return {
    format: payload.format,
    width: payload.width,
    height: payload.height,
    srgb: payload.srgb,
    levels,
  };
}

function compressedDataEquals(left, right) {
  if (left === right) {
    return true;
  }
  if (
    !left ||
    !right ||
    left.format !== right.format ||
    left.width !== right.width ||
    left.height !== right.height ||
    left.srgb !== right.srgb ||
    left.levels.length !== right.levels.length
  ) {
    return false;
  }
  return left.levels.every((level, index) => {
    const other = right.levels[index];
    if (
      level.width !== other.width ||
      level.height !== other.height ||
      level.data.byteLength !== other.data.byteLength
    ) {
      return false;
    }
    return level.data.every(
      (value, byteIndex) => value === other.data[byteIndex]
    );
  });
}

// ----------------------------------------------------------------------------
// vtkTexture methods
// ----------------------------------------------------------------------------

function vtkTexture(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkTexture');

  function clearPendingImageListener() {
    if (model.image && !model.imageLoaded) {
      model.image.removeEventListener?.('load', publicAPI.imageLoaded);
    }
  }

  function clearCompressedDataForSource(source) {
    if (source !== null && model.compressedData !== null) {
      model.compressedData = null;
      return true;
    }
    return false;
  }

  function clearImageSourcesForPipeline(source) {
    if (source === null) {
      return false;
    }
    const hadSource =
      model.image !== null ||
      model.canvas !== null ||
      model.jsImageData !== null ||
      model.imageBitmap !== null ||
      model.compressedData !== null;
    clearPendingImageListener();
    model.image = null;
    model.canvas = null;
    model.jsImageData = null;
    model.imageBitmap = null;
    model.compressedData = null;
    model.imageLoaded = false;
    return hadSource;
  }

  publicAPI.imageLoaded = () => {
    model.image.removeEventListener('load', publicAPI.imageLoaded);
    model.imageLoaded = true;
    publicAPI.modified();
  };

  publicAPI.setJsImageData = (imageData) => {
    if (model.jsImageData === imageData) {
      return;
    }

    // clear other entries
    if (imageData !== null) {
      publicAPI.setInputData(null);
      publicAPI.setInputConnection(null);
      clearPendingImageListener();
      model.image = null;
      model.canvas = null;
      model.imageBitmap = null;
      clearCompressedDataForSource(imageData);
    }

    model.jsImageData = imageData;
    model.imageLoaded = true;
    publicAPI.modified();
  };

  publicAPI.setImageBitmap = (imageBitmap) => {
    if (model.imageBitmap === imageBitmap) {
      return;
    }

    // clear other entries
    if (imageBitmap !== null) {
      publicAPI.setInputData(null);
      publicAPI.setInputConnection(null);
      clearPendingImageListener();
      model.image = null;
      model.canvas = null;
      model.jsImageData = null;
      clearCompressedDataForSource(imageBitmap);
    }

    model.imageBitmap = imageBitmap;
    model.imageLoaded = true;

    publicAPI.modified();
  };

  publicAPI.setCanvas = (canvas) => {
    if (model.canvas === canvas) {
      return;
    }

    // clear other entries
    if (canvas !== null) {
      publicAPI.setInputData(null);
      publicAPI.setInputConnection(null);
      clearPendingImageListener();
      model.image = null;
      model.imageBitmap = null;
      model.jsImageData = null;
      clearCompressedDataForSource(canvas);
    }

    model.canvas = canvas;
    publicAPI.modified();
  };

  publicAPI.setImage = (image) => {
    if (model.image === image) {
      return;
    }

    // clear other entries
    if (image !== null) {
      publicAPI.setInputData(null);
      publicAPI.setInputConnection(null);
      clearPendingImageListener();
      model.canvas = null;
      model.jsImageData = null;
      model.imageBitmap = null;
      clearCompressedDataForSource(image);
    }

    model.image = image;
    model.imageLoaded = false;

    if (image.complete) {
      publicAPI.imageLoaded();
    } else {
      image.addEventListener('load', publicAPI.imageLoaded);
    }

    publicAPI.modified();
  };

  const setInputData = publicAPI.setInputData;
  publicAPI.setInputData = (data, port = 0) => {
    const validPort = Number.isInteger(port) && port >= 0;
    if (!validPort) {
      return;
    }
    if (
      data !== null &&
      !publicAPI.isDeleted() &&
      port < model.numberOfInputs
    ) {
      clearImageSourcesForPipeline(data);
    }
    setInputData(data, port);
  };

  const setInputConnection = publicAPI.setInputConnection;
  publicAPI.setInputConnection = (connection, port = 0) => {
    const validPort = Number.isInteger(port) && port >= 0;
    if (!validPort) {
      return;
    }
    const cleared =
      connection !== null &&
      !publicAPI.isDeleted() &&
      port < model.numberOfInputs
        ? clearImageSourcesForPipeline(connection)
        : false;
    setInputConnection(connection, port);
    if (cleared) {
      publicAPI.modified();
    }
  };

  function getPortToFill() {
    let port = model.numberOfInputs;
    while (
      port &&
      !model.inputData[port - 1] &&
      !model.inputConnection[port - 1]
    ) {
      port -= 1;
    }
    if (port === model.numberOfInputs) {
      model.numberOfInputs += 1;
    }
    return port;
  }

  publicAPI.addInputData = (data) =>
    publicAPI.setInputData(data, getPortToFill());
  publicAPI.addInputConnection = (connection) =>
    publicAPI.setInputConnection(connection, getPortToFill());

  publicAPI.hasCompressedData = () => model.compressedData !== null;

  publicAPI.isCompressedDataComplete = () => {
    const lastLevel = model.compressedData?.levels.at(-1);
    return lastLevel?.width === 1 && lastLevel?.height === 1;
  };

  publicAPI.getCompressedData = () => cloneCompressedData(model.compressedData);

  publicAPI.getSampler = () => cloneSampler(model.sampler);

  publicAPI.setSampler = (sampler) => {
    const next = cloneSampler(sampler);
    if (samplerEquals(model.sampler, next)) return false;
    model.sampler = next;
    publicAPI.modified();
    return true;
  };

  publicAPI.setCompressedData = (payload) => {
    const next = cloneCompressedData(payload);
    if (compressedDataEquals(model.compressedData, next)) {
      return false;
    }

    if (next !== null) {
      clearPendingImageListener();
      model.inputData.fill(null);
      model.inputConnection.fill(null);
      model.image = null;
      model.canvas = null;
      model.jsImageData = null;
      model.imageBitmap = null;
      model.imageLoaded = false;
    }
    model.compressedData = next;
    publicAPI.modified();
    return true;
  };

  publicAPI.clearCompressedData = () => publicAPI.setCompressedData(null);

  publicAPI.getDimensionality = () => {
    let width = 0;
    let height = 0;
    let depth = 1;

    if (publicAPI.getInputData()) {
      const data = publicAPI.getInputData();
      width = data.getDimensions()[0];
      height = data.getDimensions()[1];
      depth = data.getDimensions()[2];
    }
    if (model.jsImageData) {
      width = model.jsImageData.width;
      height = model.jsImageData.height;
    }
    if (model.canvas) {
      width = model.canvas.width;
      height = model.canvas.height;
    }
    if (model.image) {
      width = model.image.width;
      height = model.image.height;
    }
    if (model.imageBitmap) {
      width = model.imageBitmap.width;
      height = model.imageBitmap.height;
    }
    if (model.compressedData) {
      width = model.compressedData.width;
      height = model.compressedData.height;
    }

    const dimensionality = (width > 1) + (height > 1) + (depth > 1);
    return dimensionality;
  };

  publicAPI.getInputAsJsImageData = () => {
    if (!model.imageLoaded || publicAPI.getInputData()) return null;

    if (model.jsImageData) {
      return model.jsImageData;
    }

    if (model.imageBitmap) {
      return model.imageBitmap;
    }

    if (model.canvas) {
      const context = model.canvas.getContext('2d');
      const imageData = context.getImageData(
        0,
        0,
        model.canvas.width,
        model.canvas.height
      );
      return imageData;
    }

    if (model.image) {
      const width = model.image.width;
      const height = model.image.height;
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      context.translate(0, height);
      context.scale(1, -1);
      context.drawImage(model.image, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      return imageData;
    }

    return null;
  };
}

/**
 * Generates mipmaps for a given GPU texture using a compute shader.
 *
 * This function iteratively generates each mip level for the provided texture,
 * using a bilinear downsampling compute shader implemented in WGSL. It creates
 * the necessary pipeline, bind groups, and dispatches compute passes for each
 * mip level.
 *
 * @param {GPUDevice} device - The WebGPU device used to create resources and submit commands.
 * @param {GPUTexture} texture - The GPU texture for which mipmaps will be generated. Must be created with mip levels.
 * @param {number} mipLevelCount - The total number of mip levels to generate (including the base level).
 */
const generateMipmaps = (device, texture, mipLevelCount) => {
  const computeShaderCode = `
    @group(0) @binding(0) var inputTexture: texture_2d<f32>;
    @group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;

    @compute @workgroup_size(8, 8)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
      let texelCoord = vec2<i32>(global_id.xy);
      let outputSize = textureDimensions(outputTexture);

      if (texelCoord.x >= i32(outputSize.x) || texelCoord.y >= i32(outputSize.y)) {
        return;
      }

      let inputSize = textureDimensions(inputTexture);
      let scale = vec2<f32>(inputSize) / vec2<f32>(outputSize);

      // Compute the floating-point source coordinate
      let srcCoord = (vec2<f32>(texelCoord) + 0.5) * scale - 0.5;

      // Get integer coordinates for the four surrounding texels
      let x0 = i32(floor(srcCoord.x));
      let x1 = min(x0 + 1, i32(inputSize.x) - 1);
      let y0 = i32(floor(srcCoord.y));
      let y1 = min(y0 + 1, i32(inputSize.y) - 1);

      // Compute the weights
      let wx = srcCoord.x - f32(x0);
      let wy = srcCoord.y - f32(y0);

      // Fetch the four texels
      let c00 = textureLoad(inputTexture, vec2<i32>(x0, y0), 0);
      let c10 = textureLoad(inputTexture, vec2<i32>(x1, y0), 0);
      let c01 = textureLoad(inputTexture, vec2<i32>(x0, y1), 0);
      let c11 = textureLoad(inputTexture, vec2<i32>(x1, y1), 0);

      // Bilinear interpolation
      let color = mix(
        mix(c00, c10, wx),
        mix(c01, c11, wx),
        wy
      );

      textureStore(outputTexture, texelCoord, color);
    }
  `;

  const computeShader = device.createShaderModule({
    code: computeShaderCode,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        // eslint-disable-next-line no-undef
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'float' },
      },
      {
        binding: 1,
        // eslint-disable-next-line no-undef
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { format: 'rgba8unorm', access: 'write-only' },
      },
      {
        binding: 2,
        // eslint-disable-next-line no-undef
        visibility: GPUShaderStage.COMPUTE,
        sampler: { type: 'filtering' },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'ComputeMipmapPipeline',
    layout: pipelineLayout,
    compute: {
      module: computeShader,
      entryPoint: 'main',
    },
  });

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // Generate each mip level
  for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel++) {
    const srcView = texture.createView({
      baseMipLevel: mipLevel - 1,
      mipLevelCount: 1,
    });

    const dstView = texture.createView({
      baseMipLevel: mipLevel,
      mipLevelCount: 1,
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: dstView },
        { binding: 2, resource: sampler },
      ],
    });

    const commandEncoder = device.createCommandEncoder({
      label: `MipmapGenerateCommandEncoder`,
    });
    const computePass = commandEncoder.beginComputePass();

    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);

    const mipWidth = Math.max(1, texture.width >> mipLevel);
    const mipHeight = Math.max(1, texture.height >> mipLevel);
    const workgroupsX = Math.ceil(mipWidth / 8);
    const workgroupsY = Math.ceil(mipHeight / 8);

    computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
    computePass.end();

    device.queue.submit([commandEncoder.finish()]);
  }
};

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  image: null,
  canvas: null,
  jsImageData: null,
  imageBitmap: null,
  compressedData: null,
  sampler: null,
  imageLoaded: false,
  repeat: false,
  interpolate: false,
  edgeClamp: false,
  flipY: true,
  mipLevel: 0,
  resizable: false, // must be set at construction time if the texture can be resizable
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  const supportedValues = { ...initialValues };
  delete supportedValues.compressedData;
  delete supportedValues.sampler;
  Object.assign(model, DEFAULT_VALUES, supportedValues);

  // Build VTK API
  macro.obj(publicAPI, model);
  macro.algo(publicAPI, model, 6, 0);

  macro.get(publicAPI, model, [
    'canvas',
    'image',
    'jsImageData',
    'imageBitmap',
    'imageLoaded',
    'resizable',
  ]);

  macro.setGet(publicAPI, model, [
    'repeat',
    'edgeClamp',
    'interpolate',
    'flipY',
    'mipLevel',
  ]);

  vtkTexture(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkTexture');
export const STATIC = { generateMipmaps };

// ----------------------------------------------------------------------------

export default { newInstance, extend, ...STATIC };
