## Introduction

This class is not intended for general use.  Please use the
similarly named class under Rendering/Core. This class is
a WebGL implementation of that generic renderable class in 
Rendering Core.  This class will automatically get instantiated
and rendered as needed by the OpenGLRenderWindow. 

## Methods

### releaseGraphicsResources(openGLRenderWindow)

Release GPU resources, retaining lookup textures used by other mappers. The
window defaults to the last render window. Resources are recreated on the next
render.
