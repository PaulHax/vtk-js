const uploadBatches = new WeakMap();

function uploadState(gl) {
  const unit = gl.getParameter(gl.ACTIVE_TEXTURE);
  let binding = gl.getParameter(gl.TEXTURE_BINDING_2D);
  const unpackBuffer = gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING);
  const unpack = [
    [gl.UNPACK_ALIGNMENT, 4],
    [gl.UNPACK_FLIP_Y_WEBGL, false],
    [gl.UNPACK_ROW_LENGTH, 0],
    [gl.UNPACK_SKIP_PIXELS, 0],
    [gl.UNPACK_SKIP_ROWS, 0],
  ];
  const previousUnpack = unpack.map(([key]) => gl.getParameter(key));
  return {
    bind(handle) {
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      unpack.forEach(([key, value]) => gl.pixelStorei(key, value));
    },
    forgetDeleted(handle) {
      if (handle === binding) binding = null;
    },
    restore() {
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, binding);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpackBuffer);
      unpack.forEach(([key], index) =>
        gl.pixelStorei(key, previousUnpack[index])
      );
    },
  };
}

/** Reuse the caller's saved texture and pixel-store state for this drain. */
export function withPointTextureUploads(window, run) {
  const gl = window?.getContext();
  if (!gl || gl.isContextLost() || uploadBatches.has(gl)) return run();
  const batch = { state: null };
  uploadBatches.set(gl, batch);
  try {
    return run();
  } finally {
    uploadBatches.delete(gl);
    batch.state?.restore();
  }
}

// Nearest-filtered data textures for indexed point attributes. Each texel holds
// one point; the final row is padded, without changing the input arrays.
export function createDataTextures() {
  let renderWindow = null;
  let gl = null;
  let maxSize = 0;
  const textures = new Map();

  const deleteTexture = (texture) => {
    uploadBatches.get(gl)?.state?.forgetDeleted(texture.handle);
    gl.deleteTexture(texture.handle);
  };

  const release = () => {
    textures.forEach((texture) => {
      if (!renderWindow.isDeleted()) {
        renderWindow.deactivateTexture(texture);
      }
      deleteTexture(texture);
    });
    textures.clear();
  };

  const setRenderWindow = (window) => {
    if (renderWindow === window && gl === window.getContext()) return;
    release();
    renderWindow = window;
    gl = window.getContext();
    maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  };

  const remove = (name) => {
    const texture = textures.get(name);
    if (texture) {
      renderWindow.deactivateTexture(texture);
      deleteTexture(texture);
      textures.delete(name);
    }
  };

  const upload = (name, data, components, ranges = null, capacity = null) => {
    if (!data || !data.length) {
      remove(name);
      return false;
    }
    const count = capacity ?? data.length / components;
    // The staged atlas capacity is a power of two. A power-of-two row width
    // avoids uncharged row padding even on a context with an unusual limit.
    const rowLimit =
      capacity === null ? maxSize : 2 ** Math.floor(Math.log2(maxSize));
    const width = Math.min(rowLimit, count);
    const height = Math.ceil(count / width);
    if (height > maxSize) {
      throw new Error('Point attributes exceed the maximum data texture size.');
    }
    const integer = data instanceof Uint32Array;
    const bytes = data instanceof Uint8Array;
    const internalFormat = integer
      ? gl.R32UI
      : bytes
        ? gl.RGBA8
        : [gl.R32F, gl.RG32F, gl.RGB32F, gl.RGBA32F][components - 1];
    const format = integer
      ? gl.RED_INTEGER
      : [gl.RED, gl.RG, gl.RGB, gl.RGBA][components - 1];
    const type = integer
      ? gl.UNSIGNED_INT
      : bytes
        ? gl.UNSIGNED_BYTE
        : gl.FLOAT;
    let texture = textures.get(name);
    if (!texture) {
      const handle = gl.createTexture();
      if (!handle) throw new Error('Could not allocate point texture.');
      texture = { handle, width: 0, height: 0 };
      textures.set(name, texture);
    }
    const batch = uploadBatches.get(gl);
    const state = batch ? (batch.state ??= uploadState(gl)) : uploadState(gl);
    state.bind(texture.handle);
    try {
      const allocate =
        texture.width !== width ||
        texture.height !== height ||
        texture.internalFormat !== internalFormat;
      if (allocate) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          internalFormat,
          width,
          height,
          0,
          format,
          type,
          null
        );
        Object.assign(texture, { width, height, internalFormat });
      }
      const uploadRows = (first, length, source = first) => {
        let cursor = first;
        let remaining = length;
        while (remaining > 0) {
          const x = cursor % width;
          const y = Math.floor(cursor / width);
          const rows = x === 0 ? Math.floor(remaining / width) : 0;
          const rowWidth = rows ? width : Math.min(width - x, remaining);
          const rowCount = rows || 1;
          const tuples = rowWidth * rowCount;
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            x,
            y,
            rowWidth,
            rowCount,
            format,
            type,
            data.subarray(source * components, (source + tuples) * components)
          );
          source += tuples;
          cursor += tuples;
          remaining -= tuples;
        }
      };
      // A staged upload can allocate storage and initialize just its supplied
      // range. A legacy upload must initialize the full newly allocated texture.
      const updates =
        (capacity === null && allocate) || !ranges ? [[0, count]] : ranges;
      updates.forEach(([first, length, source]) =>
        uploadRows(first, length, source)
      );
      texture.bytes = width * height * components * data.BYTES_PER_ELEMENT;
      return true;
    } finally {
      if (!batch) state.restore();
    }
  };

  const bind = (program) => {
    textures.forEach((texture, name) => {
      if (program.isUniformUsed(name)) {
        renderWindow.activateTexture(texture);
        gl.bindTexture(gl.TEXTURE_2D, texture.handle);
        program.setUniformi(
          name,
          renderWindow.getTextureUnitForTexture(texture)
        );
      }
    });
  };

  const unbind = () =>
    textures.forEach((texture) => renderWindow.deactivateTexture(texture));

  return {
    setRenderWindow,
    upload,
    bind,
    unbind,
    release,
    getAllocatedGPUMemoryInBytes: () =>
      Array.from(textures.values()).reduce(
        (total, texture) => total + texture.bytes,
        0
      ),
  };
}

/** Owns the staged texture handles until the caller releases this bank. */
export function createPointTextureBank(renderWindow) {
  const textures = createDataTextures();
  textures.setRenderWindow(renderWindow);
  return {
    ...textures,
    write(name, data, components, capacity, first, count, source = first) {
      textures.upload(
        name,
        data,
        components,
        [[first, count, source]],
        capacity
      );
    },
  };
}
