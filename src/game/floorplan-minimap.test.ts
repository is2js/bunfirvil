import { describe, expect, it } from 'vitest';
import { screenVectorToWorldDelta } from './grid';
import { worldPointToNorthUpMinimap } from './floorplan-minimap';

describe('north-up floorplan minimap', () => {
  it('maps WASD cardinal movement to the same minimap direction while north remains up', () => {
    const origin = worldPointToNorthUpMinimap({ x: 10, y: 10 });
    for (const [screenDx, screenDy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const world = screenVectorToWorldDelta(screenDx, screenDy);
      const target = worldPointToNorthUpMinimap({ x: 10 + world.dx, y: 10 + world.dy });
      expect(target.x - origin.x).toBe(screenDx);
      expect(target.y - origin.y).toBe(screenDy);
    }
  });
});
