import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import {
  createFailingScene,
  renderToImage,
} from 'vtk.js/Sources/Testing/renderTestUtils';

import { FieldAssociations } from 'vtk.js/Sources/Common/DataModel/DataSet/Constants';

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'draws the scene again after a selection render throws',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view, filter } = createFailingScene(gc);
    const selector = gc.registerResource(view.createSelector());
    selector.setFieldAssociation(FieldAssociations.FIELD_ASSOCIATION_POINTS);

    const expected = view.captureNextImage();
    renderWindow.render();
    // another image on the canvas, restored before the selection so that the
    // image checks the selector's own restore
    const background = renderer.getBackground();
    renderer.setBackground(1, 0, 0);
    renderWindow.render();
    renderer.setBackground(background);

    const [width, height] = view.getSize();
    filter.setFailing(true);
    await expect(
      selector.getSourceDataAsync(renderer, 0, 0, width - 1, height - 1)
    ).rejects.toThrow('filter failed');

    filter.setFailing(false);
    expect(await renderToImage(view)).toBe(await expected);
  }
);
