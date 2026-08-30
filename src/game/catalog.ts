import { fetchJson, resolveProjectUrl } from './base';
import type { BOptionEntry, ShowcaseCatalog, StaticMapEntry } from './types';

const MAP_IDS = [
  'bundang-first-village-51a-prototype',
  'bundang-first-village-55a-prototype',
  'bundang-first-village-55b-prototype',
  'bundang-first-village-59a-prototype',
] as const;

const FALLBACK_MAP_LABELS = ['51A 세대 검수맵', '55A 세대 검수맵', '55B 세대 검수맵', '59A 세대 검수맵'];

function fallbackMap(id: string, label: string, index: number): StaticMapEntry {
  const unitType = id.match(/-(51a|55a|55b|59a)-/i)?.[1]?.toUpperCase() || '55B';
  return {
    id,
    label,
    unitType,
    revision: 'preview-fallback',
    width: 64,
    height: 64,
    chunkCount: 16,
    assetBytes: 0,
    renderer: index === 2 ? 'three-pbr' : 'canvas2d',
    manifestUrl: `generated/worlds/${id}/manifest.json`,
    minimapUrl: `generated/worlds/${id}/minimap.png`,
    spawn: { x: 30 + index * 2, y: 26 + index },
  };
}

export function createFallbackCatalog(): ShowcaseCatalog {
  return {
    schemaVersion: 1,
    exportId: 'fallback-preview',
    generatedAt: new Date(0).toISOString(),
    maps: MAP_IDS.map((id, index) => fallbackMap(id, FALLBACK_MAP_LABELS[index], index)),
    characters: [
      { key: '100', label: '남자 의료진', manifestUrl: 'generated/characters/100/animation.json' },
      { key: '200', label: '여자 의료진', manifestUrl: 'generated/characters/200/animation.json' },
    ],
    skills: [
      {
        id: 'warrior-shock-stun',
        label: '쇼크스턴',
        description: '회전하는 별 궤적으로 상태 효과를 미리 봅니다.',
        iconUrl: '',
        effectUrls: [],
        cooldownMs: 2_800,
        manaCost: 18,
      },
      {
        id: 'common-double-arrow',
        label: '더블애로우',
        description: '두 갈래 에너지 화살의 이동 효과를 재생합니다.',
        iconUrl: '',
        effectUrls: [],
        cooldownMs: 1_600,
        manaCost: 12,
      },
      {
        id: 'common-teleport',
        label: '텔레포트',
        description: '마우스 커서가 가리키는 통과 가능 셀로 순간 이동합니다.',
        iconUrl: '',
        effectUrls: [],
        cooldownMs: 4_000,
        manaCost: 25,
      },
    ],
    defaultHotbar: ['common-teleport', 'basic-attack', 'warrior-shock-stun', 'common-double-arrow', null, null],
    bOptions: fallbackOptions(),
    renderAssets: undefined,
  };
}

function fallbackOptions(): BOptionEntry[] {
  return [
    {
      id: 'entry-partition',
      label: '현관 중문',
      category: '현관',
      price: 1_250_000,
      description: '3연동 슬라이딩 중문과 간접조명 패키지',
      compatibleUnitTypes: ['51A', '55A', '55B', '59A'],
      requires: [],
      excludes: [],
    },
    {
      id: 'kitchen-island',
      label: '다이닝 아일랜드',
      category: '주방',
      price: 2_650_000,
      description: '수납과 다이닝 확장 상판을 결합한 아일랜드',
      compatibleUnitTypes: ['55A', '55B', '59A'],
      requires: [],
      excludes: ['compact-dining'],
    },
    {
      id: 'compact-dining',
      label: '컴팩트 다이닝',
      category: '주방',
      price: 1_480_000,
      description: '동선을 확보하는 벽부형 다이닝 카운터',
      compatibleUnitTypes: ['51A', '55A', '55B'],
      requires: [],
      excludes: ['kitchen-island'],
    },
    {
      id: 'premium-countertop',
      label: '엔지니어드 상판',
      category: '주방',
      price: 1_870_000,
      description: '아일랜드와 조리대에 적용하는 프리미엄 상판',
      compatibleUnitTypes: ['55A', '55B', '59A'],
      requires: ['kitchen-island'],
      excludes: [],
    },
    {
      id: 'living-wall',
      label: '거실 아트월',
      category: '거실',
      price: 1_960_000,
      description: '웜그레이 대형 타일과 라인 조명 마감',
      compatibleUnitTypes: ['51A', '55A', '55B', '59A'],
      requires: [],
      excludes: [],
    },
    {
      id: 'bath-glass',
      label: '욕실 유리 파티션',
      category: '욕실',
      price: 820_000,
      description: '프레임리스 강화 유리 습식 공간 파티션',
      compatibleUnitTypes: ['51A', '55A', '55B', '59A'],
      requires: [],
      excludes: [],
    },
  ];
}

