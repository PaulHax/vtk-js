import { describe, expect, it } from 'vitest';

import vtkTexture from 'vtk.js/Sources/Rendering/Core/Texture';

const makePayload = (format = 'astc-4x4', srgb = true) => ({
  format,
  width: 4,
  height: 2,
  srgb,
  levels: [
    { width: 4, height: 2, data: new Uint8Array(16).fill(1) },
    { width: 2, height: 1, data: new Uint8Array(16).fill(2) },
    { width: 1, height: 1, data: new Uint8Array(16).fill(3) },
  ],
});

describe('vtkTexture compressed data', () => {
  it('owns an exact independent sampler for compressed and raw sources', () => {
    const texture = vtkTexture.newInstance();
    const sampler = {
      magFilter: 'nearest',
      minFilter: 'nearest-mipmap-linear',
      wrapS: 'repeat',
      wrapT: 'mirrored-repeat',
    };
    expect(texture.setSampler(sampler)).toBe(true);
    expect(texture.getSampler()).toEqual(sampler);
    expect(texture.getSampler()).not.toBe(sampler);
    expect(texture.setSampler({ ...sampler })).toBe(false);
    texture.setCompressedData(makePayload());
    expect(texture.setSampler(null)).toBe(true);
    expect(texture.getSampler()).toBeNull();
  });
  it('does not accept an unowned compressed payload through initial values', () => {
    const payload = makePayload();
    const texture = vtkTexture.newInstance({ compressedData: payload });

    expect(texture.hasCompressedData()).toBe(false);
    payload.levels[0].data.fill(99);
    expect(texture.getCompressedData()).toBeNull();
  });

  it('owns a complete compressed mip chain and reports dimensionality', () => {
    const texture = vtkTexture.newInstance();
    const payload = makePayload();
    const before = texture.getMTime();

    expect(texture.setCompressedData(payload)).toBe(true);
    expect(texture.hasCompressedData()).toBe(true);
    expect(texture.isCompressedDataComplete()).toBe(true);
    expect(texture.getMTime()).toBeGreaterThan(before);
    expect(texture.getDimensionality()).toBe(2);

    const stored = texture.getCompressedData();
    expect(stored).toEqual(payload);
    expect(stored).not.toBe(payload);
    expect(stored.levels).not.toBe(payload.levels);
    expect(stored.levels[0].data).not.toBe(payload.levels[0].data);

    payload.levels[0].data[0] = 99;
    stored.levels[0].data[1] = 88;
    expect(texture.getCompressedData().levels[0].data).toEqual(
      new Uint8Array(16).fill(1)
    );

    const unchanged = texture.getMTime();
    expect(texture.setCompressedData(makePayload())).toBe(false);
    expect(texture.getMTime()).toBe(unchanged);
  });

  it('clears every other source when compressed data is set', () => {
    const texture = vtkTexture.newInstance();
    const jsImageData = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(16),
    };
    texture.setJsImageData(jsImageData);

    texture.setCompressedData(makePayload());

    expect(texture.getCompressedData()).not.toBeNull();
    expect(texture.getJsImageData()).toBeNull();
    expect(texture.getCanvas()).toBeNull();
    expect(texture.getImage()).toBeNull();
    expect(texture.getImageBitmap()).toBeNull();
    expect(texture.getInputData()).toBeNull();
  });

  it('clears compressed data when any other source is set', () => {
    const sourceSetters = [
      (texture) =>
        texture.setJsImageData({
          width: 1,
          height: 1,
          data: new Uint8ClampedArray(4),
        }),
      (texture) =>
        texture.setCanvas({ width: 1, height: 1, getContext: () => null }),
      (texture) => texture.setImageBitmap({ width: 1, height: 1 }),
      (texture) =>
        texture.setImage({
          width: 1,
          height: 1,
          complete: true,
          addEventListener() {},
          removeEventListener() {},
        }),
      (texture) => texture.setInputData({ getDimensions: () => [1, 1, 1] }),
      (texture) => texture.setInputConnection(() => null),
    ];

    sourceSetters.forEach((setSource) => {
      const texture = vtkTexture.newInstance();
      texture.setCompressedData(makePayload());
      const before = texture.getMTime();

      setSource(texture);

      expect(texture.getCompressedData()).toBeNull();
      expect(texture.getMTime()).toBeGreaterThan(before);
    });
  });

  it('applies exclusivity to added inputs but not rejected input ports', () => {
    const texture = vtkTexture.newInstance();
    texture.setCompressedData(makePayload());
    texture.setInputData({ getDimensions: () => [1, 1, 1] }, 99);
    expect(texture.getCompressedData()).not.toBeNull();
    texture.setInputData({ getDimensions: () => [1, 1, 1] }, -1);
    expect(texture.getCompressedData()).not.toBeNull();
    expect(texture.getInputData(-1)).toBeUndefined();

    texture.addInputData({ getDimensions: () => [1, 1, 1] });
    expect(texture.getCompressedData()).toBeNull();

    texture.setCompressedData(makePayload());
    texture.setInputConnection(() => null, 99);
    expect(texture.getCompressedData()).not.toBeNull();
    texture.setInputConnection(() => null, -1);
    expect(texture.getCompressedData()).not.toBeNull();
    expect(texture.getInputConnection(-1)).toBeUndefined();

    texture.addInputConnection(() => null);
    expect(texture.getCompressedData()).toBeNull();
    expect(texture.hasCompressedData()).toBe(false);
    expect(texture.isCompressedDataComplete()).toBe(false);
  });

  it('clears non-compressed image sources when a pipeline source is set', () => {
    const texture = vtkTexture.newInstance();
    texture.setJsImageData({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray(4),
    });

    texture.setInputData({ getDimensions: () => [1, 1, 1] });

    expect(texture.getJsImageData()).toBeNull();
    expect(texture.getImageLoaded()).toBe(false);
    expect(texture.getInputData()).not.toBeNull();
  });

  it('clears and replaces compressed data without redundant modification', () => {
    const texture = vtkTexture.newInstance();
    texture.setCompressedData(makePayload());
    const beforeReplacement = texture.getMTime();

    expect(texture.setCompressedData(makePayload('bc7'))).toBe(true);
    expect(texture.getMTime()).toBeGreaterThan(beforeReplacement);
    expect(texture.getCompressedData().format).toBe('bc7');

    const beforeClear = texture.getMTime();
    expect(texture.clearCompressedData()).toBe(true);
    expect(texture.getMTime()).toBeGreaterThan(beforeClear);
    expect(texture.getCompressedData()).toBeNull();

    const afterClear = texture.getMTime();
    expect(texture.clearCompressedData()).toBe(false);
    expect(texture.setCompressedData(null)).toBe(false);
    expect(texture.getMTime()).toBe(afterClear);
  });

  it.each([
    [{ ...makePayload(), format: 'pvrtc' }, 'format'],
    [{ ...makePayload(), width: 0 }, 'width'],
    [{ ...makePayload(), height: 1.5 }, 'height'],
    [{ ...makePayload(), srgb: 'yes' }, 'srgb'],
    [{ ...makePayload(), levels: [] }, 'levels'],
    [
      {
        ...makePayload(),
        levels: [
          makePayload().levels[0],
          { width: 1, height: 1, data: new Uint8Array(16) },
          makePayload().levels[2],
        ],
      },
      'level 1',
    ],
    [
      {
        ...makePayload(),
        levels: [
          { width: 4, height: 2, data: new Uint16Array([1]) },
          ...makePayload().levels.slice(1),
        ],
      },
      'Uint8Array',
    ],
    [
      {
        ...makePayload(),
        levels: [
          { width: 4, height: 2, data: new Uint8Array() },
          ...makePayload().levels.slice(1),
        ],
      },
      '16 bytes',
    ],
    [
      {
        ...makePayload(),
        levels: [
          { width: 4, height: 2, data: new Uint8Array(15) },
          ...makePayload().levels.slice(1),
        ],
      },
      '16 bytes',
    ],
  ])(
    'rejects invalid payloads with strong exception safety',
    (invalid, part) => {
      const texture = vtkTexture.newInstance();
      texture.setCompressedData(makePayload('etc2-rgba8'));
      const snapshot = texture.getCompressedData();
      const before = texture.getMTime();

      expect(() => texture.setCompressedData(invalid)).toThrow(part);
      expect(texture.getCompressedData()).toEqual(snapshot);
      expect(texture.getMTime()).toBe(before);
    }
  );
});
