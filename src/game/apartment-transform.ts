import type { ApartmentInteriorProp, WorldObject } from './types';

export type NumericPoint = [number, number];

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** PVP apartment-unit.mjs와 동일한 로컬(m) -> 월드(cell) 좌표 변환. */
export function apartmentUnitWorldPoint(object: WorldObject, point: NumericPoint): { x: number; y: number } {
  const sourceX = finite(point[0]);
  const sourceY = finite(point[1]);
  const transform = object.transform || {};
  const mirroredX = transform.mirrorX ? -sourceX : sourceX;
  const mirroredY = transform.mirrorY ? -sourceY : sourceY;
  const radians = finite(transform.rotationDeg) * Math.PI / 180;
  const localX = mirroredX * Math.cos(radians) - mirroredY * Math.sin(radians);
  const localY = mirroredX * Math.sin(radians) + mirroredY * Math.cos(radians);
  const cellSize = Math.max(0.01, finite(object.geometry?.cellSizeMeters, 0.5));
  return {
    x: finite(object.originCell?.x, finite(object.x)) + localX / cellSize,
    y: finite(object.originCell?.y, finite(object.y)) + localY / cellSize,
  };
}

/** 미러/회전이 있는 세대에서도 소품의 중심과 yaw를 원본 렌더러와 똑같이 계산한다. */
export function apartmentPropPlacement(object: WorldObject, prop: ApartmentInteriorProp): {
  center: { x: number; y: number };
  worldYaw: number;
  cellSize: number;
} {
  const source = Array.isArray(prop.positionMeters) ? prop.positionMeters : [0, 0];
  const localX = finite(source[0]);
  const localY = finite(source[1]);
  const yaw = finite(prop.yawDeg) * Math.PI / 180;
  const center = apartmentUnitWorldPoint(object, [localX, localY]);
  const east = apartmentUnitWorldPoint(object, [
    localX + Math.cos(yaw),
    localY + Math.sin(yaw),
  ]);
  return {
    center,
    worldYaw: -Math.atan2(east.y - center.y, east.x - center.x),
    cellSize: Math.max(0.01, finite(object.geometry?.cellSizeMeters, 0.5)),
  };
}

function pointInPolygon(point: NumericPoint, polygon: NumericPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  let previous = polygon[polygon.length - 1];
  for (const current of polygon) {
    const crosses = (current[1] > point[1]) !== (previous[1] > point[1]);
    const boundaryX = (previous[0] - current[0]) * (point[1] - current[1])
      / ((previous[1] - current[1]) || 1e-9) + current[0];
    if (crosses && point[0] < boundaryX) inside = !inside;
    previous = current;
  }
  return inside;
}

function polygonFrom(value: unknown): NumericPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point): NumericPoint[] => Array.isArray(point) && point.length >= 2
    ? [[finite(point[0]), finite(point[1])]]
    : []);
}

