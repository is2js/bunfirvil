import { describe, expect, it } from 'vitest';
import type { ShowcaseCatalog } from './types';
import {
  BundangShareError,
  bundangReadOnlyShareUrl,
  createBundangReadOnlyShare,
  decodeBundangReadOnlyShare,
  encodeBundangReadOnlyShare,
  shareTokenFromHash,
  sharedFurnitureProps,
  validateBundangReadOnlyShare,
} from './read-only-share';

const catalog = {
  schemaVersion: 1, exportId: 'test', generatedAt: '', characters: [], skills: [], defaultHotbar: [], renderAssets: undefined,
  maps: [{ id: 'bundang-first-village-55b-prototype', label: '55B', unitType: '55B', revision: '1', renderer: 'three-pbr', width: 64, height: 64, chunkCount: 16, assetBytes: 0, spawn: { x: 1, y: 1 }, manifestUrl: '', minimapUrl: '' }],
  bOptions: [{ id: 'option-1', label: '옵션', category: '주방', price: 1, description: '', compatibleUnitTypes: ['55B'], requires: [], excludes: [] }],
} satisfies ShowcaseCatalog;
const assets = [{ assetId: 'sofa', displayNameKo: '소파', category: '거실', defaultDimensionsMeters: [2, 1, 1], materialVariantIds: ['oak'] }];

describe('read-only share', () => {
  it('round-trips only the allowed showcase state', () => {
    const state = createBundangReadOnlyShare({
      sharedByNickname: '돌범',
      mapId: catalog.maps[0].id, unitType: '55B', planVariant: 'A', livingFacing: 'south-west', selectedOptionIds: ['option-1'],
      furniture: [{ id: 'local-private', assetId: 'sofa', positionMeters: [2.345, 4.321], yawDeg: 90, mirrored: true, materialVariantId: 'oak', privateNote: 'drop-me' }],
    });
    const token = encodeBundangReadOnlyShare(state);
    const restored = validateBundangReadOnlyShare(decodeBundangReadOnlyShare(token), catalog, assets);
    expect(restored.furniture[0]).toEqual({ assetId: 'sofa', positionMeters: [2.35, 4.32], yawDeg: 90, mirrored: true, materialVariantId: 'oak' });
    expect(restored.sharedByNickname).toBe('돌범');
    expect(JSON.stringify(restored)).not.toMatch(/privateNote|building|household|operator/);
    expect(sharedFurnitureProps(restored, assets)[0].id).toBe('local-shared-1');
    const url = bundangReadOnlyShareUrl('https://is2js.github.io/bunfirvil/?actor=200', restored);
    expect(url).not.toContain('actor=');
    expect(shareTokenFromHash(new URL(url).hash)).toBe(token);
  });

  it('rejects incompatible or malformed state', () => {
    const invalid = { schemaVersion: 1, sharedByNickname: '돌범', mapId: catalog.maps[0].id, unitType: '55B', planVariant: 'A', livingFacing: 'south-west', selectedOptionIds: ['unknown'], furniture: [] };
    expect(() => validateBundangReadOnlyShare(invalid, catalog, assets)).toThrow(BundangShareError);
    expect(() => createBundangReadOnlyShare({
      sharedByNickname: '', mapId: catalog.maps[0].id, unitType: '55B', planVariant: 'A', livingFacing: 'south-west', selectedOptionIds: [], furniture: [],
    })).toThrow(BundangShareError);
    expect(() => decodeBundangReadOnlyShare('%%%')).toThrow(BundangShareError);
  });
});
