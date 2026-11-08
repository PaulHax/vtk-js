import { it } from 'vitest';
import {
  createConeActor,
  expectColorsAfterDepthPassThrows,
} from 'vtk.js/Sources/Testing/renderTestUtils';

it.skipIf(__VTK_TEST_NO_WEBGL__)(
  'draws its colors after throwing while it renders depth',
  () =>
    expectColorsAfterDepthPassThrows((gc, filter) =>
      createConeActor(gc, { filter })
    )
);
