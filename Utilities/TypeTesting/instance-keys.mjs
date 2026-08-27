// Shared by the Node census (check-declarations.mjs) and the browser census
// (Sources/Testing/declarationSurfaceCensus.js). The two must enumerate members
// identically or the browser lane reports ghosts the Node lane does not.
// Deliberately free of node: imports so the browser bundle can load it.

// Class-based helpers (vtkBoundingBox, vtkEdgeLocator) keep their methods on
// the prototype, where Object.keys cannot see them.
export function instanceKeys(instance) {
  const names = new Set(Object.keys(instance));
  for (
    let prototype = Object.getPrototypeOf(instance);
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name !== 'constructor') names.add(name);
    }
  }
  return names;
}
