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

  try {
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
  } finally {
    addEventListener.mockRestore();
    glWindow.delete();
  }
});

it('rejects capture requests that need vtk-managed canvas ownership', async () => {
  const glWindow = vtkOpenGLRenderWindow.newInstance({ manageCanvas: false });

  try {
    await expect(
      glWindow.captureNextImage('image/png', { size: [320, 300] })
    ).rejects.toThrow(
      'Screenshot captures with an explicit size or scale resize the canvas and require manageCanvas=true on vtkOpenGLRenderWindow'
    );

    await expect(
      glWindow.captureNextImage('image/png', { scale: 2 })
    ).rejects.toThrow(
      'Screenshot captures with an explicit size or scale resize the canvas and require manageCanvas=true on vtkOpenGLRenderWindow'
    );
  } finally {
    glWindow.delete();
  }
});
