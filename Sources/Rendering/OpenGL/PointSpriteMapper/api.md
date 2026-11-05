OpenGL point sprite mapper

vtkOpenGLPointSpriteMapper renders a vtkPointSpriteMapper. It extends the
simple points of vtkOpenGLPointGaussianMapper: it scales the point size by
`pointSizeScale`, discards the corners of round points through `gl_PointCoord`,
and sizes points in model units with `worldSize`. Through
`getNumberOfDrawnPoints` it limits every draw, of points or splats, to
`maximumPointCount`.
