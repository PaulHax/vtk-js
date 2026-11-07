import macro from 'vtk.js/Sources/macros';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkWebGPUTexture from 'vtk.js/Sources/Rendering/WebGPU/Texture';
import vtkWebGPUTypes from 'vtk.js/Sources/Rendering/WebGPU/Types';

const { VtkDataTypes } = vtkDataArray;

// ----------------------------------------------------------------------------
// Global methods
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// vtkWebGPUTextureManager methods
// ----------------------------------------------------------------------------

const HALF_FLOAT_EXACT_INTEGER_LIMIT = 2048;

// This feature adds the r16unorm and r16snorm formats (and their rg and rgba
// forms), which store 16 bit integers in 2 bytes.
const NORMALIZED_16_BIT_FEATURE = 'texture-formats-tier1';

// ----------------------------------------------------------------------------

function vtkWebGPUTextureManager(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkWebGPUTextureManager');

  function _formatPrefix(numberOfComponents) {
    switch (numberOfComponents) {
      case 1:
        return 'r';
      case 2:
        return 'rg';
      default:
        return 'rgba';
    }
  }

  // The normalized 16 bit format for this data type, or null.
  // r16snorm samples max(v / 32767, -1). All values are exact, but -32768
  // reads as -32767.
  function _normalized16BitSuffix(dataType) {
    if (!model.device.hasFeature(NORMALIZED_16_BIT_FEATURE)) {
      return null;
    }
    if (dataType === VtkDataTypes.SHORT) {
      return '16snorm';
    }
    if (dataType === VtkDataTypes.UNSIGNED_SHORT) {
      return '16unorm';
    }
    return null;
  }

  // The state has two parts. The first part is valid for one scalar mtime.
  // The second part stays for the life of the data array:
  //  - scalarOffset and scalarScale describe the encoding. Compact uploads
  //    retain it until the range grows, then rewrite the entire texture.
  //  - promotedFormat is the 32 bit float format that an accurate texture of
  //    this array uses after its values stopped fitting half float. All
  //    mappers of the array then use this format and can share one texture.
  //  - liveTextures holds the most recent texture for each format, mip level
  //    and usage. A full upload writes into this texture instead of a new
  //    allocation.
  function _getScalarState(scalars, states = model.scalarFormats) {
    const scalarMTime = scalars.getMTime();
    let state = states.get(scalars);
    if (state?.scalarMTime !== scalarMTime) {
      state = {
        contentTime: undefined,
        contentVersion: 0,
        halfFloatFitVersion: -1,
        formats: [],
        scalarMTime,
        scalarOffset: state?.scalarOffset,
        scalarScale: state?.scalarScale,
        verifiedTexture: state?.verifiedTexture,
        promotedFormat: state?.promotedFormat ?? null,
        liveTextures: state?.liveTextures ?? new Map(),
      };
      states.set(scalars, state);
    }
    return state;
  }

  function _getPromotedFormat({
    scalarState: state,
    dataArray,
    preferSizeOverAccuracy,
  }) {
    if (preferSizeOverAccuracy) {
      return null;
    }
    if (
      state.promotedFormat &&
      !_formatMatchesDataArray(state.promotedFormat, dataArray)
    ) {
      state.promotedFormat = null;
    }
    return state.promotedFormat;
  }

  function _getCachedScalarFormat(req) {
    const { scalarState: state, preferSizeOverAccuracy } = req;
    const promotedFormat = _getPromotedFormat(req);
    if (promotedFormat) {
      return promotedFormat;
    }
    const formatIndex = preferSizeOverAccuracy ? 1 : 0;
    const format = state.formats[formatIndex] ?? null;
    const formatNeedsHalfFloatFit =
      !preferSizeOverAccuracy && format?.endsWith('16float');
    if (
      formatNeedsHalfFloatFit &&
      state.halfFloatFitVersion !== state.contentVersion
    ) {
      return null;
    }
    return format;
  }

  function _cacheScalarFormat({
    scalarState: state,
    format,
    preferSizeOverAccuracy,
  }) {
    const formatIndex = preferSizeOverAccuracy ? 1 : 0;
    state.formats[formatIndex] = format;
    if (!preferSizeOverAccuracy && format.endsWith('32float')) {
      state.promotedFormat = format;
    }
  }

  function _updateContentState(state, contentTime) {
    const previousContentFitsHalfFloat =
      state.halfFloatFitVersion === state.contentVersion;
    if (state.contentTime !== contentTime) {
      state.contentTime = contentTime;
      state.contentVersion++;
    }
    return { previousContentFitsHalfFloat, version: state.contentVersion };
  }

  function _formatMatchesDataArray(
    format,
    dataArray,
    normalizeScalars = false
  ) {
    const numberOfComponents = dataArray.getNumberOfComponents();
    const textureComponents = numberOfComponents === 3 ? 4 : numberOfComponents;
    const formatDetails = vtkWebGPUTypes.getDetailsFromTextureFormat(format);
    if (formatDetails?.numComponents !== textureComponents) {
      return false;
    }
    if (normalizeScalars) {
      return format === 'r16float';
    }

    const dataType = dataArray.getDataType();
    const uses8BitNormalizedFormat =
      dataType === VtkDataTypes.UNSIGNED_CHAR ||
      dataType === VtkDataTypes.UNSIGNED_CHAR_CLAMPED;
    if (uses8BitNormalizedFormat) {
      return format.endsWith('8unorm');
    }
    const normalized16BitSuffix = _normalized16BitSuffix(dataType);
    if (normalized16BitSuffix) {
      return format.endsWith(normalized16BitSuffix);
    }
    return format.endsWith('16float') || format.endsWith('32float');
  }

  function _dataArrayFitsRange(
    dataArray,
    offset = 0,
    halfWidth = HALF_FLOAT_EXACT_INTEGER_LIMIT
  ) {
    const min = offset - halfWidth;
    const max = offset + halfWidth;
    const values = dataArray.getData();
    for (let i = 0; i < values.length; i++) {
      if (values[i] < min || values[i] > max) {
        return false;
      }
    }
    return true;
  }

  function _updatedExtentsFitRange(
    dataArray,
    dimensions,
    extents,
    offset = 0,
    halfWidth = HALF_FLOAT_EXACT_INTEGER_LIMIT
  ) {
    const min = offset - halfWidth;
    const max = offset + halfWidth;
    const values = dataArray.getData();
    const numberOfComponents = dataArray.getNumberOfComponents();
    const rowLength = dimensions[0] * numberOfComponents;
    const sliceLength = dimensions[1] * rowLength;

    for (let extentIndex = 0; extentIndex < extents.length; extentIndex++) {
      const [xmin, xmax, ymin, ymax, zmin, zmax] = extents[extentIndex];
      const extentRowLength = (xmax - xmin + 1) * numberOfComponents;
      for (let z = zmin; z <= zmax; z++) {
        for (let y = ymin; y <= ymax; y++) {
          const start =
            z * sliceLength + y * rowLength + xmin * numberOfComponents;
          const end = start + extentRowLength;
          for (let i = start; i < end; i++) {
            if (values[i] < min || values[i] > max) {
              return false;
            }
          }
        }
      }
    }
    return true;
  }

  function _scalarFormatSuffix(req) {
    if (req.normalizeScalars) {
      return '16float';
    }
    const dataType = req.dataArray.getDataType();
    if (
      dataType === VtkDataTypes.UNSIGNED_CHAR ||
      dataType === VtkDataTypes.UNSIGNED_CHAR_CLAMPED
    ) {
      return '8unorm';
    }

    const normalized16BitSuffix = _normalized16BitSuffix(dataType);
    if (normalized16BitSuffix) {
      return normalized16BitSuffix;
    }

    if (req.forceFloat32) {
      return '32float';
    }

    if (
      !req.preferSizeOverAccuracy &&
      model.device.hasFeature('float32-filterable')
    ) {
      if (
        req.allowScalarEncoding &&
        req.scalarState.scalarOffset === undefined
      ) {
        // Read the values directly because imageData.modified() also permits
        // in-place edits that do not invalidate the scalar array's range cache.
        const { min, max } = vtkDataArray.computeRange(req.dataArray.getData());
        req.fitsHalfFloat = max - min <= 2 * HALF_FLOAT_EXACT_INTEGER_LIMIT;
        if (req.fitsHalfFloat) {
          req.scalarState.scalarOffset =
            min >= -HALF_FLOAT_EXACT_INTEGER_LIMIT &&
            max <= HALF_FLOAT_EXACT_INTEGER_LIMIT
              ? 0
              : Math.floor((min + max) / 2);
        }
      } else {
        req.fitsHalfFloat = _dataArrayFitsRange(
          req.dataArray,
          req.scalarState?.scalarOffset
        );
      }
      return req.fitsHalfFloat ? '16float' : '32float';
    }

    return '16float';
  }

  // fills in request values based on what is missing/provided
  function _fillRequest(req) {
    // fill in values based on imageData if the request has it
    if (req.imageData) {
      req.time = req.dataArray.getMTime();
      req.nativeArray = req.dataArray.getData();
      const dims = req.imageData.getDimensions();
      req.width = dims[0];
      req.height = dims[1];
      req.depth = dims[2];
      const numComp = req.dataArray.getNumberOfComponents();
      req.format = _formatPrefix(numComp);

      if (numComp === 3) {
        const source = req.nativeArray;
        const padded = macro.newTypedArray(
          source.constructor.name,
          (source.length / 3) * 4
        );
        const alpha = source.BYTES_PER_ELEMENT === 1 ? 255 : 1;
        for (let i = 0, j = 0; i < source.length; i += 3, j += 4) {
          padded[j] = source[i];
          padded[j + 1] = source[i + 1];
          padded[j + 2] = source[i + 2];
          padded[j + 3] = alpha;
        }
        req.nativeArray = padded;
      }

      if (req.existingFormat) {
        req.format = req.existingFormat;
      } else {
        req.format += _scalarFormatSuffix(req);
      }
    }

    // fill in values based on image if the request has it
    if (req.image) {
      req.width = req.image.width;
      req.height = req.image.height;
      req.depth = 1;
      req.format = 'rgba8unorm';
      req.flip = true;
      /* eslint-disable no-undef */
      /* eslint-disable no-bitwise */
      req.usage =
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT;
      /* eslint-enable no-undef */
      /* eslint-enable no-bitwise */
    }

    // fill in based on js imageData
    if (req.jsImageData) {
      req.width = req.jsImageData.width;
      req.height = req.jsImageData.height;
      req.depth = 1;
      req.format = 'rgba8unorm';
      req.flip = true;
      req.nativeArray = req.jsImageData.data;
      /* eslint-disable no-undef */
      /* eslint-disable no-bitwise */
      req.usage =
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT;
      /* eslint-enable no-undef */
      /* eslint-enable no-bitwise */
    }

    if (req.imageBitmap) {
      req.width = req.imageBitmap.width;
      req.height = req.imageBitmap.height;
      req.depth = 1;
      req.format = 'rgba8unorm';
      req.flip = true;
      /* eslint-disable no-undef */
      /* eslint-disable no-bitwise */
      req.usage =
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT;
      /* eslint-enable no-undef */
      /* eslint-enable no-bitwise */
    }

    if (req.canvas) {
      req.width = req.canvas.width;
      req.height = req.canvas.height;
      req.depth = 1;
      req.format = 'rgba8unorm';
      req.flip = true;
      /* eslint-disable no-undef */
      /* eslint-disable no-bitwise */
      req.usage =
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT;
      /* eslint-enable no-undef */
      /* eslint-enable no-bitwise */
    }

    if (req.usage === undefined) {
      /* eslint-disable no-undef */
      /* eslint-disable no-bitwise */
      req.usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
      /* eslint-enable no-undef */
      /* eslint-enable no-bitwise */
    }
  }

  // create a texture (used by getTexture)
  function _createTexture(req) {
    const newTex = vtkWebGPUTexture.newInstance({ label: req.label });

    newTex.create(model.device, {
      width: req.width,
      height: req.height,
      depth: req.depth,
      format: req.format,
      scalarOffset: _scalarOffset(req),
      scalarScale: _scalarScale(req),
      usage: req.usage,
      mipLevel: req.mipLevel,
    });

    // fill the texture if we have data
    if (req.nativeArray || req.image || req.canvas || req.imageBitmap) {
      newTex.writeImageData(req);
    }
    return newTex;
  }

  // A partial write requires the same texture size and format. writeTexture
  // cannot change the texture allocation.
  function _canPatchTexture(texture, req) {
    return (
      !!texture?.getHandle?.() &&
      texture.getFormat() === req.format &&
      (texture.getScalarOffset?.() ?? 0) === _scalarOffset(req) &&
      texture.getScalarScale() === _scalarScale(req) &&
      texture.getWidth() === req.width &&
      texture.getHeight() === req.height &&
      texture.getDepth() === req.depth &&
      texture.getMipLevel?.() === (req.mipLevel ?? 0) &&
      texture.getUsage?.() === req.usage
    );
  }

  function _writeExtents(texture, req, extents) {
    const dims = [req.width, req.height, req.depth];
    for (let i = 0; i < extents.length; i++) {
      const extent = extents[i];
      const writeSucceeded = texture.writeSubImageData({
        x: extent[0],
        y: extent[2],
        z: extent[4],
        width: extent[1] - extent[0] + 1,
        height: extent[3] - extent[2] + 1,
        depth: extent[5] - extent[4] + 1,
        nativeArray: req.nativeArray,
        sourceLayout: {
          width: dims[0],
          height: dims[1],
          depth: dims[2],
          x: extent[0],
          y: extent[2],
          z: extent[4],
        },
        deferMipmaps: true,
      });
      if (writeSucceeded === false) {
        return false;
      }
    }
    texture.generateMipmaps?.();
    return true;
  }

  // A texture from getTextureForImageData with an owner is counted. When the
  // last owner changes to a different texture or releases it, the texture is
  // destroyed after the next submit. A texture that a caller gets without an
  // owner is never destroyed, because its use is not known.
  function _releaseUse(texture) {
    const count = (model.textureUseCounts.get(texture) ?? 1) - 1;
    if (count > 0) {
      model.textureUseCounts.set(texture, count);
      return;
    }
    model.textureUseCounts.delete(texture);
    model.device.afterNextSubmit(() => {
      if (
        model.textureUseCounts.has(texture) ||
        model.unownedTextures.has(texture)
      ) {
        return;
      }
      model.device.removeCachedObject(texture);
      texture.destroy?.();
    });
  }

  function _acquireTexture(owner, texture) {
    const previousTexture = model.textureOwners.get(owner);
    if (previousTexture === texture) {
      return;
    }
    model.textureOwners.set(owner, texture);
    model.textureUseCounts.set(
      texture,
      (model.textureUseCounts.get(texture) ?? 0) + 1
    );
    if (previousTexture) {
      _releaseUse(previousTexture);
    }
  }

  /**
   * Stop the use of the texture that `owner` holds. The texture is destroyed
   * when no other owner holds it.
   */
  publicAPI.releaseTexture = (owner) => {
    const texture = model.textureOwners.get(owner);
    if (!texture) {
      return;
    }
    model.textureOwners.delete(owner);
    _releaseUse(texture);
  };

  function _scalarOffset({ format, scalarState }) {
    return format === 'r16float' ? (scalarState?.scalarOffset ?? 0) : 0;
  }

  function _scalarScale({ format, scalarState }) {
    return format === 'r16float' ? (scalarState?.scalarScale ?? 1) : 1;
  }

  function _liveTextureKey(req) {
    const key = `${req.format}:${req.mipLevel ?? 0}:${req.usage}`;
    const offset = _scalarOffset(req);
    if (req.normalizeScalars) {
      return `${key}:normalized:${offset}:${_scalarScale(req)}`;
    }
    return offset ? `${key}:${offset}` : key;
  }

  // Write the full image into the most recent texture of the data array, if
  // it has the requested size and format. All holders of that texture then
  // see the new content, and no new texture is allocated.
  function _rewriteLiveTexture(req) {
    const state = _getScalarState(req.dataArray);
    const texture = state.liveTextures.get(_liveTextureKey(req))?.deref();
    if (!texture || !_canPatchTexture(texture, req)) {
      return null;
    }
    texture.writeImageData(req);
    model.device.getCachedObject(req.hash, () => texture);
    return texture;
  }

  function _setLiveTexture(req, texture) {
    if (texture && typeof texture === 'object') {
      _getScalarState(req.dataArray).liveTextures.set(
        _liveTextureKey(req),
        // eslint-disable-next-line no-undef
        new WeakRef(texture)
      );
    }
  }

  // get a texture or create it if not cached.
  // this is the main entry point
  publicAPI.getTexture = (req) => {
    // if we have a source then get/create/cache the texture
    if (req.hash) {
      // if a matching texture already exists then return it
      return model.device.getCachedObject(req.hash, _createTexture, req);
    }

    return _createTexture(req);
  };

  function _updateCompactEncoding(req, dimensions, extents, existingTexture) {
    const { scalarState: state, dataArray } = req;
    if (state.halfFloatFitVersion === state.contentVersion) {
      return;
    }
    const canPatch =
      extents?.length && state.verifiedTexture?.deref() === existingTexture;
    const fits =
      state.scalarScale !== undefined &&
      (canPatch
        ? _updatedExtentsFitRange(
            dataArray,
            dimensions,
            extents,
            state.scalarOffset,
            state.scalarScale
          )
        : _dataArrayFitsRange(
            dataArray,
            state.scalarOffset,
            state.scalarScale
          ));
    if (!fits) {
      // A new encoding applies to every texel, including those outside a patch.
      const { min, max } = vtkDataArray.computeRange(dataArray.getData());
      state.scalarOffset = dataArray.getNumberOfTuples() ? (min + max) / 2 : 0;
      state.scalarScale = max > min ? (max - min) / 2 : 1;
    }
    state.halfFloatFitVersion = state.contentVersion;
  }

  function _canEncodeScalars(scalars) {
    const dataType = scalars.getDataType();
    return (
      scalars.getNumberOfComponents() === 1 &&
      (dataType === VtkDataTypes.SHORT ||
        dataType === VtkDataTypes.UNSIGNED_SHORT)
    );
  }

  function _getTextureForImageData(imgData, options) {
    const treq = { time: imgData.getMTime() };
    const { updatedExtents } = options;
    let { existingTexture } = options;
    treq.imageData = imgData;
    treq.preferSizeOverAccuracy = !!options.preferSizeOverAccuracy;
    const scalars = imgData.getPointData().getScalars();
    treq.dataArray = scalars;
    const dataType = scalars.getDataType();
    treq.allowScalarEncoding =
      options.allowScalarEncoding && _canEncodeScalars(scalars);
    treq.normalizeScalars =
      treq.allowScalarEncoding && treq.preferSizeOverAccuracy;
    const states = treq.normalizeScalars
      ? model.compactScalarFormats
      : treq.allowScalarEncoding
        ? model.offsetScalarFormats
        : model.scalarFormats;
    const state = _getScalarState(scalars, states);
    treq.scalarState = state;
    if (existingTexture && updatedExtents?.length) {
      // A compact texture can contain rounded values outside the patch.
      // Only patch a texture previously checked for this scalar array.
      if (
        treq.allowScalarEncoding
          ? state.verifiedTexture?.deref() !== existingTexture
          : existingTexture.getScalarOffset?.() ||
            existingTexture.getScalarScale() !== 1
      ) {
        existingTexture = null;
      }
    }
    const { previousContentFitsHalfFloat, version } = _updateContentState(
      state,
      imgData.getMTime()
    );
    if (treq.normalizeScalars) {
      _updateCompactEncoding(
        treq,
        imgData.getDimensions(),
        updatedExtents,
        existingTexture
      );
    }
    if (updatedExtents?.length && existingTexture) {
      const existingFormat = existingTexture.getFormat();
      const promotedFormat = _getPromotedFormat(treq);
      if (promotedFormat && promotedFormat !== existingFormat) {
        // A different texture of this array already uses float32. Use the
        // same format, so that the request can share that texture.
        treq.forceFloat32 = true;
      } else if (
        _formatMatchesDataArray(existingFormat, scalars, treq.normalizeScalars)
      ) {
        const canPromoteToFloat32 =
          !treq.preferSizeOverAccuracy &&
          dataType !== VtkDataTypes.UNSIGNED_CHAR &&
          dataType !== VtkDataTypes.UNSIGNED_CHAR_CLAMPED &&
          existingFormat.endsWith('16float') &&
          model.device.hasFeature('float32-filterable');
        const updatedExtentsFitHalfFloat =
          !canPromoteToFloat32 ||
          _updatedExtentsFitRange(
            scalars,
            imgData.getDimensions(),
            updatedExtents,
            state.scalarOffset
          );
        if (!updatedExtentsFitHalfFloat) {
          treq.forceFloat32 = true;
        } else {
          treq.existingFormat = existingFormat;
          treq.partialFormat = true;
          treq.fitsHalfFloat =
            canPromoteToFloat32 && previousContentFitsHalfFloat;
        }
      }
    } else {
      treq.existingFormat = _getCachedScalarFormat(treq);
    }
    // fill out the req time and format based on imageData/image
    _fillRequest(treq);
    // _fillRequest keys the request time on the scalar array mtime alone.
    // Consumers that write scalars in place and only call
    // imageData.modified() must still invalidate the cached texture, so key
    // on the newest of the imageData and scalar array mtimes.
    treq.time = Math.max(treq.time, imgData.getMTime());

    // The mipmap compute pipeline accepts only 2D rgba8unorm storage textures.
    if (
      options.generateMipmaps &&
      treq.depth === 1 &&
      treq.format === 'rgba8unorm'
    ) {
      treq.mipLevel = Math.floor(
        Math.log2(Math.max(treq.width, treq.height, 1))
      );
      /* eslint-disable no-undef */
      /* eslint-disable no-bitwise */
      treq.usage =
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING;
      /* eslint-enable no-undef */
      /* eslint-enable no-bitwise */
    }

    treq.hash = `${treq.time}:${_liveTextureKey(treq)}`;

    const cachedTexture = model.device.hasCachedObject(treq.hash);
    let patchTexture = existingTexture;
    if (_canPatchTexture(cachedTexture, treq)) {
      patchTexture = cachedTexture;
    }
    if (updatedExtents?.length && _canPatchTexture(patchTexture, treq)) {
      const writeSucceeded = _writeExtents(patchTexture, treq, updatedExtents);
      if (writeSucceeded && !cachedTexture) {
        // Add a cache key for the modified texture. Other users can share the
        // new content. This does not require a full upload.
        model.device.getCachedObject(treq.hash, () => patchTexture);
      }
      if (writeSucceeded) {
        _cacheScalarFormat(treq);
        if (treq.fitsHalfFloat) {
          state.halfFloatFitVersion = version;
        }
        _setLiveTexture(treq, patchTexture);
        return patchTexture;
      }
    }

    if (treq.partialFormat) {
      delete treq.partialFormat;
      delete treq.existingFormat;
      treq.format =
        _formatPrefix(treq.dataArray.getNumberOfComponents()) +
        _scalarFormatSuffix(treq);
      treq.hash = `${treq.time}:${_liveTextureKey(treq)}`;
    }

    _cacheScalarFormat(treq);

    if (treq.fitsHalfFloat) {
      state.halfFloatFitVersion = version;
    }

    const cachedResult = model.device.hasCachedObject(treq.hash);
    if (cachedResult) {
      return cachedResult;
    }
    const rewrittenTexture = _rewriteLiveTexture(treq);
    if (rewrittenTexture) {
      return rewrittenTexture;
    }
    const newTexture = model.device.getTextureManager().getTexture(treq);
    _setLiveTexture(treq, newTexture);
    return newTexture;
  }

  /**
   * Return a texture for an image. Patch `existingTexture` when
   * `updatedExtents` contains all modified regions.
   *
   * `preferSizeOverAccuracy` permits binary16 storage when the scalar range is
   * not exact in that format.
   * With allowScalarEncoding, compact single-component Int16/Uint16 data is
   * normalized to [-1, 1]. Range expansion requires a full upload; other
   * partial updates retain the existing encoding and texture allocation.
   * A partial update scans only its extents and keeps the existing format when
   * the scalar type is compatible and all updated values fit.
   *
   * `owner` is a key object for one texture binding of the caller. The
   * manager counts the owners of each texture, and destroys a texture when
   * its last owner changes to a different texture or calls releaseTexture.
   */
  publicAPI.getTextureForImageData = (imgData, options = {}) => {
    const texture = _getTextureForImageData(imgData, options);
    if (texture && typeof texture === 'object') {
      const scalars = imgData.getPointData().getScalars();
      const allowScalarEncoding =
        options.allowScalarEncoding && _canEncodeScalars(scalars);
      const compactState = model.compactScalarFormats.get(scalars);
      if (compactState) {
        if (allowScalarEncoding && options.preferSizeOverAccuracy) {
          compactState.verifiedTexture = new WeakRef(texture);
        } else if (compactState.verifiedTexture?.deref() === texture) {
          compactState.verifiedTexture = null;
          compactState.halfFloatFitVersion = -1;
        }
      }
      const state = model.offsetScalarFormats.get(scalars);
      if (state && (allowScalarEncoding || options.preferSizeOverAccuracy)) {
        const verified = state.verifiedTexture?.deref();
        if (options.preferSizeOverAccuracy && verified === texture) {
          state.verifiedTexture = null;
        } else if (
          allowScalarEncoding &&
          !options.preferSizeOverAccuracy &&
          verified !== texture
        ) {
          state.verifiedTexture = new WeakRef(texture);
        }
      }
      if (options.owner) {
        _acquireTexture(options.owner, texture);
      } else {
        model.unownedTextures.add(texture);
      }
    }
    return texture;
  };

  publicAPI.getTextureForVTKTexture = (srcTexture, label = undefined) => {
    const treq = { time: srcTexture.getMTime(), label };
    if (srcTexture.getInputData()) {
      treq.imageData = srcTexture.getInputData();
      treq.dataArray = treq.imageData.getPointData().getScalars();
      treq.scalarState = _getScalarState(treq.dataArray);
      treq.existingFormat = _getCachedScalarFormat(treq);
    } else if (srcTexture.getImage()) {
      treq.image = srcTexture.getImage();
    } else if (srcTexture.getJsImageData()) {
      treq.jsImageData = srcTexture.getJsImageData();
    } else if (srcTexture.getImageBitmap()) {
      treq.imageBitmap = srcTexture.getImageBitmap();
    } else if (srcTexture.getCanvas()) {
      treq.canvas = srcTexture.getCanvas();
    }
    // fill out the req time and format based on imageData/image
    _fillRequest(treq);
    if (treq.imageData) {
      _cacheScalarFormat(treq);
    }
    // _fillRequest derives the cache hash from the scalar array mtime alone,
    // discarding the texture mtime seeded above. A texture rebuild must also
    // be triggered by srcTexture.modified() or imageData.modified() alone, so
    // hash on the newest of the texture, imageData, and scalar array mtimes.
    treq.time = Math.max(treq.time, srcTexture.getMTime());
    if (treq.imageData) {
      treq.time = Math.max(treq.time, treq.imageData.getMTime());
    }
    treq.mipLevel = srcTexture.getMipLevel();
    treq.hash = `${treq.time}:${_liveTextureKey(treq)}`;
    const texture = model.device.getTextureManager().getTexture(treq);
    if (texture && typeof texture === 'object') {
      model.unownedTextures.add(texture);
    }
    return texture;
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  handle: null,
  device: null,
  scalarFormats: null,
  offsetScalarFormats: null,
  compactScalarFormats: null,
  textureOwners: null,
  textureUseCounts: null,
  unownedTextures: null,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);
  model.scalarFormats = new WeakMap();
  model.offsetScalarFormats = new WeakMap();
  model.compactScalarFormats = new WeakMap();
  model.textureOwners = new WeakMap();
  model.textureUseCounts = new Map();
  model.unownedTextures = new WeakSet();

  // Object methods
  macro.obj(publicAPI, model);

  macro.setGet(publicAPI, model, ['device']);

  vtkWebGPUTextureManager(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
