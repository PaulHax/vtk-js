import { describe, expect, it, vi } from 'vitest';

import vtkOpenGLActor from 'vtk.js/Sources/Rendering/OpenGL/Actor';

describe('vtkOpenGLActor visibility traversal', () => {
  it('retains mapper nodes while hidden and rebuilds them when visible again', () => {
    let visible = false;
    const mapper = {};
    const renderable = {
      getMapper: vi.fn(() => mapper),
      getNestedVisibility: vi.fn(() => visible),
      getTextures: vi.fn(() => []),
    };
    let mapperNodeVisited = false;
    const mapperNode = {
      delete: vi.fn(),
      getRenderable: () => mapper,
      getViewNodeFor: (dataObject) =>
        dataObject === mapper ? mapperNode : undefined,
      getVisited: () => mapperNodeVisited,
      isA: () => false,
      setParent: vi.fn(),
      setRenderable: vi.fn(),
      setVisited: (visited) => {
        mapperNodeVisited = visited;
      },
      traverse: vi.fn(),
    };

    const actorNode = vtkOpenGLActor.newInstance({ renderable });
    actorNode.setMyFactory({ createNode: () => mapperNode });
    const renderWindowNode = { getContext: () => ({}) };
    const rendererNode = {
      getLastAncestorOfType: () => renderWindowNode,
      isA: (className) => className === 'vtkOpenGLRenderer',
    };
    actorNode.setParent(rendererNode);

    const buildPass = {
      getOperation: () => 'buildPass',
      getTraverseOperation: () => undefined,
    };

    actorNode.traverse(buildPass);
    expect(renderable.getMapper).not.toHaveBeenCalled();
    expect(mapperNode.traverse).not.toHaveBeenCalled();

    visible = true;
    actorNode.traverse(buildPass);
    expect(renderable.getMapper).toHaveBeenCalledTimes(1);
    expect(mapperNode.traverse).toHaveBeenCalledTimes(1);
    expect(actorNode.getViewNodeFor(mapper)).toBe(mapperNode);

    visible = false;
    actorNode.traverse(buildPass);
    expect(mapperNode.traverse).toHaveBeenCalledTimes(1);
    expect(actorNode.getViewNodeFor(mapper)).toBe(mapperNode);

    visible = true;
    actorNode.traverse(buildPass);
    expect(renderable.getMapper).toHaveBeenCalledTimes(2);
    expect(mapperNode.traverse).toHaveBeenCalledTimes(2);
  });
});
