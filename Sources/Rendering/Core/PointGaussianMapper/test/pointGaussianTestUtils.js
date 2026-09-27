import { vi } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';

import 'vtk.js/Sources/Rendering/Misc/RenderingAPIs';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkPolyData from 'vtk.js/Sources/Common/DataModel/PolyData';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import { FieldAssociations } from 'vtk.js/Sources/Common/DataModel/DataSet/Constants';

// Scenes and pixel readers shared by the point Gaussian and point sprite
// mapper tests.

// Splat shader code drawing hard discs of one standard deviation. Hard-edged
// splats render with the opaque geometry.
export const DISC = [
  '//VTK::Color::Impl',
  '  if (dot(offsetVCVSOutput, offsetVCVSOutput) > 1.0) { discard; }',
].join('\n');

// Points from flat xyz coordinates, coloured by flat byte colours (RGB or
// RGBA) when given.
export function createPolyData(gc, coordinates, colours) {
  const polyData = gc.registerResource(vtkPolyData.newInstance());
  polyData.getPoints().setData(Float32Array.from(coordinates), 3);
  if (colours) {
    polyData.getPointData().setScalars(
      vtkDataArray.newInstance({
        numberOfComponents: colours.length / (coordinates.length / 3),
        values: Uint8Array.from(colours),
      })
    );
  }
  return polyData;
}

// A view of the mapper drawing polyData on a black background, with direct
// colours when there are scalars.
export function createScene(gc, mapper, polyData, size) {
  const renderWindow = gc.registerResource(vtkRenderWindow.newInstance());
  const renderer = gc.registerResource(vtkRenderer.newInstance());
  renderWindow.addRenderer(renderer);
  const view = gc.registerResource(renderWindow.newAPISpecificView());
  view.setContainer(testUtils.createRenderContainer(gc));
  renderWindow.addView(view);
  view.setSize(size, size);

  gc.registerResource(mapper);
  mapper.setInputData(polyData);
  mapper.setColorModeToDirectScalars();
  const actor = gc.registerResource(vtkActor.newInstance());
  actor.setMapper(mapper);
  renderer.addActor(actor);
  return { renderWindow, renderer, view, mapper, polyData, actor };
}

// Looks at the origin from 10 units along +z, with a parallel projection when
// given its scale: a view of N pixels then shows N / (2 * scale) pixels per
// unit.
export function lookDownZ(renderer, parallelScale) {
  const camera = renderer.getActiveCamera();
  if (parallelScale !== undefined) {
    camera.setParallelProjection(true);
    camera.setParallelScale(parallelScale);
  }
  camera.setPosition(0, 0, 10);
  camera.setClippingRange(1, 20);
  return camera;
}

export async function capture({ renderWindow, view }) {
  const image = view.captureNextImage();
  renderWindow.render();
  return testUtils.getImageDataFromURI(await image);
}

// RGBA at display coordinates, which count rows from the bottom.
export function rgbaAt({ data, width, height }, x, y) {
  const index = ((height - 1 - y) * width + x) * 4;
  return Array.from(data.subarray(index, index + 4));
}

const isLit = ([r, g, b]) => r + g + b > 60;

export function countLitPixels({ data }) {
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    count += isLit(data.subarray(i, i + 3)) ? 1 : 0;
  }
  return count;
}

// Lit pixels along a row, or a column, of display coordinates.
export function countLitAlong(image, { row, column }) {
  const length = row === undefined ? image.height : image.width;
  let count = 0;
  for (let i = 0; i < length; i++) {
    const rgba =
      row === undefined ? rgbaAt(image, column, i) : rgbaAt(image, i, row);
    count += isLit(rgba) ? 1 : 0;
  }
  return count;
}

// The scene's hardware selector, set to pick points.
export function createPointSelector({ renderWindow, view }) {
  renderWindow.render();
  const selector = view.getSelector();
  selector.setFieldAssociation(FieldAssociations.FIELD_ASSOCIATION_POINTS);
  return selector;
}

export const attributeIds = (selection) =>
  selection.map((node) => node.getProperties().attributeID);

// Renders once and returns the arrays bufferData received.
export function renderUploads({ renderWindow, view }) {
  const bufferData = vi.spyOn(view.getContext(), 'bufferData');
  try {
    renderWindow.render();
    return bufferData.mock.calls.map(([, data]) => data);
  } finally {
    bufferData.mockRestore();
  }
}
