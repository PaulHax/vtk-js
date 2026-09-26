# PointGaussianMapper

This implementation supports VTK's **simple-point mode only**. It draws one
vertex per input point without requiring vertex cells. Gaussian falloff,
anisotropic covariance, Gaussian scale/opacity arrays and transfer functions,
custom splat shaders, and emissive splat blending are not implemented.

Create the mapper with `{ scaleFactor: 0 }`. Nonzero scale factors throw rather
than silently selecting a different rendering style. The vtk.js default is 0;
VTK C++ defaults to 1, so Python clients must call `SetScaleFactor(0)` explicitly.

The following vtk.js extensions do not change the Gaussian mode selector:

- `pointSizeScale` (default 1): multiply the actor's pixel point size, or the
  model-space diameter when `worldSize` is enabled. Hosts may use this for
  device-pixel-ratio conversion.
- `circle` (default false): discard square corners for a hard circular footprint.
- `worldSize` (default 0): model-space diameter projected through the camera and
  the actor's isotropic scale. Actor point size is the pixel floor; the WebGL
  point-size limit is the ceiling.
- `maximumPointCount` (default -1): draw an input prefix while retaining all
  uploaded points. Restoring density does not upload buffers again.

Point selection follows the displayed footprint and submitted prefix. Cell
selection is unsupported because this mapper does not use cell topology.
