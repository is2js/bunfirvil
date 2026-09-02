import type { BOptionEntry } from './types';
import { BUNDANG_MINUS_OPTION_ID } from './minus-option';
import { resolvedOptionPrice } from './options';
import type { BundangFinanceOptionLineV1, BundangOptionTier, BundangSaleUnitType } from './bundang-sale-finance';

export interface SaleCalculatorOptionLineV1 extends BundangFinanceOptionLineV1 {
  category: string;
  priceVariantLabel?: string;
}

export function saleCalculatorOptionTier(optionId: string): BundangOptionTier {
  return /^system-ac-/u.test(optionId) ? 'option-ii' : 'option-iii';
}

/**
 * Resolve the launch-time option ID snapshot against the public catalog.
 * Prices are always recalculated for the authenticated unit type so stale or
 * caller-supplied amounts never enter the quote.
 */
export function resolveSaleCalculatorOptionLines(
  options: readonly BOptionEntry[],
  selectedOptionIds: readonly string[],
  unitType: BundangSaleUnitType,
): SaleCalculatorOptionLineV1[] {
  const selected = [...new Set(selectedOptionIds)];
  if (selected.includes(BUNDANG_MINUS_OPTION_ID)) return [];
  const byId = new Map(options.map((option) => [option.id, option]));
  return selected.flatMap((id): SaleCalculatorOptionLineV1[] => {
    const option = byId.get(id);
    if (!option || option.quoteMode === 'discount-metadata-only') return [];
    if (option.compatibleUnitTypes.length > 0 && !option.compatibleUnitTypes.includes(unitType)) return [];
    const resolved = resolvedOptionPrice(option, unitType, selected);
    if (!Number.isFinite(resolved.price) || resolved.price < 0) return [];
    const systemAcCount = id.match(/^system-ac-(\d+)-/u)?.[1];
    const label = systemAcCount && !/\d+대/u.test(option.label)
      ? option.label.replace(/^시스템에어컨/u, `시스템에어컨 ${systemAcCount}대`)
      : option.label;
    return [{
      id,
      label,
      category: option.category,
      tier: saleCalculatorOptionTier(id),
      priceWon: Math.round(resolved.price),
      ...(resolved.label ? { priceVariantLabel: resolved.label } : {}),
    }];
  });
}
