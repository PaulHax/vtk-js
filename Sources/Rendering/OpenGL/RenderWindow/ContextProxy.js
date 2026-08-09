// This is used to access the underlying 3D context
export const GET_UNDERLYING_CONTEXT = '__getUnderlyingContext';

export function createContextProxyHandler() {
  const cache = new Map();

  const getParameterHandler = {
    apply(target, gl, args) {
      if (cache.has(args[0])) {
        return cache.get(args[0]);
      }
      return target.apply(gl, args);
    },
  };

  // only supports single-value setters
  function cachedSetterHandler(key) {
    return {
      apply(target, gl, args) {
        cache.set(key, args[0]);
        return target.apply(gl, args);
      },
    };
  }

  // FRAMEBUFFER_BINDING aliases the draw framebuffer binding in WebGL2.
  // Binding READ_FRAMEBUFFER alone must not update it.
  function bindFramebufferHandler(readFramebufferTarget, bindingKey) {
    return {
      apply(target, gl, args) {
        if (args[0] !== readFramebufferTarget) {
          cache.set(bindingKey, args[1]);
        }
        return target.apply(gl, args);
      },
    };
  }

  // Deleting the currently bound framebuffer implicitly rebinds the
  // default framebuffer.
  function deleteFramebufferHandler(bindingKey) {
    return {
      apply(target, gl, args) {
        if (args[0] != null && cache.get(bindingKey) === args[0]) {
          cache.set(bindingKey, null);
        }
        return target.apply(gl, args);
      },
    };
  }

  // When a property is accessed on the webgl context proxy,
  // it's accessed is intercepted. If the property name matches
  // any of the keys of `propHandlers`, then that handler is called
  // with the following arguments: (gl, prop, receiver, propValue)
  // - gl (WebGL2RenderingContext): the underlying webgl context
  // - propName (string): the property name
  // - receiver (Proxy): the webgl context proxy
  // - propValue (unknown): the value of `gl[propName]`

  const propHandlers = Object.create(null);

  // Sets getParameter(property) as a cached getter proxy.
  // propValue.bind(gl) is to avoid Illegal Invocation errors.
  propHandlers.getParameter = (gl, prop, receiver, propValue) =>
    new Proxy(propValue.bind(gl), getParameterHandler);

  // Sets depthMask(flag) as a cached setter proxy.
  propHandlers.depthMask = (gl, prop, receiver, propValue) =>
    new Proxy(propValue.bind(gl), cachedSetterHandler(gl.DEPTH_WRITEMASK));

  propHandlers.bindFramebuffer = (gl, prop, receiver, propValue) =>
    new Proxy(
      propValue.bind(gl),
      bindFramebufferHandler(gl.READ_FRAMEBUFFER, gl.FRAMEBUFFER_BINDING)
    );

  propHandlers.deleteFramebuffer = (gl, prop, receiver, propValue) =>
    new Proxy(
      propValue.bind(gl),
      deleteFramebufferHandler(gl.FRAMEBUFFER_BINDING)
    );

  return {
    get(gl, prop, receiver) {
      if (prop === GET_UNDERLYING_CONTEXT) return () => gl;
      let value = Reflect.get(gl, prop, gl);
      if (value instanceof Function) {
        // prevents Illegal Invocation errors
        value = value.bind(gl);
      }

      const propHandler = propHandlers[prop];
      if (propHandler) {
        return propHandler(gl, prop, receiver, value);
      }

      return value;
    },
  };
}

export default { createContextProxyHandler };
