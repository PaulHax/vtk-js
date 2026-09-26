## Introduction

This class is not intended for general use. Please use the ImageResliceMapper under Rendering/Core.
This class is a WebGL implementation of that generic renderable class. This class will automatically
be instantiated and rendered as needed by the OpenGL RenderWindow.

## Methods

### releaseGraphicsResources(openGLRenderWindow)

Release this mapper's GPU resources. Shared textures are freed after their last
user releases them. The render window defaults to the last one used by this
mapper. Resources are rebuilt on the next render.