function generatedRef(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  if (/^(?:https?:|data:|blob:)/i.test(value) || value.startsWith('generated/')) return value;
  return `generated/${value.replace(/^\/+/, '')}`;
}

interface RawOptionCatalog {
  groups?: Array<{ id?: string; label?: string }>;
  options?: Array<{
    assetId?: string;
    label?: string;
    paletteLabel?: string;
    groupId?: string;
    prices?: Record<string, number>;
    description?: string;
    visualMode?: string;
    exclusiveGroup?: string;
    requires?: string[];
    requiresAny?: string[];
    previewUrl?: string;
  }>;
}

async function normalizeExternalOptions(catalogUrl: string): Promise<BOptionEntry[]> {
  if (!catalogUrl) return [];
  const resolvedCatalogUrl = resolveProjectUrl(generatedRef(catalogUrl));
  try {
    const raw = await fetchJson<RawOptionCatalog>(resolvedCatalogUrl);
    const groups = new Map((raw.groups || []).map((group) => [group.id || '', group.label || group.id || '기타']));
    const source = raw.options || [];
    return source.flatMap((option): BOptionEntry[] => {
      if (!option.assetId) return [];
      const compatibleUnitTypes = Object.entries(option.prices || {})
        .filter(([, price]) => Number.isFinite(price))
        .map(([unitType]) => unitType);
      const excludes = source
        .filter((candidate) => candidate.assetId !== option.assetId && option.exclusiveGroup && candidate.exclusiveGroup === option.exclusiveGroup)
        .map((candidate) => candidate.assetId || '')
        .filter(Boolean);
      return [{
        id: option.assetId,
        label: option.paletteLabel || option.label || option.assetId,
        category: groups.get(option.groupId || '') || option.groupId || '기타',
        price: 0,
        description: option.description || option.label || option.visualMode || 'B옵션 렌더 프리뷰',
        compatibleUnitTypes,
        requires: Array.isArray(option.requires) ? option.requires.filter((id): id is string => typeof id === 'string') : [],
        requiresAny: Array.isArray(option.requiresAny) ? option.requiresAny.filter((id): id is string => typeof id === 'string') : [],
        excludes,
        previewUrl: option.previewUrl ? new URL(option.previewUrl, resolvedCatalogUrl).toString() : undefined,
        // The currently selected unit price is applied just before display.
        prices: option.prices,
      } as BOptionEntry & { prices: Record<string, number> }];
    });
  } catch (error) {
    console.warn('[bunfirvil] B option catalog fallback', error);
    return [];
  }
}

