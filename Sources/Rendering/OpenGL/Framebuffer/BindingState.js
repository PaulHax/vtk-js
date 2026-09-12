const FRAMEBUFFER_BINDING_STATE = Symbol('framebufferBindingState');

export function initializeFramebufferBinding(renderWindow) {
  const state = {
    binding: null,
    known: false,
  };
  renderWindow[FRAMEBUFFER_BINDING_STATE] = state;
  return state;
}

export function getFramebufferBindingState(renderWindow) {
  return renderWindow[FRAMEBUFFER_BINDING_STATE];
}
