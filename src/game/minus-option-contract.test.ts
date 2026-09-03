import { describe, expect, it } from 'vitest';
import {
  BUNDANG_MINUS_OPTION_DISCOUNT_METADATA,
  BUNDANG_MINUS_OPTION_ENTRY,
  BUNDANG_MINUS_OPTION_ID,
  createFallbackCatalog,
} from './catalog';
import {
  calculateOptionPrice,
  canonicalizeBundangMinusOptionSelection,
  optionSelectionIntent,
  resolvedOptionPrice,
} from './options';
import type { BOptionEntry } from './types';

const ordinary: BOptionEntry = {
  id: 'ordinary-option',
  label: '일반 옵션',
  category: '테스트',
  price: 1_500_000,
  description: '테스트용 일반 B옵션',
  compatibleUnitTypes: ['51A', '55A', '55B', '59A'],
  requires: [],
  excludes: [],
};

const options = [BUNDANG_MINUS_OPTION_ENTRY, ordinary] as BOptionEntry[];

describe('마이너스 옵션 선택·견적 계약', () => {
  it('안내 전용 항목을 모든 런타임 카탈로그의 첫 카드로 합성하고 4평형 할인 내역을 유지한다', () => {
    const catalog = createFallbackCatalog();
    expect(catalog.bOptions[0]?.id).toBe(BUNDANG_MINUS_OPTION_ID);
    expect(catalog.bOptions[0]?.label).toBe('마이너스 옵션');
    expect(catalog.bOptions[0]?.category).toBe('마이너스 옵션');
    expect(catalog.bOptions[0]?.palettePlacement).toBe('all-first');
    expect(catalog.bOptions[0]?.quoteMode).toBe('discount-metadata-only');
    expect(catalog.bOptions[0]?.previewUrl).toBe('/assets/options/previews/minus-option-package-v1.webp');
    expect(BUNDANG_MINUS_OPTION_DISCOUNT_METADATA).toEqual({
      '51A': { supplyPriceWon: 26_440_000, balconyExtensionWon: 780_000 },
      '55A': { supplyPriceWon: 28_490_000, balconyExtensionWon: 770_000 },
      '55B': { supplyPriceWon: 28_480_000, balconyExtensionWon: 680_000 },
      '59A': { supplyPriceWon: 30_550_000, balconyExtensionWon: 990_000 },
    });
  });

  it('저장된 혼합 선택은 마이너스 옵션만 남기도록 정규화한다', () => {
    expect(canonicalizeBundangMinusOptionSelection(options, [BUNDANG_MINUS_OPTION_ID, 'ordinary-option']))
      .toEqual([BUNDANG_MINUS_OPTION_ID]);
    expect(canonicalizeBundangMinusOptionSelection(options, [BUNDANG_MINUS_OPTION_ID, 'missing']))
      .toEqual([BUNDANG_MINUS_OPTION_ID]);
  });

  it('마이너스 옵션을 명시적으로 선택하면 일반 옵션을 비우며, 활성 중인 일반 옵션 선택은 차단한다', () => {
    const minus = optionSelectionIntent(options, ['ordinary-option'], BUNDANG_MINUS_OPTION_ID);
    expect(minus.nextSelection).toEqual([BUNDANG_MINUS_OPTION_ID]);
    expect(minus.exclusivesToRemove).toEqual(['ordinary-option']);

    const ordinaryIntent = optionSelectionIntent(options, [BUNDANG_MINUS_OPTION_ID], 'ordinary-option');
    expect(ordinaryIntent.kind).toBe('invalid');
    expect(ordinaryIntent.option?.id).toBe('ordinary-option');
    expect(ordinaryIntent.nextSelection).toEqual([BUNDANG_MINUS_OPTION_ID]);
    expect(ordinaryIntent.exclusivesToRemove).toEqual([]);
  });

  it('시스템에어컨도 다른 유상 옵션과 동일하게 마이너스 옵션과 배타 처리한다', () => {
    const systemAc = {
      ...ordinary,
      id: 'system-ac-2-general',
      label: '시스템에어컨 · 일반형 2대',
      category: '시스템에어컨',
    };
    const withSystemAc = [BUNDANG_MINUS_OPTION_ENTRY, systemAc] as BOptionEntry[];
    expect(optionSelectionIntent(withSystemAc, [systemAc.id], BUNDANG_MINUS_OPTION_ID).nextSelection)
      .toEqual([BUNDANG_MINUS_OPTION_ID]);
    expect(optionSelectionIntent(withSystemAc, [BUNDANG_MINUS_OPTION_ID], systemAc.id).kind)
      .toBe('invalid');
    expect(canonicalizeBundangMinusOptionSelection(withSystemAc, [BUNDANG_MINUS_OPTION_ID, systemAc.id]))
      .toEqual([BUNDANG_MINUS_OPTION_ID]);
  });

  it('discount-metadata-only는 선택돼도 현재 옵션 합계에 반영하지 않는다', () => {
    expect(resolvedOptionPrice(BUNDANG_MINUS_OPTION_ENTRY, '55A', [])).toEqual({ price: 0 });
    expect(calculateOptionPrice(options, [BUNDANG_MINUS_OPTION_ID])).toBe(0);
    expect(calculateOptionPrice(options, [BUNDANG_MINUS_OPTION_ID, 'ordinary-option'])).toBe(0);
  });
});
