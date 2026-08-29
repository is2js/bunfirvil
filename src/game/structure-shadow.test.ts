import { describe, expect, it } from 'vitest';
import { castsExteriorStructureShadow, isExteriorWall } from './structure-shadow';

describe('apartment exterior shadow policy', () => {
  it('allows only opaque exterior walls to cast on the outside ground', () => {
    expect(isExteriorWall({ kind: 'exterior' })).toBe(true);
    expect(castsExteriorStructureShadow({ kind: 'exterior' })).toBe(true);
    expect(castsExteriorStructureShadow({ kind: 'exterior' }, true)).toBe(false);
    expect(castsExteriorStructureShadow({ kind: 'interior' })).toBe(false);
    expect(castsExteriorStructureShadow({ kind: 'service' })).toBe(false);
    expect(castsExteriorStructureShadow({ structuralRole: 'partition-wall' })).toBe(false);
  });
});
