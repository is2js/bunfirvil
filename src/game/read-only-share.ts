import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import { createLocalProp, type InteriorAssetEntry } from '../manage/interior-layout';
import { canonicalizeBundangMinusOptionSelection, compatibleOptions } from './options';
import { availablePlanVariants, planVariantDefinition, type ApartmentLivingFacing, type ApartmentPlanVariant } from './plan-variants';
import type { ApartmentInteriorProp, ShowcaseCatalog } from './types';

export const BUNDANG_SHARE_PREFIX = 'share=v1.';
export const BUNDANG_SHARE_MAX_FURNITURE = 200;
export const BUNDANG_SHARE_MAX_TOKEN_BYTES = 32 * 1024;
export const BUNDANG_SHARE_MAX_JSON_BYTES = 128 * 1024;

export interface BundangReadOnlyShareFurnitureV1 {
  assetId: string;
  positionMeters: [number, number];
  yawDeg: number;
  mirrored: boolean;
  materialVariantId?: string;
}

export interface BundangReadOnlyShareV1 {
  schemaVersion: 1;
  mapId: string;
  unitType: string;
  planVariant: ApartmentPlanVariant;
  livingFacing: ApartmentLivingFacing;
  selectedOptionIds: string[];
  furniture: BundangReadOnlyShareFurnitureV1[];
}

