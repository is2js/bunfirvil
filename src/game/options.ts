import type { BOptionEntry, ReviewPayload } from './types';
import { BUNDANG_MINUS_OPTION_ID, isBundangMinusOption } from './minus-option';

const SYSTEM_AC_ID = /^system-ac-(\d+)-(general|premium)$/;

export type SystemAcTier = 'general' | 'premium';

export interface SystemAcChoice {
  id: string;
  count: number;
  tier: SystemAcTier;
}

export interface OptionSelectionIntent {
  kind: 'select' | 'deselect' | 'invalid';
  option: BOptionEntry | null;
  nextSelection: string[];
  requiresToAdd: string[];
  dependentsToRemove: string[];
  exclusivesToRemove: string[];
}

export interface OptionChoiceGroup {
  exclusiveGroup: string;
  options: BOptionEntry[];
}

/**
 * 마이너스 옵션과 일반 옵션이 동시에 저장된 과거/수동 입력 상태를 정규화한다.
 * 마이너스 옵션은 일반 유상 옵션과 공존할 수 없으므로, 혼합 상태에서는 마이너스
 * 옵션을 정본으로 삼는다. 이 규칙은 저장된 상태와 화면 선택 동작에 동일하게 적용한다.
 */
export function canonicalizeBundangMinusOptionSelection(
  options: BOptionEntry[],
  selected: Iterable<string>,
): string[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  const known = [...new Set(selected)].filter((id) => byId.has(id));
  if (!known.includes(BUNDANG_MINUS_OPTION_ID)) return known;
  return [BUNDANG_MINUS_OPTION_ID];
}

export function groupMutuallyExclusiveOptions(options: BOptionEntry[]): OptionChoiceGroup[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  const adjacency = new Map(options.map((option) => [option.id, new Set<string>()]));
  const explicitGroups = new Map<string, string[]>();
  for (const option of options) {
    const explicit = String(option.exclusiveGroup || '');
    if (explicit) explicitGroups.set(explicit, [...(explicitGroups.get(explicit) || []), option.id]);
    for (const excluded of option.excludes) {
      if (!byId.has(excluded)) continue;
      adjacency.get(option.id)?.add(excluded);
      adjacency.get(excluded)?.add(option.id);
    }
  }
  for (const members of explicitGroups.values()) {
    for (const id of members) {
      for (const peer of members) if (id !== peer) adjacency.get(id)?.add(peer);
    }
  }
  const groupById = new Map<string, string>();
  const visited = new Set<string>();
  for (const option of options) {
    if (visited.has(option.id)) continue;
    const stack = [option.id];
    const component: string[] = [];
    while (stack.length) {
      const id = stack.pop();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      component.push(id);
      adjacency.get(id)?.forEach((peer) => { if (!visited.has(peer)) stack.push(peer); });
    }
    if (component.length < 2) continue;
    const explicit = component.map((id) => String(byId.get(id)?.exclusiveGroup || '')).find(Boolean);
    const key = explicit || `mutually-exclusive:${component.slice().sort().join('|')}`;
    component.forEach((id) => groupById.set(id, key));
  }
  const emitted = new Set<string>();
  const result: OptionChoiceGroup[] = [];
  for (const option of options) {
    const group = groupById.get(option.id) || '';
    if (!group) {
      result.push({ exclusiveGroup: '', options: [option] });
      continue;
    }
    if (emitted.has(group)) continue;
    emitted.add(group);
    result.push({ exclusiveGroup: group, options: options.filter((candidate) => groupById.get(candidate.id) === group) });
  }
  return result;
}

