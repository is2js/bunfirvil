export const BUNDANG_MINUS_OPTION_ID = 'bundang-minus-option-package';
export const BUNDANG_MINUS_OPTION_LABEL = '마이너스 옵션';
export const BUNDANG_MINUS_OPTION_CATEGORY = '마이너스 옵션';
export const BUNDANG_MINUS_OPTION_DESCRIPTION =
  '욕실 기본 위생기구·실내 문짝·주방 기본 상판과 하부장·후드·가스쿡탑을 제외합니다. 평형별 감액은 현재 옵션 합계와 별도로 안내합니다.';
export const BUNDANG_MINUS_OPTION_UNIT_TYPES = Object.freeze(['51A', '55A', '55B', '59A']);

export interface BundangMinusOptionDiscountMetadata {
  supplyPriceWon: number;
  balconyExtensionWon: number;
}

export const BUNDANG_MINUS_OPTION_DISCOUNT_METADATA: Readonly<
  Record<string, BundangMinusOptionDiscountMetadata>
> = Object.freeze({
  '51A': Object.freeze({ supplyPriceWon: 26_440_000, balconyExtensionWon: 780_000 }),
  '55A': Object.freeze({ supplyPriceWon: 28_490_000, balconyExtensionWon: 770_000 }),
  '55B': Object.freeze({ supplyPriceWon: 28_480_000, balconyExtensionWon: 680_000 }),
  '59A': Object.freeze({ supplyPriceWon: 30_550_000, balconyExtensionWon: 990_000 }),
});

export const BUNDANG_MINUS_OPTION_PREVIEW_URL =
  'assets/options/previews/minus-option-package-v1.webp';

export function isBundangMinusOption(
  option: { id: string } | string | null | undefined,
): boolean {
  if (!option) return false;
  return (typeof option === 'string' ? option : option.id) === BUNDANG_MINUS_OPTION_ID;
}
