import { describe, expect, it } from 'vitest';
import type { BOptionEntry } from './types';
import { BUNDANG_MINUS_OPTION_ID } from './minus-option';
import { resolveSaleCalculatorOptionLines, saleCalculatorOptionTier } from './sale-calculator-options';

const option = (value: Partial<BOptionEntry> & Pick<BOptionEntry, 'id' | 'label'>): BOptionEntry => ({
  category: '주방', price: 0, description: '', compatibleUnitTypes: [], requires: [], excludes: [], ...value,
});

describe('sale calculator option resolver', () => {
  it('classifies only system air conditioners as option II', () => {
    expect(saleCalculatorOptionTier('system-ac-3-premium')).toBe('option-ii');
    expect(saleCalculatorOptionTier('wide-plank-floor-finish')).toBe('option-iii');
  });

  it('2대 시스템에어컨은 축약된 팔레트명에 실제 설치 대수를 복원한다', () => {
    const result = resolveSaleCalculatorOptionLines([
      option({ id: 'system-ac-2-general', label: '시스템에어컨 · 일반형', category: '시스템에어컨', price: 3_600_000 }),
    ], ['system-ac-2-general'], '55A');
    expect(result[0]?.label).toBe('시스템에어컨 2대 · 일반형');
  });

  it('uses the unit and selected-dependent price with its label', () => {
    const options = [
      option({ id: 'finish-upgrade', label: '마감재 업그레이드', prices: { '55A': 2_000_000 } }),
      option({
        id: 'island', label: '아일랜드장', prices: { '55A': 1_000_000 },
        priceVariants: [{ whenSelectedAny: ['finish-upgrade'], prices: { '55A': 1_450_000 }, label: '마감재 업글' }],
      }),
    ];
    expect(resolveSaleCalculatorOptionLines(options, ['finish-upgrade', 'island'], '55A')).toEqual([
      expect.objectContaining({ id: 'finish-upgrade', priceWon: 2_000_000 }),
      expect.objectContaining({ id: 'island', priceWon: 1_450_000, priceVariantLabel: '마감재 업글' }),
    ]);
  });

  it('normalizes a mixed minus-option snapshot to no paid option lines', () => {
    const options = [option({ id: 'paid', label: '유상 옵션', price: 1_000_000 })];
    expect(resolveSaleCalculatorOptionLines(options, [BUNDANG_MINUS_OPTION_ID, 'paid'], '51A')).toEqual([]);
  });
});