/** 원본의 15mm wall-contact clearance를 적용해 solid block과 벽의 공면 겹침을 없앤다. */
export function apartmentSolidBlockVisualFootprint(
  object: WorldObject,
  block: Record<string, unknown>,
): NumericPoint[] {
  const explicit = polygonFrom(block.footprintPolygonMeters || block.polygon);
  const bounds = Array.isArray(block.boundsMeters) ? block.boundsMeters.map((item) => finite(item)) : [];
  const source = explicit.length >= 3
    ? explicit
    : bounds.length === 4
      ? [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]]] as NumericPoint[]
      : [];
  if (source.length < 3) return source;
  const clearance = Math.max(0, finite(
    block.wallContactClearanceMeters,
    finite(object.geometry?.solidBlockWallContactClearanceMeters, 0.015),
  ));
  if (clearance <= 0.000001) return source;
  const minX = Math.min(...source.map(([x]) => x));
  const maxX = Math.max(...source.map(([x]) => x));
  const minY = Math.min(...source.map(([, y]) => y));
  const maxY = Math.max(...source.map(([, y]) => y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  let visualMinX = minX;
  let visualMaxX = maxX;
  let visualMinY = minY;
  let visualMaxY = maxY;
  const tolerance = Math.max(0.0001, clearance * 0.1);
  for (const value of object.geometry?.wallSegments || []) {
    const wall = value as Record<string, unknown>;
    if (!Array.isArray(wall.a) || !Array.isArray(wall.b)) continue;
    const ax = finite(wall.a[0]); const ay = finite(wall.a[1]);
    const bx = finite(wall.b[0]); const by = finite(wall.b[1]);
    const half = Math.max(0.001, finite(wall.thicknessMeters, 0.12)) / 2;
    if (Math.abs(ay - by) <= 0.0001 && maxX >= Math.min(ax, bx) - tolerance && minX <= Math.max(ax, bx) + tolerance) {
      if (centerY > ay + tolerance && minY >= ay - half - tolerance && minY <= ay + half + tolerance) visualMinY = Math.max(visualMinY, ay + half + clearance);
      if (centerY < ay - tolerance && maxY >= ay - half - tolerance && maxY <= ay + half + tolerance) visualMaxY = Math.min(visualMaxY, ay - half - clearance);
    } else if (Math.abs(ax - bx) <= 0.0001 && maxY >= Math.min(ay, by) - tolerance && minY <= Math.max(ay, by) + tolerance) {
      if (centerX > ax + tolerance && minX >= ax - half - tolerance && minX <= ax + half + tolerance) visualMinX = Math.max(visualMinX, ax + half + clearance);
      if (centerX < ax - tolerance && maxX >= ax - half - tolerance && maxX <= ax + half + tolerance) visualMaxX = Math.min(visualMaxX, ax - half - clearance);
    }
  }
  if (visualMinX >= visualMaxX - 0.001 || visualMinY >= visualMaxY - 0.001) return source;
  return source.map(([x, y]) => [
    Math.abs(x - minX) <= tolerance ? visualMinX : Math.abs(x - maxX) <= tolerance ? visualMaxX : x,
    Math.abs(y - minY) <= tolerance ? visualMinY : Math.abs(y - maxY) <= tolerance ? visualMaxY : y,
  ]);
}

/** 배포용 데이터의 소품 좌표가 해당 세대 바닥/방에 속하는지 빠르게 검수한다. */
export function auditApartmentPropPlacements(
  object: WorldObject,
  props: ApartmentInteriorProp[],
): { checked: number; issues: string[] } {
  const floor = polygonFrom(object.geometry?.floorPolygon);
  const rooms = (object.geometry?.roomZones || []).map((value) => {
    const room = value as Record<string, unknown>;
    const explicit = polygonFrom(room.footprintPolygonMeters || room.polygon);
    const bounds = Array.isArray(room.boundsMeters) ? room.boundsMeters.map((item) => finite(item)) : [];
    const polygon = explicit.length >= 3
      ? explicit
      : bounds.length === 4
        ? [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]]] as NumericPoint[]
        : [];
    return { id: String(room.id || room.roomId || ''), polygon };
  });
  const issues: string[] = [];
  for (const prop of props) {
    const id = String(prop.id || prop.assetId || 'unknown');
    const source = Array.isArray(prop.positionMeters) ? prop.positionMeters : [];
    if (source.length !== 2 || !source.every((value) => Number.isFinite(Number(value)))) {
      issues.push(`${id}:invalid-position`);
      continue;
    }
    const point: NumericPoint = [Number(source[0]), Number(source[1])];
    if (floor.length >= 3 && !pointInPolygon(point, floor)) issues.push(`${id}:outside-floor`);
    const requestedRoom = String(prop.roomZoneId || '');
    const room = rooms.find((candidate) => candidate.id === requestedRoom);
    if (requestedRoom && requestedRoom !== 'wood-floor-continuous' && !room) {
      issues.push(`${id}:unknown-room`);
    }
  }
  return { checked: props.length, issues };
}
