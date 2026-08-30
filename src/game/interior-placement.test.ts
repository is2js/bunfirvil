import { describe, expect, it } from 'vitest';
import type { InteriorAssetEntry } from '../manage/interior-layout';
import type { ApartmentGeometry, ApartmentInteriorProp } from './types';
import { validateInteriorPlacement } from './interior-placement';

const asset: InteriorAssetEntry = {
  assetId: 'test-chair',
  displayNameKo: '테스트 의자',
  category: 'furniture',
  defaultDimensionsMeters: [1, 1, 1],
};

const geometry: ApartmentGeometry = {
  floorPolygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
  roomZones: [{ id: 'living', boundsMeters: [0, 0, 4, 3] }],
  wallSegments: [
    { id: 'west-wall', a: [0, 0], b: [0, 3], thicknessMeters: .2 },
  ],
  openings: [{ id: 'living-door', type: 'door', a: [3.4, 0], b: [4, 0] }],
};

function prop(id: string, positionMeters: [number, number]): ApartmentInteriorProp {
  return { id, assetId: asset.assetId, positionMeters, dimensionsMeters: [1, 1, 1], yawDeg: 0 };
}

describe('RPG-style interior GHOST placement', () => {
  it('keeps a clear living-room placement green', () => {
    expect(validateInteriorPlacement({ prop: prop('candidate', [2, 1.5]), geometry, assets: [asset] }).ok).toBe(true);
  });

  it('marks wall and exterior overlap red', () => {
    const result = validateInteriorPlacement({ prop: prop('candidate', [.25, 1.5]), geometry, assets: [asset] });
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain('outside-floor');
    expect(result.errors.map((error) => error.code)).toContain('structural-wall-overlap');
  });

  it('marks overlap with installed solid furniture red while ignoring the moved source', () => {
    const existing = prop('existing', [2, 1.5]);
    expect(validateInteriorPlacement({ prop: prop('candidate', [2, 1.5]), geometry, props: [existing], assets: [asset] }).errors)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'solid-prop-overlap' })]));
    expect(validateInteriorPlacement({ prop: existing, geometry, props: [existing], assets: [asset], ignorePropId: 'existing' }).ok).toBe(true);
  });
});
