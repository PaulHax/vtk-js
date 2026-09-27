vtkOpenGLHelper

Store the shaders, program, and ibo in a common place
as they are used together frequently. This is just
a convenience class.

### program

The shader program. Setting it to null, as a mapper does when a shader build
fails, stores an unbuilt program instead, which the next render rebuilds.

### VAO

The VertexArrayObject

### CABO

The cell array buffer object. See vtkCellArrayBufferObject

### shaderSourceTime

The last time the shader source code changed

###  attributeUpdateTime

The last time  the attributes for the VAO were assigned
