import { describe, expect, it } from 'vitest';
import { normalizeHotbar } from './catalog';
import { resolveEffectSource, selectEffectVariant, type EffectManifest } from './effect-player';
import { readHotbar, reorderHotbar } from './hotbar';
import { applyOptionToggle, calculateOptionPrice } from './options';
import type { BOptionEntry } from './types';
import { canTraverse, crossesApartmentWall, expandTileRuns } from './world';
import {
  apartmentPropPlacement,
  apartmentSolidBlockVisualFootprint,
  apartmentUnitWorldPoint,
  auditApartmentPropPlacements,
} from './apartment-transform';
import type { WorldData, WorldObject } from './types';

const options: BOptionEntry[] = [
  {
    id: 'island',
    label: '아일랜드',
    category: '주방',
    price: 2_000,
    description: '',
    compatibleUnitTypes: ['55B'],
    requires: [],
    requiresAny: [],
    excludes: ['compact'],
  },
  {
    id: 'countertop',
    label: '상판',
    category: '주방',
    price: 800,
    description: '',
    compatibleUnitTypes: ['55B'],
    requires: ['island'],
    requiresAny: [],
    excludes: [],
  },
  {
    id: 'compact',
    label: '컴팩트',
    category: '주방',
    price: 1_000,
    description: '',
    compatibleUnitTypes: ['55B'],
    requires: [],
    requiresAny: [],
    excludes: ['island'],
  },
  {
    id: 'island-alt',
    label: '대체 아일랜드',
    category: '주방',
    price: 2_200,
    prices: { '51A': 1_900, '55B': 2_200 },
    description: '',
    compatibleUnitTypes: ['51A', '55B'],
    requires: [],
    requiresAny: [],
    excludes: [],
  },
  {
    id: 'oven',
    label: '오븐',
    category: '주방',
    price: 900,
    description: '',
    compatibleUnitTypes: ['55B'],
    requires: [],
    requiresAny: ['island', 'island-alt'],
    excludes: [],
  },
];

