import { describe, expect, it } from 'vitest';
import { snapFurnitureToNearestWall } from './interior-wall-snap';

const geometry = {
  floorPolygon: [[0, 0], [6, 0], [6, 5], [0, 5]],
  wallSegments: [
    { id: 'north', a: [0, 0], b: [6, 0], thicknessMeters: .12 },
    { id: 'west', a: [0, 0], b: [0, 5], thicknessMeters: .12 },
  ],
};
const asset = { assetId: 'sofa', displayNameKo: '소파', category: '거실', mountingKind: 'floor', defaultDimensionsMeters: [1.8, .8, .8] };

describe('RPG-style furniture wall snap', () => {
  it('keeps rotation and snaps the footprint to the nearest same-side wall surface', () => {
    const result = snapFurnitureToNearestWall({ assetId: 'sofa', positionMeters: [2.4, .9], dimensionsMeters: [1.8, .8, .8], yawDeg: 0 }, geometry, asset);
    expect(result?.wallId).toBe('north');
    expect(result?.positionMeters).toEqual([2.4, .48]);
  });

  it('respects the rotated footprint and the RPG 1.15m capture range', () => {
    const rotated = snapFurnitureToNearestWall({ assetId: 'sofa', positionMeters: [.95, 2.5], dimensionsMeters: [1.8, .8, .8], yawDeg: 90 }, geometry, asset);
    expect(rotated?.wallId).toBe('west');
    expect(rotated?.positionMeters[0]).toBeCloseTo(.48);
    expect(snapFurnitureToNearestWall({ assetId: 'sofa', positionMeters: [3, 2.5], yawDeg: 0 }, geometry, asset)).toBeNull();
  });
});
