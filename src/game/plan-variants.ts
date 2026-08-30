import {
  apartmentUnitWorldPoint,
  apartmentWorldPointToLocalMeters,
  type NumericPoint,
} from './apartment-transform';
import type { WorldData, WorldObject } from './types';

export type ApartmentPlanVariant = 'A' | 'B';

export interface ApartmentPlanVariantDefinition {
  variant: ApartmentPlanVariant;
  label: string;
  sourcePlan: string;
  targetPlan: string;
  transform: { rotationDeg: number; mirrorX: boolean; mirrorY: boolean };
  operations: string[];
}

const SOURCE_TRANSFORM = Object.freeze({ rotationDeg: 0, mirrorX: false, mirrorY: false });

const RPG_VARIANT_B: Record<string, Omit<ApartmentPlanVariantDefinition, 'variant' | 'label' | 'sourcePlan'>> = {
  '51A': {
    targetPlan: '51A-B',
    transform: { rotationDeg: 0, mirrorX: true, mirrorY: false },
    operations: ['좌우반전'],
  },
  '55A': {
    targetPlan: '55A-B',
    transform: { rotationDeg: -90, mirrorX: true, mirrorY: false },
    operations: ['좌우반전', '반시계 90° 회전'],
  },
  '55B': {
    targetPlan: '55B-B',
    transform: { rotationDeg: -180, mirrorX: false, mirrorY: true },
    operations: ['상하반전', '반시계 180° 회전'],
  },
  '59A': {
    targetPlan: '59A-B',
    transform: { rotationDeg: 0, mirrorX: true, mirrorY: false },
    operations: ['좌우반전'],
  },
};

export function planVariantDefinition(unitType: string, variant: ApartmentPlanVariant): ApartmentPlanVariantDefinition {
  const unit = String(unitType || '').toUpperCase();
  if (variant === 'B' && RPG_VARIANT_B[unit]) {
    return {
      variant,
      label: 'B형',
      sourcePlan: `${unit}-A`,
      ...RPG_VARIANT_B[unit],
      transform: { ...RPG_VARIANT_B[unit].transform },
      operations: [...RPG_VARIANT_B[unit].operations],
    };
  }
  return {
    variant: 'A',
    label: 'A형',
    sourcePlan: `${unit}-A`,
    targetPlan: `${unit}-A`,
    transform: { ...SOURCE_TRANSFORM },
    operations: [],
  };
}

