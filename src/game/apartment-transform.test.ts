import { describe, expect, it } from 'vitest';
import { apartmentPropPlacement, apartmentSolidBlockVisualFootprint } from './apartment-transform';
import type { WorldObject } from './types';

describe('apartment solid-block presentation', () => {
  it('rotates 55A-B kitchen fixture bodies with the same 90-degree plan transform as their countertops', () => {
    const apartment: WorldObject = {
      unitTypeId: '55A',
      transform: { rotationDeg: -90, mirrorX: true, mirrorY: false },
      geometry: { cellSizeMeters: 0.5 },
    };
    const placement = apartmentPropPlacement(apartment, {
      positionMeters: [5.225, 0.51],
      yawDeg: 0,
    });
    expect(placement.worldYaw).toBeCloseTo(-Math.PI / 2, 8);
  });

  it('keeps the 59A bathroom-2 service wall inside the bathroom in both plan variants', () => {
    for (const transform of [
      { rotationDeg: 0, mirrorX: false, mirrorY: false },
      { rotationDeg: 0, mirrorX: true, mirrorY: false },
    ]) {
      const apartment: WorldObject = {
        unitTypeId: '59A',
        transform,
        geometry: {
          roomZones: [{
            id: 'bathroom-2',
            boundsMeters: [10.85, 2.95, 12.45, 5.55],
          }],
          wallSegments: [],
        },
      };
      const footprint = apartmentSolidBlockVisualFootprint(apartment, {
        id: 'bathroom-2-north-service-block',
        structuralRole: 'service-wall',
        boundsMeters: [10.7, 2.7, 12.7, 3.55],
      });

      expect(footprint).toEqual([
        [10.85, 2.95],
        [12.45, 2.95],
        [12.45, 3.55],
        [10.85, 3.55],
      ]);
    }
  });

  it('does not alter unrelated service blocks', () => {
    const apartment: WorldObject = {
      unitTypeId: '55A',
      geometry: {
        roomZones: [{ id: 'bathroom-2', boundsMeters: [10, 3, 12, 6] }],
        wallSegments: [],
      },
    };
    expect(apartmentSolidBlockVisualFootprint(apartment, {
      id: 'bathroom-2-north-service-block',
      boundsMeters: [9.8, 2.8, 12.2, 3.6],
    })).toEqual([
      [9.8, 2.8],
      [12.2, 2.8],
      [12.2, 3.6],
      [9.8, 3.6],
    ]);
  });
});