export function resolvedOptionPrice(
  option: BOptionEntry,
  unitType: string,
  selected: Iterable<string>,
): { price: number; label?: string } {
  if (option.quoteMode === 'discount-metadata-only') return { price: 0 };
  const selectedIds = new Set(selected);
  const basePrice = option.prices?.[unitType] ?? option.price;
  const variant = option.priceVariants?.find((candidate) =>
    candidate.whenSelectedAny.some((id) => selectedIds.has(id))
      && Number.isFinite(candidate.prices[unitType]));
  return variant
    ? { price: variant.prices[unitType], label: variant.label }
    : { price: basePrice };
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

export function optionSelectionIntent(
  options: BOptionEntry[],
  current: Iterable<string>,
  optionId: string,
): OptionSelectionIntent {
  const byId = new Map(options.map((option) => [option.id, option]));
  const selected = new Set(canonicalizeBundangMinusOptionSelection(options, current));
  const target = byId.get(optionId);
  if (!target) {
    return {
      kind: 'invalid', option: null, nextSelection: [...selected], requiresToAdd: [], dependentsToRemove: [], exclusivesToRemove: [],
    };
  }

  const dependentsToRemove: string[] = [];
  const cascadeInvalidDependents = (): void => {
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
          dependentsToRemove.push(id);
          changed = true;
        }
      }
    }
  };

  if (selected.has(optionId)) {
    selected.delete(optionId);
    cascadeInvalidDependents();
    return {
      kind: 'deselect', option: target, nextSelection: [...selected], requiresToAdd: [],
      dependentsToRemove: [...new Set(dependentsToRemove)], exclusivesToRemove: [],
    };
  }

  // 마이너스 옵션은 다른 옵션과 함께 견적/렌더 대상이 되지 않는다.
  // 명시적으로 선택할 때는 모든 일반 옵션을 해제한다.
  if (isBundangMinusOption(target)) {
    const exclusivesToRemove = [...selected].filter((id) => !isBundangMinusOption(id));
    return {
      kind: 'select',
      option: target,
      nextSelection: [BUNDANG_MINUS_OPTION_ID],
      requiresToAdd: [],
      dependentsToRemove: [],
      exclusivesToRemove,
    };
  }

  // 마이너스 옵션이 이미 활성화되어 있으면 일반 옵션으로 전환하지 않는다.
  // 사용자가 먼저 마이너스 옵션을 해제해야 하며, 이때 저장/견적/렌더 상태는 그대로 유지된다.
  if (selected.has(BUNDANG_MINUS_OPTION_ID)) {
    return {
      kind: 'invalid',
      option: target,
      nextSelection: [BUNDANG_MINUS_OPTION_ID],
      requiresToAdd: [],
      dependentsToRemove: [],
      exclusivesToRemove: [],
    };
  }

  const original = new Set(selected);
  const requiresToAdd: string[] = [];
  const exclusivesToRemove: string[] = [];
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
    for (const excluded of option.excludes) {
      if (selected.delete(excluded)) exclusivesToRemove.push(excluded);
    }
    for (const [selectedId, selectedOption] of byId) {
      if (selectedOption.excludes.includes(id) && selected.delete(selectedId)) exclusivesToRemove.push(selectedId);
    }
    selected.add(id);
    if (id !== optionId && !original.has(id)) requiresToAdd.push(id);
  };
  addWithRequirements(optionId);
  cascadeInvalidDependents();
  return {
    kind: 'select', option: target, nextSelection: [...selected],
    requiresToAdd: [...new Set(requiresToAdd)],
    dependentsToRemove: [...new Set(dependentsToRemove.filter((id) => id !== optionId))],
    exclusivesToRemove: [...new Set(exclusivesToRemove)],
  };
}

export function applyOptionToggle(
  options: BOptionEntry[],
  current: Iterable<string>,
  optionId: string,
): string[] {
  return optionSelectionIntent(options, current, optionId).nextSelection;
}

export function calculateOptionPrice(options: BOptionEntry[], selected: Iterable<string>): number {
  const selectedIds = new Set(canonicalizeBundangMinusOptionSelection(options, selected));
  return options.reduce((total, option) => total + (selectedIds.has(option.id) && option.quoteMode !== 'discount-metadata-only' ? option.price : 0), 0);
}
