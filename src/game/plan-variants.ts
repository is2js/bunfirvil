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
