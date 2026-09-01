import type { StaticMapEntry } from './types';
import type { ApartmentPlanVariant } from './plan-variants';

export type BundangUnitType = '51A' | '55A' | '55B' | '59A';
export type HouseholdFacing = 'south-east' | 'south-west';
export type VariantConfidence = 'pvp-authoritative' | 'site-plan-inferred';

export interface BundangHouseholdLineV1 {
  lineId: number;
  unitType: BundangUnitType;
  firstFloor: number;
  lastFloor: number;
  pilotisFloors: number[];
  planVariant: ApartmentPlanVariant;
  facing: HouseholdFacing;
  confidence: VariantConfidence;
}

export interface BundangBuildingV1 {
  buildingId: string;
  lines: BundangHouseholdLineV1[];
}

export interface BundangHouseholdCatalogV1 {
  schemaVersion: 1;
  complexId: 'bundang-first-village';
  buildings: BundangBuildingV1[];
}

export interface HouseholdSelectionV1 {
  buildingId: string;
  floor: number;
  lineId: number;
  householdNumber: string;
  unitType: BundangUnitType;
  mapId: string;
  planVariant: ApartmentPlanVariant;
  facing: HouseholdFacing;
  confidence: VariantConfidence;
}

interface LineSeed {
  unitType: BundangUnitType;
  firstFloor: number;
  lastFloor: number;
  pilotisFloors?: number[];
}

const VARIANTS: Record<string, ApartmentPlanVariant[]> = {
  '101': ['B', 'B', 'B', 'A'],
  '102': ['B', 'B', 'A', 'B', 'A'],
  '103': ['B', 'B', 'A', 'B', 'A'],
  '104': ['A', 'B', 'B', 'A', 'B', 'A'],
  '105': ['A', 'B', 'B', 'A', 'A', 'B'],
  '106': ['B', 'B', 'A', 'B', 'A'],
  '107': ['A', 'B', 'A', 'A'],
  '108': ['A', 'B', 'A', 'A'],
  '109': ['A', 'B', 'B', 'A', 'B', 'A'],
  '110': ['B', 'A', 'B', 'A', 'B', 'A'],
  '111': ['A', 'B', 'A', 'B', 'A', 'B'],
  '112': ['B', 'A', 'A', 'B'],
};

