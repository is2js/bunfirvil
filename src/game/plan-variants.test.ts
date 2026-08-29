import { describe, expect, it } from 'vitest';
import {
  applyPlanVariant,
  inverseTransformPlanPoint,
  planVariantDefinition,
  planVariantFromQuery,
  transformPlanPoint,
} from './plan-variants';
import type { StaticMapEntry, WorldData, WorldObject } from './types';

const expectedB = {
  '51A': { rotationDeg: 0, mirrorX: true, mirrorY: false },
  '55A': { rotationDeg: -90, mirrorX: true, mirrorY: false },
  '55B': { rotationDeg: -180, mirrorX: false, mirrorY: true },
  '59A': { rotationDeg: 0, mirrorX: true, mirrorY: false },
};

describe('RPG apartment plan variants', () => {
  it('matches every A/B transform used by the original site plan', () => {
    for (const [unitType, transform] of Object.entries(expectedB)) {
      expect(planVariantDefinition(unitType, 'A').transform).toEqual({ rotationDeg: 0, mirrorX: false, mirrorY: false });
      expect(planVariantDefinition(unitType, 'B').transform).toEqual(transform);
      expect(planVariantDefinition(unitType, 'B').targetPlan).toBe(`${unitType}-B`);
    }
  });

  it('reads only A/B query values and keeps point transforms invertible', () => {
    expect(planVariantFromQuery('?variant=b')).toBe('B');
    expect(planVariantFromQuery('?variant=unknown')).toBe('A');
    const transform = expectedB['55A'];
    const source: [number, number] = [3.25, 7.5];
    const transformed = transformPlanPoint(source, transform);
    expect(inverseTransformPlanPoint(transformed, transform)).toEqual(source);
  });

  it('rotates the apartment and its blocked cells together', () => {
    const entry = { id: 'map', unitType: '55A', spawn: { x: 10, y: 10 } } as StaticMapEntry;
    const apartment: WorldObject = {
      type: 'enterable-apartment-unit-v1',
      x: 10,
      y: 10,
      originCell: { x: 10, y: 10 },
      transform: { rotationDeg: 0, mirrorX: false, mirrorY: false },
      blockedCells: [{ x: 12, y: 11 }],
      geometry: { cellSizeMeters: .5, floorPolygon: [[0, 0], [2, 0], [2, 1], [0, 1]] },
    };
    const world = {
      entry,
      objects: [apartment],
      blocked: new Set(['12,11', '1,1']),
    } as WorldData;
    const definition = applyPlanVariant(world, 'B');
    expect(definition.targetPlan).toBe('55A-B');
    expect(apartment.transform).toEqual(expectedB['55A']);
    expect(apartment.blockedCells).toEqual([{ x: 11, y: 12 }]);
    expect(world.blocked).toEqual(new Set(['1,1', '11,12']));
  });
});
