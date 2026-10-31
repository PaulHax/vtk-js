# ImageResliceMapper PR 64 comparison figures

These figures illustrate [PaulHax/vtk-js#64](https://github.com/PaulHax/vtk-js/pull/64).
They contain actual captured framebuffer images, with labels and layout added.
No image resampling, automatic contrast, or invented rendering is applied.

- `sampling-comparison.png`: original vtk.js, updated PR, and C++ VTK9.5.2.
- `integration-comparison.png`: earlier PR, updated PR, and C++ VTK9.5.2.
- `cpp-camera-roll.png`: actual C++ mapper diagnostic on an unchanged central ray.
- `provenance.json`: pinned source revisions, geometry, scalar inputs, settings and measured pixels.

C++ images are comparisons, not expected-output baselines. The axis-aligned
optimized CPU path shifts slab samples by half a step. The synthetic cases
have analytical expected values; the updated JS regression tests assert those.

Physical SUM and raw SUM have different units; these figures focus on extent,
MAX and MEAN cases to make the displayed intensities directly interpretable.
The updated JS shader preserves its existing raw SUM contract.

The implementation and numerical regressions are in commit
`efe5ec9858fd6861a8dd51098c95590c89029780`. See the PR description for C++
history and source references. The figure assets are hosted separately from
the implementation branch.
