import { describe, expect, it } from 'vitest';

import { createContextProxyHandler } from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow/ContextProxy';

describe('ContextProxy framebuffer binding cache', () => {
  it('tracks draw bindings and ignores read-only bindings', () => {
    const calls = [];
    const queriedBinding = { source: 'getParameter' };
    const rawContext = {
      FRAMEBUFFER: 1,
      READ_FRAMEBUFFER: 2,
      DRAW_FRAMEBUFFER: 3,
      FRAMEBUFFER_BINDING: 4,
      getParameter(parameter) {
        calls.push(['getParameter', parameter]);
        return queriedBinding;
      },
      bindFramebuffer(target, framebuffer) {
        calls.push(['bindFramebuffer', target, framebuffer]);
      },
    };
    const gl = new Proxy(rawContext, createContextProxyHandler());

    // Unknown values still come from WebGL. The proxy only caches values
    // observed through matching setter calls.
    expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(queriedBinding);
    expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(queriedBinding);
    expect(calls).toHaveLength(2);

    const combinedFramebuffer = { name: 'combined' };
    gl.bindFramebuffer(gl.FRAMEBUFFER, combinedFramebuffer);
    expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(combinedFramebuffer);
    expect(calls).toHaveLength(3);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, { name: 'read' });
    expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(combinedFramebuffer);
    expect(calls).toHaveLength(4);

    const drawFramebuffer = { name: 'draw' };
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawFramebuffer);
    expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(drawFramebuffer);
    expect(calls).toHaveLength(5);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBe(null);
    expect(calls).toHaveLength(6);
  });
});
