import { expect, it } from 'vitest';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderWindowInteractor from 'vtk.js/Sources/Rendering/Core/RenderWindowInteractor';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import vtkVolumeController from 'vtk.js/Sources/Interaction/UI/VolumeController';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

it('keeps a custom color preset when the opacity range changes', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const image = testUtils.createImage([2, 2, 2], [1, 1, 1]);
  const mapper = vtkVolumeMapper.newInstance();
  mapper.setInputData(image);
  const actor = vtkVolume.newInstance();
  actor.setMapper(mapper);
  const renderWindow = vtkRenderWindow.newInstance();
  renderWindow.setInteractor(vtkRenderWindowInteractor.newInstance());
  const grayscale = document.createElement('button');
  grayscale.textContent = 'Grayscale';
  let controls;
  const controller = vtkVolumeController.newInstance({
    size: [240, 120],
    rescaleColorMap: true,
    createControls(bindings) {
      controls = bindings;
      grayscale.addEventListener('click', () =>
        bindings.setPreset('Grayscale')
      );
    },
  });
  const widget = controller.getWidget();

  try {
    controller.setContainer(host);
    controller.setupContent(renderWindow, actor, true);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    expect(host.querySelectorAll('select, input')).toHaveLength(0);

    grayscale.click();
    const lookupTable = actor.getProperty().getRGBTransferFunction(0);
    const initialRange = [...lookupTable.getMappingRange()];
    controls.setPreset('Unknown preset');
    widget.setGaussians([
      { position: 0.6, height: 1, width: 0.15, xBias: 0, yBias: 0 },
    ]);

    const range = lookupTable.getMappingRange();
    expect(range).not.toEqual(initialRange);
    expect(range).toEqual(widget.getOpacityRange());
    const color = [];
    lookupTable.getColor((range[0] + range[1]) / 2, color);
    expect(color).toEqual([0.5, 0.5, 0.5]);
  } finally {
    widget.unbindMouseListeners();
    controller.setContainer(null);
    host.remove();
  }
});