export class BundangShareError extends Error {
  constructor(public readonly code: 'invalid-token' | 'too-large' | 'invalid-state') {
    super(code);
    this.name = 'BundangShareError';
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(token: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new BundangShareError('invalid-token');
  const padded = token.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - token.length % 4) % 4);
  let binary = '';
  try { binary = atob(padded); } catch { throw new BundangShareError('invalid-token'); }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sanitizeFurniture(prop: ApartmentInteriorProp): BundangReadOnlyShareFurnitureV1 | null {
  const assetId = String(prop.assetId || '');
  const position = Array.isArray(prop.positionMeters) ? prop.positionMeters : [];
  if (!assetId || position.length < 2 || !finite(position[0]) || !finite(position[1])) return null;
  return {
    assetId,
    positionMeters: [Math.round(position[0] * 100) / 100, Math.round(position[1] * 100) / 100],
    yawDeg: ((Math.round(Number(prop.yawDeg) || 0) % 360) + 360) % 360,
    mirrored: prop.mirrored === true,
    ...(typeof prop.materialVariantId === 'string' && prop.materialVariantId
      ? { materialVariantId: prop.materialVariantId }
      : {}),
  };
}

export function createBundangReadOnlyShare(input: {
  mapId: string;
  unitType: string;
  planVariant: ApartmentPlanVariant;
  livingFacing: ApartmentLivingFacing;
  selectedOptionIds: Iterable<string>;
  furniture: ApartmentInteriorProp[];
}): BundangReadOnlyShareV1 {
  return {
    schemaVersion: 1,
    mapId: input.mapId,
    unitType: input.unitType,
    planVariant: input.planVariant,
    livingFacing: input.livingFacing,
    selectedOptionIds: [...new Set(input.selectedOptionIds)].map(String),
    furniture: input.furniture.flatMap((prop) => {
      const value = sanitizeFurniture(prop);
      return value ? [value] : [];
    }).slice(0, BUNDANG_SHARE_MAX_FURNITURE),
  };
}

export function encodeBundangReadOnlyShare(value: BundangReadOnlyShareV1): string {
  const json = strToU8(JSON.stringify(value));
  if (json.byteLength > BUNDANG_SHARE_MAX_JSON_BYTES) throw new BundangShareError('too-large');
  const compressed = zlibSync(json, { level: 9 });
  const envelope = new Uint8Array(4 + compressed.byteLength);
  new DataView(envelope.buffer).setUint32(0, json.byteLength, true);
  envelope.set(compressed, 4);
  const token = base64UrlEncode(envelope);
  if (token.length > BUNDANG_SHARE_MAX_TOKEN_BYTES) throw new BundangShareError('too-large');
  return token;
}

export function decodeBundangReadOnlyShare(token: string): unknown {
  if (!token || token.length > BUNDANG_SHARE_MAX_TOKEN_BYTES) throw new BundangShareError(token ? 'too-large' : 'invalid-token');
  const envelope = base64UrlDecode(token);
  if (envelope.byteLength <= 4) throw new BundangShareError('invalid-token');
  const declaredSize = new DataView(envelope.buffer, envelope.byteOffset, 4).getUint32(0, true);
  if (declaredSize > BUNDANG_SHARE_MAX_JSON_BYTES) throw new BundangShareError('too-large');
  let json: Uint8Array;
  try { json = unzlibSync(envelope.subarray(4)); } catch (error) {
    if (error instanceof BundangShareError) throw error;
    throw new BundangShareError('invalid-token');
  }
  if (json.byteLength !== declaredSize || json.byteLength > BUNDANG_SHARE_MAX_JSON_BYTES) throw new BundangShareError('invalid-token');
  try { return JSON.parse(strFromU8(json)); } catch { throw new BundangShareError('invalid-token'); }
}

export function shareTokenFromHash(hash: string): string | null {
  const source = hash.startsWith('#') ? hash.slice(1) : hash;
  return source.startsWith(BUNDANG_SHARE_PREFIX) ? source.slice(BUNDANG_SHARE_PREFIX.length) : null;
}

export function validateBundangReadOnlyShare(
  value: unknown,
  catalog: ShowcaseCatalog,
  interiorAssets: InteriorAssetEntry[],
): BundangReadOnlyShareV1 {
  const row = record(value);
  if (!row || row.schemaVersion !== 1) throw new BundangShareError('invalid-state');
  const mapId = String(row.mapId || '');
  const unitType = String(row.unitType || '').toUpperCase();
  const planVariant = String(row.planVariant || '').toUpperCase() as ApartmentPlanVariant;
  const livingFacing = String(row.livingFacing || '') as ApartmentLivingFacing;
  const map = catalog.maps.find((candidate) => candidate.id === mapId && candidate.unitType === unitType);
  if (!map || !availablePlanVariants(unitType).includes(planVariant)
    || planVariantDefinition(unitType, planVariant).livingFacing !== livingFacing) throw new BundangShareError('invalid-state');

  const compatible = compatibleOptions(catalog.bOptions, unitType);
  const selected = Array.isArray(row.selectedOptionIds) && row.selectedOptionIds.length <= 128
    ? row.selectedOptionIds.map(String) : null;
  if (!selected || selected.some((id) => !compatible.some((option) => option.id === id))) throw new BundangShareError('invalid-state');
  const canonical = canonicalizeBundangMinusOptionSelection(compatible, selected);
  if (canonical.join('\u0000') !== [...new Set(selected)].join('\u0000')) throw new BundangShareError('invalid-state');

  if (!Array.isArray(row.furniture) || row.furniture.length > BUNDANG_SHARE_MAX_FURNITURE) throw new BundangShareError('invalid-state');
  const assets = new Map(interiorAssets.map((asset) => [asset.assetId, asset]));
  const furniture = row.furniture.map((value): BundangReadOnlyShareFurnitureV1 => {
    const item = record(value);
    const assetId = String(item?.assetId || '');
    const position = Array.isArray(item?.positionMeters) ? item.positionMeters : [];
    const yaw = item?.yawDeg;
    const mirrored = item?.mirrored;
    const material = item?.materialVariantId;
    const asset = assets.get(assetId);
    if (!asset || position.length !== 2 || !finite(position[0]) || !finite(position[1])
      || Math.abs(position[0]) > 100 || Math.abs(position[1]) > 100 || !finite(yaw)
      || yaw < 0 || yaw >= 360 || typeof mirrored !== 'boolean'
      || (material !== undefined && (typeof material !== 'string' || material.length > 80
        || (asset.materialVariantIds?.length && !asset.materialVariantIds.includes(material))))) {
      throw new BundangShareError('invalid-state');
    }
    return {
      assetId,
      positionMeters: [position[0], position[1]],
      yawDeg: yaw,
      mirrored,
      ...(typeof material === 'string' ? { materialVariantId: material } : {}),
    };
  });
  return { schemaVersion: 1, mapId, unitType, planVariant, livingFacing, selectedOptionIds: canonical, furniture };
}

export function sharedFurnitureProps(value: BundangReadOnlyShareV1, assets: InteriorAssetEntry[]): ApartmentInteriorProp[] {
  const catalog = new Map(assets.map((asset) => [asset.assetId, asset]));
  return value.furniture.map((item, index) => {
    const asset = catalog.get(item.assetId);
    if (!asset) throw new BundangShareError('invalid-state');
    const prop = createLocalProp(asset, item.positionMeters[0], item.positionMeters[1], index + 1);
    prop.id = `local-shared-${index + 1}`;
    prop.yawDeg = item.yawDeg;
    prop.mirrored = item.mirrored;
    prop.materialVariantId = item.materialVariantId || prop.materialVariantId;
    return prop;
  });
}

export function bundangReadOnlyShareUrl(baseUrl: string, value: BundangReadOnlyShareV1): string {
  const url = new URL(baseUrl);
  url.search = '';
  url.searchParams.set('map', value.mapId);
  url.searchParams.set('variant', value.planVariant);
  url.hash = `${BUNDANG_SHARE_PREFIX}${encodeBundangReadOnlyShare(value)}`;
  return url.toString();
}
