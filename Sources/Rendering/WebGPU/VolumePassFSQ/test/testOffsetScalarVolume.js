import { expect, it } from 'vitest';

import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderWindowInteractor from 'vtk.js/Sources/Rendering/Core/RenderWindowInteractor';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import vtkWebGPURenderWindow from 'vtk.js/Sources/Rendering/WebGPU/RenderWindow';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

it.skipIf(!__VTK_TEST_WEBGPU__).for([false, true])(
  'filters and sums encoded volume samples in their original scalar range (compact: %s)',
  async (compactStorage, ctx) => {
    const gc = testUtils.createGarbageCollector();
    try {
      const view = gc.registerResource(vtkWebGPURenderWindow.newInstance());
      const config = view.getWebGPUConfiguration();
      config.setOptionalFeatures(['float32-filterable']);
      expect(await config.initialize()).toBe(true);
      if (!config.hasFeature('float32-filterable')) {
        ctx.skip('requires a filterable float32 reference texture');
      }
      const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
      const renderer = gc.registerResource(vtkRenderer.newInstance());
      renderWindow.addRenderer(renderer);
      view.setContainer(testUtils.createRenderContainer(gc, 32));
      renderWindow.addView(view);
      const interactor = gc.registerResource(
        vtkRenderWindowInteractor.newInstance()
      );
      interactor.setView(view);
      interactor.enable();
      view.setSize(32, 32);

      const image = gc.registerResource(vtkImageData.newInstance());
      image.setDimensions(8, 8, 8);
      const low = compactStorage ? 0 : 3001;
      const high = compactStorage ? 40000 : 3003;
      const values = Float32Array.from({ length: 8 ** 3 }, (_, i) =>
        i % 8 < 4 ? low : high
      );
      const scalars = gc.registerResource(vtkDataArray.newInstance({ values }));
      image.getPointData().setScalars(scalars);
      const mapper = gc.registerResource(vtkVolumeMapper.newInstance());
      mapper.setInputData(image);
      mapper.setBlendModeToAdditiveIntensity();
      mapper.setSampleDistance(1);
      const volume = gc.registerResource(vtkVolume.newInstance());
      volume.setMapper(mapper);
      const property = volume.getProperty();
      property.setInterpolationTypeToLinear();
      property.setFilterModeToRaw();
      property.setIpScalarRange(high - 0.5, high + 0.5);
      const color = property.getRGBTransferFunction(0);
      color.removeAllPoints();
      color.addRGBPoint(high * 2, 0, 0, 0);
      color.addRGBPoint(high * 3, 1, 1, 1);
      const opacity = property.getScalarOpacity(0);
      opacity.removeAllPoints();
      opacity.addPoint(0, 1);
      opacity.addPoint(10000, 1);
      renderer.addVolume(volume);
      renderer.getActiveCamera().setParallelProjection(true);
      renderer.resetCamera();

      const capture = async () => {
        const pending = view.captureNextImage();
        renderWindow.render();
        const pixels = await testUtils.getImageDataFromURI(await pending);
        // Sample inside each constant region, away from the interpolated edge.
        return [12, 20].map((x) => pixels.data[(16 * pixels.width + x) * 4]);
      };

      const reference = await capture();
      expect(reference[0]).toBe(0);
      expect(reference[1]).toBeGreaterThan(200);
      scalars.setData(
        compactStorage ? new Uint16Array(values) : new Int16Array(values)
      );
      property.setPreferSizeOverAccuracy(compactStorage);
      const compact = await capture();
      expect(compact).toEqual(reference);
      if (compactStorage) {
        const updated = scalars.getData();
        for (let i = 0; i < updated.length; i++) {
          if (i % 8 >= 4) updated[i] = 65535;
        }
        image.modified();
        property.setUpdatedExtents([[4, 7, 0, 7, 0, 7]]);
        property.setIpScalarRange(65534.5, 65535.5);
        color.removeAllPoints();
        color.addRGBPoint(65535 * 2, 0, 0, 0);
        color.addRGBPoint(65535 * 3, 1, 1, 1);
        expect(await capture()).toEqual(reference);
      }
    } finally {
      gc.releaseResources();
    }
  }
);