describe('game-local state helpers', () => {
  it('selects a directional effect variant and resolves manifest-relative frames', () => {
    const manifest: EffectManifest = {
      variants: [
        { direction: { key: 'n' }, frameCount: 2, sheetUrl: 'variants/n.png' },
        { direction: { key: 'se' }, frameCount: 2, transparentFrameUrls: ['frames/se-0.png', 'frames/se-1.png'] },
      ],
    };
    expect(selectEffectVariant(manifest, 'se')?.direction?.key).toBe('se');
    const resolved = resolveEffectSource(manifest, 'https://example.test/effects/manifest.json', 'se');
    expect(resolved.frameUrls).toEqual([
      'https://example.test/effects/frames/se-0.png',
      'https://example.test/effects/frames/se-1.png',
    ]);
    expect(resolveEffectSource(manifest, 'https://example.test/effects/manifest.json', 'w').sheetUrl)
      .toBe('https://example.test/effects/variants/n.png');
  });

  it('normalizes and reorders a four-slot hotbar', () => {
    const slots = normalizeHotbar(['basic-attack', '', 'common-teleport']);
    expect(slots).toHaveLength(4);
    expect(slots).toEqual(['basic-attack', null, 'common-teleport', null]);
    expect(reorderHotbar(slots, 0, 3)).toEqual([null, null, 'common-teleport', 'basic-attack']);
  });

  it('migrates the legacy eight-slot browser value to the new teleport-first default', () => {
    const legacyStorage = {
      getItem: () => JSON.stringify(['basic-attack', 'warrior-shock-stun', 'common-double-arrow', 'common-teleport', null, null, null, null]),
    } as unknown as Storage;
    const currentDefault = ['common-teleport', 'basic-attack', 'warrior-shock-stun', 'common-double-arrow'];
    expect(readHotbar(currentDefault, legacyStorage)).toEqual(currentDefault);
  });

  it('blocks diagonal corner cutting and movement across apartment wall segments', () => {
    const wallObject: WorldObject = {
      originCell: { x: 0, y: 0 },
      geometry: {
        cellSizeMeters: 1,
        wallSegments: [{ a: [1, 0], b: [1, 2], baseMeters: 0 }],
      },
    };
    expect(crossesApartmentWall([wallObject], 0, 1, 2, 1)).toBe(true);
    expect(crossesApartmentWall([wallObject], 0, 2.5, 2, 2.5)).toBe(false);

    const cornerWorld = {
      width: 4,
      height: 4,
      blocked: new Set(['1,0']),
      objects: [],
    } as unknown as WorldData;
    expect(canTraverse(cornerWorld, 0, 0, 1, 1)).toBe(false);
    expect(canTraverse({ ...cornerWorld, blocked: new Set() }, 0, 0, 1, 1)).toBe(true);
  });

  it('keeps renderer, props, and collision on the same mirrored apartment transform', () => {
    const object: WorldObject = {
      originCell: { x: 10, y: 20 },
      transform: { rotationDeg: 90, mirrorX: false },
      geometry: {
        cellSizeMeters: 0.5,
        floorPolygon: [[0, 0], [3, 0], [3, 3], [0, 3]],
        roomZones: [{ id: 'living', boundsMeters: [0, 0, 3, 3] }],
      },
    };
    expect(apartmentUnitWorldPoint(object, [1, 0]).x).toBeCloseTo(10);
    expect(apartmentUnitWorldPoint(object, [1, 0]).y).toBeCloseTo(22);
    const placement = apartmentPropPlacement(object, {
      id: 'table', assetId: 'table', roomZoneId: 'living', positionMeters: [1, 1], yawDeg: 0,
    });
    expect(placement.worldYaw).toBeCloseTo(-Math.PI / 2);
    expect(auditApartmentPropPlacements(object, [{
      id: 'table', assetId: 'table', roomZoneId: 'living', positionMeters: [1, 1], yawDeg: 0,
    }]).issues).toEqual([]);
  });

  it('separates a solid block face from its coplanar apartment wall', () => {
    const object: WorldObject = {
      geometry: {
        solidBlockWallContactClearanceMeters: 0.015,
        wallSegments: [{ a: [0, 0], b: [2, 0], thicknessMeters: 0.12 }],
      },
    };
    const polygon = apartmentSolidBlockVisualFootprint(object, { boundsMeters: [0, -0.06, 1, 0.5] });
    expect(Math.min(...polygon.map((point) => point[1]))).toBeCloseTo(0.075);
  });

  it('adds requirements and removes mutually exclusive B options', () => {
    const withCountertop = applyOptionToggle(options, ['compact'], 'countertop');
    expect(new Set(withCountertop)).toEqual(new Set(['island', 'countertop']));
    expect(calculateOptionPrice(options, withCountertop)).toBe(2_800);

    const withoutRequiredBase = applyOptionToggle(options, withCountertop, 'island');
    expect(withoutRequiredBase).toEqual([]);
  });

  it('keeps a valid alternative dependency and picks a deterministic default only when needed', () => {
    expect(new Set(applyOptionToggle(options, ['island-alt'], 'oven'))).toEqual(new Set(['island-alt', 'oven']));
    expect(new Set(applyOptionToggle(options, [], 'oven'))).toEqual(new Set(['island', 'oven']));
    expect(applyOptionToggle(options, ['island-alt', 'oven'], 'island-alt')).toEqual([]);
  });

  it('expands bounded row-major tile runs', () => {
    expect(expandTileRuns([
      { tileId: 'soil', count: 2 },
      { tileId: 'floor', count: 3 },
      { tileId: 'ignored', count: 100 },
    ], 6)).toEqual(['soil', 'soil', 'floor', 'floor', 'floor', 'ignored']);
  });
});