async function normalizeCatalog(raw: unknown): Promise<ShowcaseCatalog> {
  if (!raw || typeof raw !== 'object') throw new Error('catalog.v1.json이 JSON 객체가 아닙니다.');
  const value = raw as Record<string, unknown>;
  const rawMaps = Array.isArray(value.maps) ? value.maps as Array<Record<string, unknown>> : [];
  const rawCharacters = Array.isArray(value.characters) ? value.characters as Array<Record<string, unknown>> : [];
  const rawSkills = Array.isArray(value.skills) ? value.skills as Array<Record<string, unknown>> : [];
  if (!value.exportId || rawMaps.length === 0) throw new Error('catalog.v1.json 필수 필드가 없습니다.');

  const maps: StaticMapEntry[] = rawMaps.map((map) => ({
    id: String(map.id || ''),
    label: String(map.label || map.displayName || map.id || '검수맵'),
    unitType: String(map.unitType || 'UNKNOWN'),
    revision: String(map.revision || 'static'),
    width: Number(map.width) || 64,
    height: Number(map.height) || 64,
    chunkCount: Number(map.chunkCount) || 16,
    assetBytes: Number(map.assetBytes) || 0,
    renderer: map.renderer === 'canvas2d' ? 'canvas2d' : 'three-pbr',
    manifestUrl: generatedRef(map.manifestUrl),
    minimapUrl: generatedRef(map.minimapUrl),
    spawn: map.spawn && typeof map.spawn === 'object'
      ? { x: Number((map.spawn as Record<string, unknown>).x) || 32, y: Number((map.spawn as Record<string, unknown>).y) || 32 }
      : { x: 32, y: 32 },
  }));
  const characters = rawCharacters.flatMap((character) => {
    const key = String(character.key || character.assetKey || character.id || '');
    if (key !== '100' && key !== '200') return [];
    return [{
      key,
      label: String(character.label || character.displayName || key),
      manifestUrl: generatedRef(character.manifestUrl || character.descriptorUrl),
    } as const];
  });
  const skills = rawSkills.map((skill): ShowcaseCatalog['skills'][number] => ({
    id: String(skill.id || ''),
    label: String(skill.label || skill.name || skill.id || '스킬'),
    description: String(skill.description || '로컬 스킬 프리뷰'),
    iconUrl: generatedRef(skill.iconUrl),
    effectUrls: Array.isArray(skill.effectUrls)
      ? skill.effectUrls.map(generatedRef)
      : Array.isArray(skill.effects)
        ? (skill.effects as Array<Record<string, unknown>>).map((effect) => generatedRef(effect.manifestUrl)).filter(Boolean)
        : [],
    cooldownMs: Number(skill.cooldownMs) || 1_000,
    manaCost: Number(skill.manaCost) || 0,
  }));

  let bOptions: BOptionEntry[];
  if (Array.isArray(value.bOptions)) {
    bOptions = value.bOptions as BOptionEntry[];
  } else {
    const reference = value.bOptions && typeof value.bOptions === 'object'
      ? String((value.bOptions as Record<string, unknown>).catalogUrl || '')
      : '';
    bOptions = await normalizeExternalOptions(reference);
  }

  return {
    schemaVersion: 1,
    exportId: String(value.exportId),
    generatedAt: String(value.generatedAt || new Date(0).toISOString()),
    maps,
    characters,
    skills,
    defaultHotbar: normalizeHotbar(value.defaultHotbar),
    bOptions,
    renderAssets: value.renderAssets && typeof value.renderAssets === 'object'
      ? {
          interiorCatalogUrl: generatedRef((value.renderAssets as Record<string, unknown>).interiorCatalogUrl),
          recipeCatalogUrl: generatedRef((value.renderAssets as Record<string, unknown>).recipeCatalogUrl),
          optionModuleUrl: generatedRef((value.renderAssets as Record<string, unknown>).optionModuleUrl),
          materialManifestUrl: generatedRef((value.renderAssets as Record<string, unknown>).materialManifestUrl),
        }
      : undefined,
  };
}

export async function loadCatalog(): Promise<{ catalog: ShowcaseCatalog; fallback: boolean }> {
  try {
    const catalog = await normalizeCatalog(await fetchJson<unknown>(resolveProjectUrl('generated/catalog.v1.json')));
    return {
      catalog: {
        ...catalog,
        maps: catalog.maps.slice(0, 4),
        defaultHotbar: normalizeHotbar(catalog.defaultHotbar),
      },
      fallback: false,
    };
  } catch (error) {
    console.warn('[bunfirvil] Generated catalog unavailable; using visual fallback.', error);
    return { catalog: createFallbackCatalog(), fallback: true };
  }
}

export function normalizeHotbar(value: unknown): Array<string | null> {
  const source = Array.isArray(value) ? value : [];
  const normalized = source.slice(0, 6).map((item) => (typeof item === 'string' && item.trim() ? item : null));
  while (normalized.length < 6) normalized.push(null);
  return normalized;
}

export function mapFromQuery(catalog: ShowcaseCatalog, search: string): StaticMapEntry {
  const requested = new URLSearchParams(search).get('map');
  return catalog.maps.find((map) => map.id === requested) || catalog.maps[0];
}
