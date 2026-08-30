import { describe, expect, it } from 'vitest';
import {
  applyPlanVariant,
  applyPlanVariantInteriorOverrides,
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

  it('applies pvp-authored B fixture and 55B dining direction overrides without losing glass mirroring', () => {
    const apartment: WorldObject = {
      unitTypeId: '55B',
      planVariant: 'A',
      geometry: {
        optionAnchors: {
          resolvedPlanVariant: 'A',
          planVariantOverrides: {
            schemaVersion: 'bundang-apartment-plan-variant-overrides-v2',
            B: {
              bathrooms: {
                fixtureIds: ['toilet', 'basin', 'wetFixture'],
                yawOffsetDeg: 180,
                roomOverrides: {
                  'bathroom-1': { wetFixture: { yawOffsetDeg: 0 } },
                },
              },
              kitchen: {
                island: {
                  yawOffsetDeg: 180,
                  frontFaces: 'toward-refrigerator-cabinet',
                  diningChairYawOffsetDeg: 180,
                  diningChairFacingRule: 'toward-table-center',
                },
              },
            },
          },
          bathrooms: {
            'bathroom-1': {
              toilet: { positionMeters: [3.78, 3.72], yawDeg: 180 },
              basin: { positionMeters: [4.3, 3.72], yawDeg: 180 },
              wetFixture: { positionMeters: [5.05, 3.05], yawDeg: 180, mirrored: true },
            },
          },
          kitchen: {
            island: { yawDeg: 270, frontFaces: 'away-from-living' },
          },
        },
        interiorProps: [
          { id: 'toilet', anchorId: 'bathroom-1.toilet', positionMeters: [0, 0], yawDeg: 180 },
          { id: 'basin', anchorId: 'bathroom-1.basin', positionMeters: [0, 0], yawDeg: 180 },
          { id: 'shower', anchorId: 'bathroom-1.wetFixture', positionMeters: [0, 0], yawDeg: 180, mirrored: true },
        ],
      },
    };

    applyPlanVariantInteriorOverrides(apartment, 'B');
    const anchors = apartment.geometry?.optionAnchors as Record<string, any>;
    expect(anchors.resolvedPlanVariant).toBe('B');
    expect(anchors.bathrooms['bathroom-1'].toilet.yawDeg).toBe(0);
    expect(anchors.bathrooms['bathroom-1'].basin.yawDeg).toBe(0);
    expect(anchors.bathrooms['bathroom-1'].wetFixture.yawDeg).toBe(180);
    expect(anchors.bathrooms['bathroom-1'].wetFixture.mirrored).toBe(true);
    expect(anchors.kitchen.island).toMatchObject({
      yawDeg: 90,
      frontFaces: 'toward-refrigerator-cabinet',
      diningChairYawOffsetDeg: 180,
      diningChairFacingRule: 'toward-table-center',
    });
    expect(apartment.geometry?.interiorProps).toEqual([
      { id: 'toilet', anchorId: 'bathroom-1.toilet', positionMeters: [3.78, 3.72], yawDeg: 0, mirrored: false },
      { id: 'basin', anchorId: 'bathroom-1.basin', positionMeters: [4.3, 3.72], yawDeg: 0, mirrored: false },
      { id: 'shower', anchorId: 'bathroom-1.wetFixture', positionMeters: [5.05, 3.05], yawDeg: 180, mirrored: true },
    ]);
  });

  it('keeps the 59AB bathtub fixed while separating the basin and toilet footprints', () => {
    const apartment: WorldObject = {
      unitTypeId: '59A',
      planVariant: 'A',
      geometry: {
        optionAnchors: {
          resolvedPlanVariant: 'A',
          planVariantOverrides: {
            schemaVersion: 'bundang-apartment-plan-variant-overrides-v2',
            B: {
              bathrooms: {
                fixtureIds: ['toilet', 'basin', 'wetFixture'],
                yawOffsetDeg: 180,
                roomOverrides: {
                  'bathroom-1': { wetFixture: { yawOffsetDeg: 0 } },
                  'bathroom-2': {
                    basin: { positionMeters: [12.11, 4.58] },
                    toilet: { positionMeters: [12.11, 5.2] },
                  },
                },
              },
            },
          },
          bathrooms: {
            'bathroom-1': {
              wetFixture: { positionMeters: [3.18, 3.31], yawDeg: 90, mirrored: false },
            },
            'bathroom-2': {
              toilet: { positionMeters: [12.11, 5.1], yawDeg: 90 },
              basin: { positionMeters: [12.11, 4.3], yawDeg: 90 },
              wetFixture: { positionMeters: [11.65, 3.88], yawDeg: 0 },
            },
          },
        },
        interiorProps: [],
      },
    };

    applyPlanVariantInteriorOverrides(apartment, 'B');
    const bathrooms = (apartment.geometry?.optionAnchors as Record<string, any>).bathrooms;
    expect(bathrooms['bathroom-1'].wetFixture.yawDeg).toBe(90);
    expect(bathrooms['bathroom-2'].wetFixture.positionMeters).toEqual([11.65, 3.88]);
    expect(bathrooms['bathroom-2'].basin.positionMeters).toEqual([12.11, 4.58]);
    expect(bathrooms['bathroom-2'].toilet.positionMeters).toEqual([12.11, 5.2]);
  });

  it.each([
    ['51A', 'B', 270],
    ['55A', 'A', 90],
    ['55A', 'B', 90],
    ['55B', 'B', 180],
    ['59A', 'B', 90],
  ] as const)('mounts the %s %s shower column against its service wall at %i degrees', (unitTypeId, variant, expectedYaw) => {
    const baseYaw = { '51A': 270, '55A': 270, '55B': 180, '59A': 90 }[unitTypeId];
    const apartment: WorldObject = {
      unitTypeId,
      geometry: {
        optionAnchors: {
          resolvedPlanVariant: 'A',
          planVariantOverrides: {
            B: {
              bathrooms: {
                fixtureIds: ['toilet', 'basin', 'wetFixture'],
                yawOffsetDeg: 180,
                roomOverrides: unitTypeId === '55A'
                  ? {}
                  : { 'bathroom-1': { wetFixture: { yawOffsetDeg: 0 } } },
              },
            },
          },
          bathrooms: {
            'bathroom-1': {
              wetFixture: {
                assetId: 'shower-booth-glass-corner',
                positionMeters: [0, 0],
                yawDeg: baseYaw,
              },
            },
          },
        },
        interiorProps: [{
          id: 'shower',
          assetId: 'shower-booth-glass-corner',
          anchorId: 'bathroom-1.wetFixture',
          positionMeters: [0, 0],
          yawDeg: baseYaw,
        }],
      },
    };

    applyPlanVariantInteriorOverrides(apartment, variant);

    const anchors = apartment.geometry?.optionAnchors as Record<string, any>;
    expect(anchors.bathrooms['bathroom-1'].wetFixture.yawDeg).toBe(expectedYaw);
    expect(apartment.geometry?.interiorProps?.[0].yawDeg).toBe(expectedYaw);
  });
});
