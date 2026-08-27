import { describe, expect, it } from 'vitest';
import { createLocalProp, validateLayout, type InteriorAssetEntry } from './interior-layout';

const asset: InteriorAssetEntry = {
  assetId: 'sofa-three-seat',
  displayNameKo: '3인 소파',
  category: 'living',
  defaultDimensionsMeters: { width: 2.1, depth: .9, height: .82 },
  materialVariantIds: ['greige-fabric'],
};

describe('local interior layout', () => {
  it('creates a 0.05m-snapped local ghost prop', () => {
    expect(createLocalProp(asset, 1.027, 2.078, 7)).toMatchObject({
      id: 'local-sofa-three-seat-7',
      assetId: 'sofa-three-seat',
      positionMeters: [1.05, 2.1],
      dimensionsMeters: [2.1, .9, .82],
      materialVariantId: 'greige-fabric',
    });
  });

  it('validates map id, asset allowlist, coordinates, and duplicate ids', () => {
    const value = {
      schemaVersion: 1,
      mapId: 'map-55b',
      updatedAt: new Date().toISOString(),
      props: [createLocalProp(asset, 1, 2, 7)],
    };
    expect(validateLayout(value, 'map-55b', new Set([asset.assetId])).ok).toBe(true);
    expect(validateLayout(value, 'map-51a', new Set([asset.assetId]))).toMatchObject({ ok: false });
    expect(validateLayout(value, 'map-55b', new Set())).toMatchObject({ ok: false });
    expect(validateLayout({ ...value, props: [value.props[0], value.props[0]] }, 'map-55b', new Set([asset.assetId]))).toMatchObject({ ok: false });
  });
});
