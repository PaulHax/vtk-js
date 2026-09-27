OpenGL point Gaussian mapper

vtkOpenGLPointGaussianMapper renders a vtkPointGaussianMapper without
manufacturing topology. Each drawn point (every input point, or the points the
verts cells reference) owns one entry in the position, colour and optional
radius, rotation and opacity buffers.

- With a scale factor of 0 it draws one vertex per point with `gl.POINTS`.
- Otherwise it draws one instance of a four-vertex triangle strip per point.
  The vertex shader projects the point's 3D Gaussian to a 2D covariance and
  places the strip's corners, taken from `gl_VertexID`, around it. The per-point
  buffers are the same ones simple points use, read once per instance.

A buffer is uploaded again only when its own source changes, so settings that
only reach uniforms or shaders (bound scale, low-pass matrix, emissive, splat
shader code, and the scale factor while it stays non-zero) upload nothing.
After editing an array in place, call its `modified()`, or the polydata's,
which uploads every buffer again.

A vertex shader template set through `ViewSpecificProperties` must match the
mode: splats need the tags and outputs of `glsl/vtkPointGaussianVS.glsl`,
simple points those of the polydata vertex shader.
