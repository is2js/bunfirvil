import { describe, expect, it } from 'vitest';
import { normalizeHotbar } from './catalog';
import { resolveEffectSource, selectEffectVariant, type EffectManifest } from './effect-player';
import { reorderHotbar } from './hotbar';
import { applyOptionToggle, calculateOptionPrice } from './options';
import type { BOptionEntry } from './types';
import { expandTileRuns } from './world';

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

  it('normalizes and reorders an eight-slot hotbar', () => {
    const slots = normalizeHotbar(['basic-attack', '', 'common-teleport']);
    expect(slots).toHaveLength(8);
    expect(slots).toEqual(['basic-attack', null, 'common-teleport', null, null, null, null, null]);
    expect(reorderHotbar(slots, 0, 7)).toEqual([null, null, 'common-teleport', null, null, null, null, 'basic-attack']);
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
