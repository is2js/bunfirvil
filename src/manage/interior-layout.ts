import type { ApartmentInteriorProp } from '../game/types';

export const LAYOUT_SCHEMA_VERSION = 1 as const;

export interface InteriorAssetEntry {
  assetId: string;
  displayNameKo: string;
  category: string;
  rendererKind?: 'glb' | 'procedural' | string;
  previewUrl?: string;
  defaultDimensionsMeters?: { width?: number; depth?: number; height?: number } | number[];
  materialVariantIds?: string[];
  mountingKind?: string;
}

export interface LocalInteriorLayoutV1 {
  schemaVersion: 1;
  mapId: string;
  props: ApartmentInteriorProp[];
  updatedAt: string;
}

export function layoutStorageKey(mapId: string): string {
  return `bunfirvil:layout:v1:${mapId}`;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function dimensions(asset: InteriorAssetEntry): [number, number, number] {
  const source = asset.defaultDimensionsMeters;
  if (Array.isArray(source)) return [Number(source[0]) || 0.8, Number(source[1]) || 0.8, Number(source[2]) || 0.8];
  return [Number(source?.width) || 0.8, Number(source?.depth) || 0.8, Number(source?.height) || 0.8];
}

export function createLocalProp(asset: InteriorAssetEntry, x: number, y: number, sequence = Date.now()): ApartmentInteriorProp {
  return {
    id: `local-${asset.assetId}-${sequence}`,
    assetId: asset.assetId,
    positionMeters: [Math.round(x * 20) / 20, Math.round(y * 20) / 20],
    dimensionsMeters: dimensions(asset),
    yawDeg: 0,
    mirrored: false,
    materialVariantId: asset.materialVariantIds?.[0] || 'warm-oak-ivory',
  };
}

/** Snapshot interiors and option-managed props keep their authored placement;
 * only furniture explicitly added through the furniture palette is editable. */
export function isUserPlacedFurnitureProp(prop: ApartmentInteriorProp | undefined): boolean {
  return Boolean(prop
    && prop.localDeleted !== true
    && prop.localOverride !== true
    && !prop.sourcePropId
    && !prop.sourceOptionId
    && prop.fixedOptionLayout !== true
    && String(prop.id || '').startsWith('local-'));
}

export function validateLayout(
  value: unknown,
  expectedMapId: string,
  allowedAssets: Set<string>,
): { ok: true; value: LocalInteriorLayoutV1 } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: '배치 JSON이 객체가 아닙니다.' };
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== LAYOUT_SCHEMA_VERSION) return { ok: false, error: '지원하지 않는 배치 schemaVersion입니다.' };
  if (row.mapId !== expectedMapId) return { ok: false, error: '현재 맵과 배치 JSON의 mapId가 다릅니다.' };
  if (!Array.isArray(row.props) || row.props.length > 200) return { ok: false, error: 'props는 200개 이하 배열이어야 합니다.' };
  const seen = new Set<string>();
  const props: ApartmentInteriorProp[] = [];
  for (const raw of row.props) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '올바르지 않은 소품 행이 있습니다.' };
    const prop = raw as ApartmentInteriorProp;
    const id = String(prop.id || '');
    const assetId = String(prop.assetId || '');
    const sourcePropId = typeof prop.sourcePropId === 'string' ? prop.sourcePropId : '';
    const safeSourceOverride = prop.localOverride === true
      && /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(sourcePropId);
    if (!/^local-[a-z0-9-]+$/i.test(id) || seen.has(id)) return { ok: false, error: '소품 id가 올바르지 않거나 중복됩니다.' };
    // source-linked override의 asset은 렌더 시 최신 base prop으로 반드시 교체된다.
    // 따라서 snapshot에 없는 로컬 정밀 recipe도 좌표 override로 안전하게 복원할 수 있다.
    if (!allowedAssets.has(assetId) && !safeSourceOverride) return { ok: false, error: `허용되지 않은 소품입니다: ${assetId}` };
    if (!Array.isArray(prop.positionMeters) || prop.positionMeters.length < 2 || !finite(prop.positionMeters[0]) || !finite(prop.positionMeters[1])) {
      return { ok: false, error: `${id}의 좌표가 올바르지 않습니다.` };
    }
    const yaw = Number(prop.yawDeg || 0);
    if (!Number.isFinite(yaw)) return { ok: false, error: `${id}의 회전값이 올바르지 않습니다.` };
    seen.add(id);
    props.push({
      id,
      assetId,
      positionMeters: [Number(prop.positionMeters[0]), Number(prop.positionMeters[1])],
      dimensionsMeters: prop.dimensionsMeters,
      yawDeg: ((Math.round(yaw / 15) * 15) % 360 + 360) % 360,
      mirrored: prop.mirrored === true,
      materialVariantId: typeof prop.materialVariantId === 'string' ? prop.materialVariantId : undefined,
      sourcePropId: safeSourceOverride ? sourcePropId : undefined,
      localOverride: prop.localOverride === true,
      localDeleted: prop.localDeleted === true,
    });
  }
  const updatedAt = typeof row.updatedAt === 'string' && Number.isFinite(Date.parse(row.updatedAt))
    ? row.updatedAt
    : new Date().toISOString();
  return { ok: true, value: { schemaVersion: 1, mapId: expectedMapId, props, updatedAt } };
}

export function readLayout(mapId: string, allowedAssets: Set<string>, storage: Storage = localStorage): LocalInteriorLayoutV1 {
  const empty = { schemaVersion: 1 as const, mapId, props: [], updatedAt: new Date(0).toISOString() };
  try {
    const raw = storage.getItem(layoutStorageKey(mapId));
    if (!raw) return empty;
    const result = validateLayout(JSON.parse(raw), mapId, allowedAssets);
    return result.ok ? result.value : empty;
  } catch {
    return empty;
  }
}

export function writeLayout(layout: LocalInteriorLayoutV1, storage: Storage = localStorage): void {
  storage.setItem(layoutStorageKey(layout.mapId), JSON.stringify(layout));
}
