import type vtkOpenGLRenderWindow from '../RenderWindow';
import type { PreparedPointTextures } from '../../Core/PointGaussianMapper';

export type PointTextureBank = Pick<
  PreparedPointTextures,
  'bind' | 'unbind'
> & {
  write(
    name: string,
    data: Float32Array | Uint32Array,
    components: number,
    capacity: number,
    first: number,
    count: number,
    source?: number
  ): void;
  release(): void;
};

export function createPointTextureBank(
  window: vtkOpenGLRenderWindow
): PointTextureBank;

export function withPointTextureUploads<T>(
  window: vtkOpenGLRenderWindow | null | undefined,
  run: () => T
): T;
