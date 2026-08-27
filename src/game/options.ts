import type { BOptionEntry, ReviewPayload } from './types';

const SYSTEM_AC_ID = /^system-ac-(\d+)-(general|premium)$/;

export type SystemAcTier = 'general' | 'premium';

export interface SystemAcChoice {
  id: string;
  count: number;
  tier: SystemAcTier;
}

export function systemAcChoice(optionId: string): SystemAcChoice | null {
  const match = optionId.match(SYSTEM_AC_ID);
  if (!match) return null;
  return { id: optionId, count: Number(match[1]), tier: match[2] as SystemAcTier };
}

export function systemAcChoices(options: BOptionEntry[], tier: SystemAcTier): SystemAcChoice[] {
  return options
    .map((option) => systemAcChoice(option.id))
    .filter((choice): choice is SystemAcChoice => choice?.tier === tier)
    .sort((left, right) => left.count - right.count);
}

/** 원본 B팔레트처럼 한 tier 카드 안에서 적용 해제 → 2대 → 3대 → 4대를 순환한다. */
export function adjustSystemAcSelection(
  options: BOptionEntry[],
  current: Iterable<string>,
  tier: SystemAcTier,
  delta: -1 | 1,
): string[] {
  const available = systemAcChoices(options, tier);
  if (!available.length) return [...current];
  const selected = [...current];
  const active = selected.map(systemAcChoice).find((choice) => choice?.tier === tier) || null;
  let target: SystemAcChoice | null = null;
  if (delta > 0) {
    target = active
      ? available.find((choice) => choice.count > active.count) || active
      : available[0];
  } else if (active) {
    const previous = [...available].reverse().find((choice) => choice.count < active.count);
    target = previous || null;
  }
  const withoutPackages = selected.filter((id) => !systemAcChoice(id));
  return target ? applyOptionToggle(options, withoutPackages, target.id) : withoutPackages;
}

export function reviewStorageKey(mapId: string): string {
  return `bunfirvil:review:v1:${mapId}`;
}

export function readSelectedOptions(mapId: string, storage: Storage = localStorage): string[] {
  try {
    const payload = JSON.parse(storage.getItem(reviewStorageKey(mapId)) || '{}') as ReviewPayload;
    const ids = payload.selectedOptionIds || payload.bOptionIds || [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function writeSelectedOptions(mapId: string, ids: string[], storage: Storage = localStorage): void {
  let previous: ReviewPayload = {};
  try {
    previous = JSON.parse(storage.getItem(reviewStorageKey(mapId)) || '{}') as ReviewPayload;
  } catch {
    previous = {};
  }
  const next: ReviewPayload = {
    ...previous,
    schemaVersion: 1,
    mapId,
    status: previous.status ?? 'unreviewed',
    notes: typeof previous.notes === 'string' ? previous.notes : '',
    selectedOptionIds: [...new Set(ids)],
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(reviewStorageKey(mapId), JSON.stringify(next));
}

export function compatibleOptions(options: BOptionEntry[], unitType: string): BOptionEntry[] {
  return options.filter(
    (option) => option.compatibleUnitTypes.length === 0 || option.compatibleUnitTypes.includes(unitType),
  );
}

export function applyOptionToggle(
  options: BOptionEntry[],
  current: Iterable<string>,
  optionId: string,
): string[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  const selected = new Set([...current].filter((id) => byId.has(id)));
  const target = byId.get(optionId);
  if (!target) return [...selected];

  if (selected.has(optionId)) {
    selected.delete(optionId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of selected) {
        const option = byId.get(id);
        const missingRequired = option?.requires.some((required) => !selected.has(required));
        const requiresAny = option?.requiresAny ?? [];
        const missingAny = requiresAny.length > 0 && !requiresAny.some((required) => selected.has(required));
        if (missingRequired || missingAny) {
          selected.delete(id);
          changed = true;
        }
      }
    }
    return [...selected];
  }

  const addWithRequirements = (id: string, seen = new Set<string>()): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const option = byId.get(id);
    if (!option) return;
    option.requires.forEach((required) => addWithRequirements(required, seen));
    const requiresAny = option.requiresAny ?? [];
    if (requiresAny.length > 0 && !requiresAny.some((required) => selected.has(required))) {
      const defaultRequirement = requiresAny.find((required) => byId.has(required));
      if (defaultRequirement) addWithRequirements(defaultRequirement, seen);
    }
    for (const excluded of option.excludes) selected.delete(excluded);
    for (const [selectedId, selectedOption] of byId) {
      if (selectedOption.excludes.includes(id)) selected.delete(selectedId);
    }
    selected.add(id);
  };
  addWithRequirements(optionId);
  return [...selected];
}

export function calculateOptionPrice(options: BOptionEntry[], selected: Iterable<string>): number {
  const selectedIds = new Set(selected);
  return options.reduce((total, option) => total + (selectedIds.has(option.id) ? option.price : 0), 0);
}
