import { normalizeHotbar } from './catalog';
import type { HotbarValue } from './types';

export const HOTBAR_STORAGE_KEY = 'bunfirvil:hotbar:v1';

export function readHotbar(defaultHotbar: HotbarValue[], storage: Storage = localStorage): HotbarValue[] {
  try {
    const stored = JSON.parse(storage.getItem(HOTBAR_STORAGE_KEY) || 'null') as unknown;
    // 기존 4칸 저장값은 앞 네 칸을 유지하고 5·6번 빈 슬롯을 덧붙인다.
    if (Array.isArray(stored) && (stored.length === 4 || stored.length === 6)) return normalizeHotbar(stored);
  } catch {
    // Invalid browser state is replaced with the catalog default.
  }
  return normalizeHotbar(defaultHotbar);
}

export function writeHotbar(hotbar: HotbarValue[], storage: Storage = localStorage): void {
  storage.setItem(HOTBAR_STORAGE_KEY, JSON.stringify(normalizeHotbar(hotbar)));
}

export function reorderHotbar(hotbar: HotbarValue[], from: number, to: number): HotbarValue[] {
  const next = normalizeHotbar(hotbar);
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
