import { it, expect, vi } from 'vitest';

import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';

it('does not manage externally owned canvases', () => {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'inline';
  const addEventListener = vi.spyOn(canvas, 'addEventListener');
  const glWindow = vtkOpenGLRenderWindow.newInstance({
    canvas,
    manageCanvas: false,
  });

  expect(glWindow.getManageCanvas()).toBe(false);
  expect(addEventListener).not.toHaveBeenCalledWith(
    'webglcontextlost',
    expect.any(Function),
    false
  );
  expect(addEventListener).not.toHaveBeenCalledWith(
    'webglcontextrestored',
    expect.any(Function),
    false
  );

  glWindow.setRenderable({});
  glWindow.setUseOffScreen(true);
  glWindow.setSize(640, 480);

  expect(canvas.getAttribute('width')).toBe(null);
  expect(canvas.getAttribute('height')).toBe(null);
  expect(canvas.style.display).toBe('inline');
});

it('rejects captures that require resizing an externally owned canvas', async () => {
  const glWindow = vtkOpenGLRenderWindow.newInstance({ manageCanvas: false });

  const currentSizeCapture = glWindow.captureNextImage();
  glWindow.invokeImageReady('data:current-size');
  await expect(currentSizeCapture).resolves.toBe('data:current-size');

  const sizedCapture = glWindow.captureNextImage('image/png', {
    size: [320, 300],
  });
  await expect(sizedCapture).rejects.toThrow(/manageCanvas=true/);

  const scaledCapture = glWindow.captureNextImage('image/png', { scale: 2 });
  await expect(scaledCapture).rejects.toThrow(/manageCanvas=true/);
});
