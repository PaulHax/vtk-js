// Nearest-filtered data textures for indexed point attributes. Each texel holds
// one point; the final row is padded, without changing the input arrays.
export function createDataTextures() {
  let renderWindow = null;
  let gl = null;
  let maxSize = 0;
  const textures = new Map();

  const release = () => {
    textures.forEach((texture) => {
      if (!renderWindow.isDeleted()) {
        renderWindow.deactivateTexture(texture);
      }
      gl.deleteTexture(texture.handle);
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
      gl.deleteTexture(texture.handle);
      textures.delete(name);
    }
  };

  const upload = (name, data, components, ranges = null) => {
    if (!data || !data.length) {
      remove(name);
      return false;
    }
    const count = data.length / components;
    const width = Math.min(maxSize, count);
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
      texture = { handle: gl.createTexture(), width: 0, height: 0 };
      textures.set(name, texture);
    }
    renderWindow.activateTexture(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture.handle);
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
    // All supported texels are a multiple of four bytes.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const uploadRows = (first, length) => {
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
          data.subarray(cursor * components, (cursor + tuples) * components)
        );
        cursor += tuples;
        remaining -= tuples;
      }
    };
    const updates = allocate || !ranges ? [[0, count]] : ranges;
    updates.forEach(([first, length]) => uploadRows(first, length));
    texture.bytes = width * height * components * data.BYTES_PER_ELEMENT;
    renderWindow.deactivateTexture(texture);
    return true;
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
