import { expect, it, vi } from 'vitest';
import vtkShaderProgram from 'vtk.js/Sources/Rendering/OpenGL/ShaderProgram';
import vtkShaderCache from 'vtk.js/Sources/Rendering/OpenGL/ShaderCache';
const vertex =
  '#version 300 es\nout vec3 value; void main(){ value=vec3(1.0); gl_Position=vec4(0.0); }';
const fragment =
  '#version 300 es\nprecision highp float; in vec4 value; out vec4 color; void main(){ color=value; }';
it.skipIf(__VTK_TEST_NO_WEBGL__).each(['fragment compile', 'program link'])(
  'releases shaders after a failed %s',
  (failure) => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const createShader = vi.spyOn(gl, 'createShader');
    const cache = vtkShaderCache.newInstance();
    cache.setContext(gl);
    const program = cache.getShaderProgram(
      vertex,
      failure === 'fragment compile' ? 'invalid shader' : fragment,
      ''
    );
    expect(cache.readyShaderProgram(program)).toBeNull();
    const shaders = createShader.mock.results.map(({ value }) => value);
    createShader.mockRestore();
    expect(
      shaders.filter((shader) => gl.isShader(shader)).length
    ).toBeGreaterThan(0);
    cache.releaseGraphicsResources();
    expect(shaders.filter((shader) => gl.isShader(shader))).toEqual([]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    gl.getExtension('WEBGL_lose_context').loseContext();
  }
);
it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'rebuilds a successfully linked program after cleanup',
  () => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const program = vtkShaderProgram.newInstance();
    program.setContext(gl);
    program
      .getVertexShader()
      .setSource('#version 300 es\nvoid main(){gl_Position=vec4(0.0);}');
    program
      .getFragmentShader()
      .setSource(
        '#version 300 es\nprecision highp float; out vec4 color; void main(){color=vec4(1.0);}'
      );
    expect(program.compileShader()).toBe(1);
    program.cleanup();
    expect(program.compileShader()).toBe(1);
    expect(program.bind()).toBe(true);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    program.cleanup();
    gl.getExtension('WEBGL_lose_context').loseContext();
  }
);