const BUILDING_LINES: Record<string, LineSeed[]> = {
  '101': [
    { unitType: '55A', firstFloor: 2, lastFloor: 17, pilotisFloors: [1] },
    { unitType: '55B', firstFloor: 2, lastFloor: 17, pilotisFloors: [1] },
    { unitType: '55A', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
    { unitType: '55A', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
  ],
  '102': [
    { unitType: '55A', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
    { unitType: '55B', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
    { unitType: '55A', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
    { unitType: '59A', firstFloor: 2, lastFloor: 22, pilotisFloors: [1] },
    { unitType: '59A', firstFloor: 2, lastFloor: 22, pilotisFloors: [1] },
  ],
  '103': [
    { unitType: '55A', firstFloor: 1, lastFloor: 25 },
    { unitType: '55B', firstFloor: 1, lastFloor: 25 },
    { unitType: '55A', firstFloor: 2, lastFloor: 25, pilotisFloors: [1] },
    { unitType: '59A', firstFloor: 1, lastFloor: 24 },
    { unitType: '59A', firstFloor: 1, lastFloor: 24 },
  ],
  '104': [
    { unitType: '51A', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
    { unitType: '51A', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
    { unitType: '55B', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
    { unitType: '55A', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
    { unitType: '59A', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
    { unitType: '59A', firstFloor: 4, lastFloor: 24, pilotisFloors: [1, 2, 3] },
  ],
  '105': [
    { unitType: '51A', firstFloor: 2, lastFloor: 25, pilotisFloors: [1] },
    { unitType: '51A', firstFloor: 2, lastFloor: 25, pilotisFloors: [1] },
    { unitType: '55B', firstFloor: 2, lastFloor: 25, pilotisFloors: [1] },
    { unitType: '55A', firstFloor: 1, lastFloor: 25 },
    { unitType: '51A', firstFloor: 1, lastFloor: 25 },
    { unitType: '51A', firstFloor: 1, lastFloor: 25 },
  ],
  '106': [
    { unitType: '55A', firstFloor: 1, lastFloor: 24 },
    { unitType: '55B', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
    { unitType: '55A', firstFloor: 2, lastFloor: 24, pilotisFloors: [1] },
    { unitType: '59A', firstFloor: 2, lastFloor: 22, pilotisFloors: [1] },
    { unitType: '59A', firstFloor: 2, lastFloor: 19, pilotisFloors: [1] },
  ],
  '107': [
    { unitType: '51A', firstFloor: 1, lastFloor: 23 },
    { unitType: '51A', firstFloor: 1, lastFloor: 23 },
    { unitType: '55B', firstFloor: 1, lastFloor: 25 },
    { unitType: '55A', firstFloor: 2, lastFloor: 25, pilotisFloors: [1] },
  ],
  '108': [
    { unitType: '51A', firstFloor: 1, lastFloor: 20 },
    { unitType: '51A', firstFloor: 1, lastFloor: 20 },
    { unitType: '55B', firstFloor: 1, lastFloor: 25 },
    { unitType: '55A', firstFloor: 2, lastFloor: 25, pilotisFloors: [1] },
  ],
  '109': [
    { unitType: '51A', firstFloor: 2, lastFloor: 25, pilotisFloors: [1] },
    { unitType: '51A', firstFloor: 2, lastFloor: 25, pilotisFloors: [1] },
    { unitType: '55B', firstFloor: 2, lastFloor: 21, pilotisFloors: [1] },
    { unitType: '55A', firstFloor: 2, lastFloor: 21, pilotisFloors: [1] },
    { unitType: '59A', firstFloor: 1, lastFloor: 19 },
    { unitType: '59A', firstFloor: 1, lastFloor: 19 },
  ],
  '110': [
    { unitType: '55A', firstFloor: 1, lastFloor: 25 },
    { unitType: '55A', firstFloor: 1, lastFloor: 25 },
    { unitType: '55B', firstFloor: 1, lastFloor: 25 },
    { unitType: '55A', firstFloor: 2, lastFloor: 25, pilotisFloors: [1] },
    { unitType: '59A', firstFloor: 1, lastFloor: 22 },
    { unitType: '59A', firstFloor: 1, lastFloor: 22 },
  ],
  '111': [
    { unitType: '51A', firstFloor: 1, lastFloor: 18 },
    { unitType: '51A', firstFloor: 1, lastFloor: 25 },
    { unitType: '55A', firstFloor: 2, lastFloor: 25, pilotisFloors: [1] },
    { unitType: '55B', firstFloor: 1, lastFloor: 25 },
    { unitType: '51A', firstFloor: 1, lastFloor: 25 },
    { unitType: '51A', firstFloor: 2, lastFloor: 18, pilotisFloors: [1] },
  ],
  '112': [
    { unitType: '55A', firstFloor: 1, lastFloor: 25 },
    { unitType: '55A', firstFloor: 1, lastFloor: 25 },
    { unitType: '51A', firstFloor: 1, lastFloor: 25 },
    { unitType: '51A', firstFloor: 1, lastFloor: 25 },
  ],
};

function facingForLine(lineCount: number, lineId: number): HouseholdFacing {
  const southEastLastLine = lineCount === 4 ? 2 : lineCount === 5 ? 2 : 3;
  return lineId <= southEastLastLine ? 'south-east' : 'south-west';
}

function buildCatalog(): BundangHouseholdCatalogV1 {
  const buildings = Object.entries(BUILDING_LINES).map(([buildingId, seeds]) => {
    const variants = VARIANTS[buildingId];
    if (!variants || variants.length !== seeds.length) throw new Error(`${buildingId}동 A/B 매핑이 호라인과 일치하지 않습니다.`);
    const confidence: VariantConfidence = buildingId === '105' || buildingId === '106'
      ? 'pvp-authoritative'
      : 'site-plan-inferred';
    return {
      buildingId,
      lines: seeds.map((seed, index): BundangHouseholdLineV1 => ({
        ...seed,
        pilotisFloors: [...(seed.pilotisFloors || [])],
        lineId: index + 1,
        planVariant: variants[index],
        facing: facingForLine(seeds.length, index + 1),
        confidence,
      })),
    };
  });
  return { schemaVersion: 1, complexId: 'bundang-first-village', buildings };
}

export const BUNDANG_HOUSEHOLD_CATALOG = buildCatalog();

export function householdNumber(floor: number, lineId: number): string {
  return String(floor * 100 + lineId);
}

export function householdSelection(
  buildingId: string,
  floor: number,
  lineId: number,
  maps: StaticMapEntry[],
): HouseholdSelectionV1 | null {
  const building = BUNDANG_HOUSEHOLD_CATALOG.buildings.find((entry) => entry.buildingId === buildingId);
  const line = building?.lines.find((entry) => entry.lineId === lineId);
  if (!line || floor < line.firstFloor || floor > line.lastFloor) return null;
  const map = maps.find((entry) => entry.unitType.toUpperCase() === line.unitType);
  if (!map) return null;
  return {
    buildingId,
    floor,
    lineId,
    householdNumber: householdNumber(floor, lineId),
    unitType: line.unitType,
    mapId: map.id,
    planVariant: line.planVariant,
    facing: line.facing,
    confidence: line.confidence,
  };
}

export function householdCounts(): Record<BundangUnitType | 'total', number> {
  const counts: Record<BundangUnitType | 'total', number> = { '51A': 0, '55A': 0, '55B': 0, '59A': 0, total: 0 };
  for (const building of BUNDANG_HOUSEHOLD_CATALOG.buildings) {
    for (const line of building.lines) {
      const count = line.lastFloor - line.firstFloor + 1;
      counts[line.unitType] += count;
      counts.total += count;
    }
  }
  return counts;
}

export function hasValidMapQuery(maps: StaticMapEntry[], search: string): boolean {
  const requested = new URLSearchParams(search).get('map');
  return Boolean(requested && maps.some((map) => map.id === requested));
}
