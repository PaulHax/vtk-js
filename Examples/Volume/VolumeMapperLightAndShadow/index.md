
### Volume Mapper Light and Shadow

This example demonstrates volume lighting and shadows on a CT scan of a head. It opens with WebGL. Use **Switch to WebGPU** in the Controls panel to reload the example with WebGPU.

## Widgets included in this example

- The **Transfer Function** panel contains the color map picker, sampling and contrast controls, and opacity editor. It uses [vtkVolumeController](https://kitware.github.io/vtk-js/api/Interaction_UI_VolumeController.html).
- The frame-rate plot shows measured FPS during interaction in green. The horizontal line marks 60 FPS.
- The **Controls** panel sets the lighting and shadow parameters.
    * **Use Shadow** toggles shading on the volume.
    * **Toggle Density Normal**: if on, normal is calculated based on the changes of opacity value. Otherwise it is based on scalar value. 
    * **Surface to Volume Blending**: at 0.0, shadow effect is created using phong surface model (local gradient); at 1.0, shadow effect is created using secondary shadow ray (global shadow); any value in between blends these two effects. In terms of speed, blending is slower than secondary shadow ray, and secondary shadow ray is slower than surface rendering.
    * **G Illumination Reach**: at 0.0, length of shadow ray equals to 1 unit of sampling distance; at 1.0, length of shadow ray equals to maximum possible value, i.e., it traverse through the entire volume; values in between interpolates between the minimum and maximum. Longer shadow ray means slower rendering.
    * **VS Sample Dist**: represents sample distance multiplier. At 1.0, shadow ray sample distance equals to primary ray sample distance; at 2.0, shadow ray sample distance is 2 times primary ray sample distance; and so on. Greater multipler means faster rendering, but also less accurate shadow effect.
    * **Anistropy**: at -1.0, light scatters backward; at 0.0, light scatters uniformly; at 1.0, light scatters forward. 

Shadow and light effects are only rendered if shadow is turned on, and with at least one light source present. 

Documentation on these experimental features are not updated yet.