export function planVariantFromQuery(search: string): ApartmentPlanVariant {
  const requested = new URLSearchParams(search).get('variant')?.toUpperCase();
  return requested === 'B' ? 'B' : 'A';
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function transformAbsoluteCells(
  apartment: WorldObject,
  sourceTransform: NonNullable<WorldObject['transform']>,
  cells: Array<{ x: number; y: number }> | undefined,
): Array<{ x: number; y: number }> {
  if (!cells?.length) return [];
  const targetTransform = apartment.transform;
  apartment.transform = sourceTransform;
  const local = cells.map((cell) => apartmentWorldPointToLocalMeters(apartment, cell));
  apartment.transform = targetTransform;
  return local.map((point) => {
    const transformed = apartmentUnitWorldPoint(apartment, point);
    return { x: Math.round(transformed.x), y: Math.round(transformed.y) };
  });
}

function transformedFloorBounds(apartment: WorldObject): WorldObject['bounds'] {
  const floor = apartment.geometry?.floorPolygon;
  if (!Array.isArray(floor)) return apartment.bounds;
  const points = floor.flatMap((value): NumericPoint[] => Array.isArray(value) && value.length >= 2
    ? [[Number(value[0]) || 0, Number(value[1]) || 0]] : []);
  if (points.length < 3) return apartment.bounds;
  const world = points.map((point) => apartmentUnitWorldPoint(apartment, point));
  return {
    x1: Math.floor(Math.min(...world.map((point) => point.x))),
    y1: Math.floor(Math.min(...world.map((point) => point.y))),
    x2: Math.ceil(Math.max(...world.map((point) => point.x))),
    y2: Math.ceil(Math.max(...world.map((point) => point.y))),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedYaw(value: unknown): number {
  return ((Number(value) || 0) % 360 + 360) % 360;
}

/** pvp optionAnchors의 비대칭 설비 규칙을 정적 A 원형에 결정적으로 적용한다. */
export function applyPlanVariantInteriorOverrides(
  apartment: WorldObject,
  variant: ApartmentPlanVariant,
): void {
  const geometry = apartment.geometry;
  const anchors = record(geometry?.optionAnchors);
  if (!geometry || !anchors) return;
  anchors.resolvedPlanVariant = variant;
  const overrides = record(anchors.planVariantOverrides);
  const override = record(overrides?.[variant]);
  if (!override) return;

  const bathroomOverride = record(override.bathrooms);
  const bathrooms = record(anchors.bathrooms);
  if (bathroomOverride && bathrooms) {
    const fixtureIds = Array.isArray(bathroomOverride.fixtureIds)
      ? bathroomOverride.fixtureIds.map(String)
      : [];
    const yawOffsetDeg = Number(bathroomOverride.yawOffsetDeg) || 0;
    for (const fixturesValue of Object.values(bathrooms)) {
      const fixtures = record(fixturesValue);
      if (!fixtures) continue;
      for (const fixtureId of fixtureIds) {
        const fixture = record(fixtures[fixtureId]);
        if (fixture) fixture.yawDeg = normalizedYaw(Number(fixture.yawDeg) + yawOffsetDeg);
      }
    }
  }

  const islandOverride = record(record(override.kitchen)?.island);
  const island = record(record(anchors.kitchen)?.island);
  if (islandOverride && island) {
    island.yawDeg = normalizedYaw(
      Number(island.yawDeg) + (Number(islandOverride.yawOffsetDeg) || 0),
    );
    for (const field of ['frontFaces', 'diningChairYawOffsetDeg', 'diningChairFacingRule']) {
      if (field in islandOverride) island[field] = islandOverride[field];
    }
  }

  // options/runtime.mjs가 준비되기 전 geometry.interiorProps fallback도
  // 같은 앵커를 사용하게 해 첫 paint의 방향 불일치를 막는다.
  for (const prop of geometry.interiorProps || []) {
    const anchorId = String(prop.anchorId || '');
    const match = anchorId.match(/^(bathroom-[12])\.(toilet|basin|wetFixture)$/);
    if (!match) continue;
    const fixture = record(record(bathrooms?.[match[1]])?.[match[2]]);
    if (!fixture) continue;
    if (Array.isArray(fixture.positionMeters)) prop.positionMeters = [...fixture.positionMeters].map(Number);
    prop.yawDeg = normalizedYaw(fixture.yawDeg);
    prop.mirrored = fixture.mirrored === true;
  }
}

/** 원본 RPG 단지배치의 A/B 변환을 구조물, 가구와 충돌 셀에 한 번에 적용한다. */
export function applyPlanVariant(world: WorldData, variant: ApartmentPlanVariant): ApartmentPlanVariantDefinition {
  const definition = planVariantDefinition(world.entry.unitType, variant);
  const apartment = world.objects.find((object) => object.type === 'enterable-apartment-unit-v1' && object.geometry);
  if (!apartment) return definition;

  const sourceTransform = { ...SOURCE_TRANSFORM };
  const sourceBlockedCells = apartment.blockedCells?.map((cell) => ({ ...cell })) || [];
  const sourceBlockedKeys = new Set(sourceBlockedCells.map((cell) => cellKey(cell.x, cell.y)));
  const preservedBlockedKeys = [...world.blocked].filter((key) => !sourceBlockedKeys.has(key));

  apartment.transform = { ...definition.transform };
  apartment.planVariant = definition.variant;
  apartment.planVariantTransform = {
    sourcePlan: definition.sourcePlan,
    targetPlan: definition.targetPlan,
    operations: [...definition.operations],
  };
  applyPlanVariantInteriorOverrides(apartment, definition.variant);

  const transformedBlockedCells = transformAbsoluteCells(apartment, sourceTransform, sourceBlockedCells);
  if (transformedBlockedCells.length) {
    apartment.blockedCells = transformedBlockedCells;
    world.blocked.clear();
    preservedBlockedKeys.forEach((key) => world.blocked.add(key));
    transformedBlockedCells.forEach((cell) => world.blocked.add(cellKey(cell.x, cell.y)));
  }
  apartment.bounds = transformedFloorBounds(apartment);
  return definition;
}

export function transformPlanPoint(point: NumericPoint, transform: WorldObject['transform']): NumericPoint {
  const mirroredX = transform?.mirrorX ? -point[0] : point[0];
  const mirroredY = transform?.mirrorY ? -point[1] : point[1];
  const radians = (Number(transform?.rotationDeg) || 0) * Math.PI / 180;
  return [
    mirroredX * Math.cos(radians) - mirroredY * Math.sin(radians),
    mirroredX * Math.sin(radians) + mirroredY * Math.cos(radians),
  ];
}

export function inverseTransformPlanPoint(point: NumericPoint, transform: WorldObject['transform']): NumericPoint {
  const radians = -(Number(transform?.rotationDeg) || 0) * Math.PI / 180;
  const rotatedX = point[0] * Math.cos(radians) - point[1] * Math.sin(radians);
  const rotatedY = point[0] * Math.sin(radians) + point[1] * Math.cos(radians);
  return [transform?.mirrorX ? -rotatedX : rotatedX, transform?.mirrorY ? -rotatedY : rotatedY];
}
