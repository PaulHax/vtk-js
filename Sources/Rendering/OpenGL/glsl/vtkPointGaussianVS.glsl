//VTK::System::Dec

/*=========================================================================

  Program:   Visualization Toolkit
  Module:    vtkPointGaussianVS.glsl

  Copyright (c) Ken Martin, Will Schroeder, Bill Lorensen
  All rights reserved.
  See Copyright.txt or http://www.kitware.com/Copyright.htm for details.

     This software is distributed WITHOUT ANY WARRANTY; without even
     the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
     PURPOSE.  See the above copyright notice for more information.

=========================================================================*/
// Gaussian splat impostors. Each point is one instance of a four-vertex
// triangle strip; gl_VertexID selects the corner of the screen-space quad
// that bounds the projected Gaussian (EWA splatting).

attribute vec4 vertexMC;

uniform float scaleFactor;
uniform float boundScale;
uniform int cameraParallel;

// low-pass filter added to the projected covariance, in normalized device
// coordinates; stored as (a, b, c) of the symmetric matrix [a b; b c]
uniform vec3 lowpassMatrix;

//VTK::Covariance::Dec

// offset from the splat centre, in standard deviations
varying vec2 offsetVCVSOutput;

// optional normal declaration
//VTK::Normal::Dec

// Texture coordinates
//VTK::TCoord::Dec

// material property values
//VTK::Color::Dec

// clipping plane vars
//VTK::Clip::Dec

// camera and actor matrix values; MCVCLinearMatrix is the model to view
// transform without translation or the VBO shift and scale
uniform mat4 MCVCMatrix;
uniform mat3 MCVCLinearMatrix;
uniform mat4 VCPCMatrix;

// picking support
//VTK::Picking::Dec

mat3 quaternionToMatrix(vec4 quat)
{
  // quat stores the real part first; a zero quaternion is no rotation
  float quatLength = length(quat);
  vec4 q = quatLength > 0.0 ? quat / quatLength : vec4(1.0, 0.0, 0.0, 0.0);
  float r = q.x;
  float x = q.y;
  float y = q.z;
  float z = q.w;

  return mat3(
    1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y + r * z), 2.0 * (x * z - r * y),
    2.0 * (x * y - r * z), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z + r * x),
    2.0 * (x * z + r * y), 2.0 * (y * z - r * x), 1.0 - 2.0 * (x * x + y * y));
}

mat3 computeCov3D(vec3 scale, vec4 rotation)
{
  mat3 S = mat3(
    scaleFactor * scale.x, 0.0, 0.0,
    0.0, scaleFactor * scale.y, 0.0,
    0.0, 0.0, scaleFactor * scale.z);
  mat3 M = quaternionToMatrix(rotation) * S;
  return M * transpose(M);
}

// Jacobian of the view to normalized device transform at positionVC, up to a
// sign the covariance does not see: exact for a parallel projection, the
// local affine approximation of a perspective one (EWA Splatting, Zwicker et
// al. 2002, eq. 29 and 31).
mat3 getProjectionJacobian(vec3 positionVC)
{
  vec2 scale = vec2(VCPCMatrix[0][0], VCPCMatrix[1][1]);
  if (cameraParallel != 0)
  {
    return mat3(scale.x, 0.0, 0.0, 0.0, scale.y, 0.0, 0.0, 0.0, 0.0);
  }
  // The approximation stretches splats without bound away from the view
  // axis, so it is taken no further out than 30% beyond the edges of the
  // view, as in 3D Gaussian Splatting (Kerbl et al. 2023).
  vec2 skew = vec2(VCPCMatrix[2][0], VCPCMatrix[2][1]);
  vec2 ndc = clamp(-scale * positionVC.xy / positionVC.z - skew, -1.3, 1.3);
  vec2 shear = (ndc + skew) / positionVC.z;
  return mat3(
    scale.x / positionVC.z, 0.0, 0.0,
    0.0, scale.y / positionVC.z, 0.0,
    shear.x, shear.y, 0.0);
}

void main()
{
  //VTK::Color::Impl

  //VTK::Normal::Impl

  //VTK::TCoord::Impl

  //VTK::Clip::Impl

  vec4 posVC = MCVCMatrix * vertexMC;
  vec4 posPC = VCPCMatrix * posVC;

  int corner = gl_VertexID;
  offsetVCVSOutput =
    boundScale * (vec2(float(corner & 1), float(corner >> 1)) * 2.0 - 1.0);

  // Nothing at or behind the plane of a perspective camera is drawn.
  if (posPC.w <= 0.0)
  {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }

  mat3 T = getProjectionJacobian(posVC.xyz) * MCVCLinearMatrix;

  //VTK::Covariance::Impl

  mat2 cov2d = mat2(cov) +
    mat2(lowpassMatrix.x, lowpassMatrix.y, lowpassMatrix.y, lowpassMatrix.z);

  // Square root of the covariance: maps the unit disc onto the splat ellipse,
  // keeping the corners counter-clockwise. Nearly axis-aligned ellipses skip
  // the eigen decomposition, which loses precision there.
  mat2 transformVC;
  if (abs(cov2d[0][1]) > 1e-3 * (cov2d[0][0] + cov2d[1][1]))
  {
    float halfTrace = 0.5 * (cov2d[0][0] + cov2d[1][1]);
    float term =
      sqrt(max(halfTrace * halfTrace - determinant(cov2d), 0.0));
    float eigenValue1 = halfTrace + term;
    float eigenValue2 = max(halfTrace - term, 0.0);
    vec2 eigenVector1 =
      normalize(vec2(eigenValue1 - cov2d[1][1], cov2d[0][1]));
    vec2 eigenVector2 = vec2(-eigenVector1.y, eigenVector1.x);
    transformVC = mat2(
      sqrt(eigenValue1) * eigenVector1, sqrt(eigenValue2) * eigenVector2);
  }
  else
  {
    transformVC = mat2(
      sqrt(max(cov2d[0][0], 0.0)), 0.0, 0.0, sqrt(max(cov2d[1][1], 0.0)));
  }

  gl_Position = vec4(
    posPC.xy / posPC.w + transformVC * offsetVCVSOutput,
    posPC.z / posPC.w,
    1.0);

  //VTK::Picking::Impl
}
