import type { InteriorAssetEntry } from '../manage/interior-layout';
import type { ApartmentGeometry, ApartmentInteriorProp } from './types';

export interface FurnitureWallSnapResult {
  positionMeters: [number, number];
  wallId: string;
  distanceMeters: number;
}

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dimensions(prop: ApartmentInteriorProp, asset?: InteriorAssetEntry): [number, number] {
  const source = prop.dimensionsMeters || asset?.defaultDimensionsMeters;
  if (Array.isArray(source)) return [Math.max(.02, finite(source[0], .8)), Math.max(.02, finite(source[1], .8))];
  const row = source && typeof source === 'object' ? source : {};
  return [
    Math.max(.02, finite((row as { width?: number }).width, .8)),
    Math.max(.02, finite((row as { depth?: number }).depth, .8)),
  ];
}

function pointInPolygon(point: [number, number], polygon: number[][]): boolean {
  if (polygon.length < 3) return true;
  let inside = false;
  let previous = polygon[polygon.length - 1];
  for (const current of polygon) {
    const yi = finite(current?.[1]); const yj = finite(previous?.[1]);
    if ((yi > point[1]) !== (yj > point[1])) {
      const crossing = (finite(previous?.[0]) - finite(current?.[0])) * (point[1] - yi) / ((yj - yi) || 1e-9) + finite(current?.[0]);
      if (point[0] < crossing) inside = !inside;
    }
    previous = current;
  }
  return inside;
}

function footprint(position: [number, number], width: number, depth: number, yawDeg: number): Array<[number, number]> {
  const angle = yawDeg * Math.PI / 180;
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  return [
    [-width / 2, -depth / 2], [width / 2, -depth / 2],
    [width / 2, depth / 2], [-width / 2, depth / 2],
  ].map(([x, y]) => [position[0] + x * cos - y * sin, position[1] + x * sin + y * cos]);
}

/** RPG 검수맵과 같은 회전 유지형 벽 스냅. 벽 반대편으로 가구를 넘기지 않는다. */
export function snapFurnitureToNearestWall(
  prop: ApartmentInteriorProp,
  geometry: ApartmentGeometry,
  asset?: InteriorAssetEntry,
  maxDistanceMeters = 1.15,
): FurnitureWallSnapResult | null {
  if (!prop.assetId || ['ceiling', 'room-finish'].includes(String(asset?.mountingKind || ''))) return null;
  const source = prop.positionMeters;
  if (!Array.isArray(source) || source.length < 2) return null;
  const raw: [number, number] = [finite(source[0]), finite(source[1])];
  const [width, depth] = dimensions(prop, asset);
  const yaw = finite(prop.yawDeg) * Math.PI / 180;
  const widthAxis: [number, number] = [Math.cos(yaw), Math.sin(yaw)];
  const depthAxis: [number, number] = [-Math.sin(yaw), Math.cos(yaw)];
  const floor = Array.isArray(geometry.floorPolygon) ? geometry.floorPolygon : [];
  const candidates: FurnitureWallSnapResult[] = [];

  for (const value of geometry.wallSegments || []) {
    const wall = value as Record<string, unknown>;
    if (!Array.isArray(wall.a) || !Array.isArray(wall.b) || finite(wall.baseMeters) > .35) continue;
    const a: [number, number] = [finite(wall.a[0]), finite(wall.a[1])];
    const b: [number, number] = [finite(wall.b[0]), finite(wall.b[1])];
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < .05) continue;
    const ratio = Math.max(0, Math.min(1, ((raw[0] - a[0]) * dx + (raw[1] - a[1]) * dy) / (length * length)));
    const anchor: [number, number] = [a[0] + dx * ratio, a[1] + dy * ratio];
    const wallDistance = Math.hypot(raw[0] - anchor[0], raw[1] - anchor[1]);
    if (Number.isFinite(maxDistanceMeters) && wallDistance > Math.max(.05, maxDistanceMeters)) continue;
    const normal: [number, number] = [-dy / length, dx / length];
    const signedSide = (raw[0] - anchor[0]) * normal[0] + (raw[1] - anchor[1]) * normal[1];
    const sides = Math.abs(signedSide) > .001 ? [Math.sign(signedSide)] : [-1, 1];
    const support = Math.abs(widthAxis[0] * normal[0] + widthAxis[1] * normal[1]) * width / 2
      + Math.abs(depthAxis[0] * normal[0] + depthAxis[1] * normal[1]) * depth / 2;
    const offset = support + Math.max(.001, finite(wall.thicknessMeters, .12)) / 2 + .02;
    for (const side of sides) {
      const position: [number, number] = [
        Number((anchor[0] + normal[0] * offset * side).toFixed(2)),
        Number((anchor[1] + normal[1] * offset * side).toFixed(2)),
      ];
      if (floor.length >= 3 && footprint(position, width, depth, finite(prop.yawDeg)).some((corner) => !pointInPolygon(corner, floor))) continue;
      candidates.push({
        positionMeters: position,
        wallId: String(wall.id || 'wall'),
        distanceMeters: Number(Math.hypot(position[0] - raw[0], position[1] - raw[1]).toFixed(4)),
      });
    }
  }
  return candidates.sort((left, right) => left.distanceMeters - right.distanceMeters)[0] || null;
}
