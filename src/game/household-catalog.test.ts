import { describe, expect, it } from 'vitest';
import type { StaticMapEntry } from './types';
import {
  BUNDANG_HOUSEHOLD_CATALOG,
  hasValidMapQuery,
  householdCounts,
  householdSelection,
} from './household-catalog';

const maps = ['51A', '55A', '55B', '59A'].map((unitType) => ({
  id: `bundang-first-village-${unitType.toLowerCase()}-prototype`,
  unitType,
})) as StaticMapEntry[];

describe('Bundang household catalog', () => {
  it('contains 12 residential buildings and the verified 1,390 households', () => {
    expect(BUNDANG_HOUSEHOLD_CATALOG.buildings.map((building) => building.buildingId)).toEqual([
      '101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112',
    ]);
    expect(householdCounts()).toEqual({ '51A': 413, '55A': 468, '55B': 254, '59A': 255, total: 1390 });
  });

  it('locks authoritative and inferred A/B line sequences', () => {
    const variants = Object.fromEntries(BUNDANG_HOUSEHOLD_CATALOG.buildings.map((building) => [
      building.buildingId,
      building.lines.map((line) => line.planVariant).join(''),
    ]));
    expect(variants).toEqual({
      '101': 'BBBA', '102': 'BBABA', '103': 'BBABA', '104': 'ABBABA',
      '105': 'ABBAAB', '106': 'BBABA', '107': 'ABAA', '108': 'ABAA',
      '109': 'ABBABA', '110': 'BABABA', '111': 'ABABAB', '112': 'BAAB',
    });
    expect(BUNDANG_HOUSEHOLD_CATALOG.buildings.find((building) => building.buildingId === '105')?.lines[0]?.confidence)
      .toBe('pvp-authoritative');
    expect(BUNDANG_HOUSEHOLD_CATALOG.buildings.find((building) => building.buildingId === '101')?.lines[0]?.confidence)
      .toBe('site-plan-inferred');
  });

  it('rejects pilotis and roof void cells and resolves a real household', () => {
    expect(householdSelection('104', 1, 6, maps)).toBeNull();
    expect(householdSelection('104', 3, 6, maps)).toBeNull();
    expect(householdSelection('101', 25, 1, maps)).toBeNull();
    expect(householdSelection('105', 25, 1, maps)).toMatchObject({
      householdNumber: '2501',
      unitType: '51A',
      planVariant: 'A',
      facing: 'south-east',
    });
  });

  it('only bypasses the gate for a known map query', () => {
    expect(hasValidMapQuery(maps, '?map=bundang-first-village-55a-prototype&variant=B')).toBe(true);
    expect(hasValidMapQuery(maps, '?map=unknown')).toBe(false);
    expect(hasValidMapQuery(maps, '')).toBe(false);
  });
});
