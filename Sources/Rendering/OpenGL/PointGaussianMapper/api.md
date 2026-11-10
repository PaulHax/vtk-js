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

An optional `pointOrder` on the Core mapper selects indexed splat rendering for
input without verts cells. It is a one-component `vtkDataArray` backed by
`Uint32Array`, containing input point ids in draw order. The positions, colours,
scales, rotations and opacities remain in GPU data textures. Updating only the
order uploads only its integer texture; changing an attribute uploads only that
attribute. This path supports subsets and repeated ids, and selection returns
the original input ids. An empty order draws nothing. Invalid ids or verts cells
produce an error and draw nothing. Simple points ignore the order.

The caller supplies the order and blending policy. For ordinary alpha blending,
sort from back to front. This option does not change the default translucent
pass or perform sorting. Each attribute and the order must fit within the
device's maximum two-dimensional texture size.

The covariance uses the complete linear model-to-view transform, including
nonuniform actor scale and shear, independently of position-buffer shift and
scale. Projection uses the derivative of the supplied homogeneous projection
matrix at the splat center. This also supports oblique and explicit projection
matrices without deriving a focal length from the camera view angle. Parallel
projection is a mapper adaptation; the base Gaussian glTF extension defines
perspective reconstruction only.

A vertex shader template set through `ViewSpecificProperties` must match the
mode: splats need the tags and outputs of `glsl/vtkPointGaussianVS.glsl`,
simple points those of the polydata vertex shader.
Indexed splats also require the `PointOrder::Dec` and `PointOrder::Impl` tags.

### getNumberOfDrawnPoints()

Number of points or splats each draw submits: all the uploaded ones.
Subclasses may return fewer to draw a prefix of the uploaded points.
