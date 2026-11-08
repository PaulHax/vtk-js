import { it, expect } from 'vitest';
import testUtils from 'vtk.js/Sources/Testing/testUtils';
import { createFailingScene } from 'vtk.js/Sources/Testing/renderTestUtils';

import vtkPolyLineWidget from 'vtk.js/Sources/Widgets/Widgets3D/PolyLineWidget';
import vtkWidgetManager from 'vtk.js/Sources/Widgets/Core/WidgetManager';

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'picks widgets again after a selection render throws',
  async () => {
    const gc = testUtils.createGarbageCollector();
    const { renderer, renderWindow, view, filter } = createFailingScene(gc);
    const widgetManager = gc.registerResource(vtkWidgetManager.newInstance());
    widgetManager.setRenderer(renderer);
    const widget = gc.registerResource(vtkPolyLineWidget.newInstance());
    const viewWidget = widgetManager.addWidget(widget);
    const handleOrigin = [0, 0.8, 0];
    widget.getWidgetState().addHandle().setOrigin(handleOrigin);
    renderWindow.render();
    const [x, y] = view
      .worldToDisplay(...handleOrigin, renderer)
      .map((coordinate) => Math.floor(coordinate));

    filter.setFailing(true);
    await expect(widgetManager.getSelectedDataForXY(x, y)).rejects.toThrow(
      'filter failed'
    );

    filter.setFailing(false);
    const picked = await widgetManager.getSelectedDataForXY(x, y);
    expect(picked.widget).toBe(viewWidget);
  }
);
