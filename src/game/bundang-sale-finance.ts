/**
 * Deterministic estimate helpers for the Bundang First Village public-sale
 * notice.  This module intentionally has no DOM, storage, or catalog imports
 * so a calculator page can use it without coupling a household quote to the
 * RPG showcase's shared option state.
 *
 * Monetary values are Korean won integers.  The notice price table is the
 * source of truth for the supplied values; this calculator is an estimate and
 * does not replace the executed supply/additional-option contracts.
 */

export type BundangSaleUnitType = '51A' | '55A' | '55B' | '59A';
export type BundangPaymentPlanKind = 'pre-subscription' | 'main-subscription';
export type BundangOptionTier = 'option-ii' | 'option-iii';
export type BundangPaymentTarget = 'supply' | 'balcony' | BundangOptionTier;
export type BundangSaleFloorBand = 1 | 2 | 3 | 4 | 5;

export type BundangSaleHouseholdV1 = {
  unitType: BundangSaleUnitType;
  /** Actual floor; any value at or above 5 resolves to the 5층 이상 band. */
  floor: number;
  /** Optional calculator control value. 5 always means the 5층 이상 price. */
  floorBand?: BundangSaleFloorBand;
} | {
  unitType: BundangSaleUnitType;
  floor?: undefined;
  /** Allows a floor-band UI to quote without manufacturing an actual floor. */
  floorBand: BundangSaleFloorBand;
};

export interface BundangSalePriceEntryV1 {
  unitType: BundangSaleUnitType;
  /** 1, 2, 3, 4, or all floors from 5 upward. */
  floorFrom: number;
  floorTo: number | null;
  supplyPriceWon: number;
}

export interface BundangBalconyExtensionEntryV1 {
  unitType: BundangSaleUnitType;
  priceWon: number;
}

export interface BundangMinusOptionDiscountV1 {
  unitType: BundangSaleUnitType;
  supplyPriceWon: number;
  balconyExtensionWon: number;
}

export interface BundangSaleFinanceCatalogV1 {
  schemaVersion: 1;
  source: {
    title: string;
    announcedAt: string;
    priceTablePage: number;
  };
  salePrices: readonly BundangSalePriceEntryV1[];
  balconyExtensions: readonly BundangBalconyExtensionEntryV1[];
  minusOptionDiscounts: readonly BundangMinusOptionDiscountV1[];
  /** The notice table has this separate housing-city-fund amount per home. */
  housingCityFundWon: number;
}

export interface BundangFinanceOptionLineV1 {
  id: string;
  label: string;
  tier: BundangOptionTier;
  priceWon: number;
}

export interface BundangPaymentInstallmentV1 {
  id: string;
  label: string;
  due: string;
  rateBps: number;
  amountWon: number;
}

export interface BundangPaymentScheduleV1 {
  target: BundangPaymentTarget;
  totalWon: number;
  installments: readonly BundangPaymentInstallmentV1[];
}

export interface BundangAcquisitionTaxInputV1 {
  /** The taxable acquisition amount. Defaults to the calculated contract total. */
  taxableAmountWon?: number;
  /** Explicit reduction/credit. It cannot reduce the estimate below zero. */
  manualReliefWon?: number;
  /** Scenario overrides for the 6억원 이하/9억원 초과 acquisition-tax rates. */
  thresholdWon?: number;
  underThresholdRateBps?: number;
  overThresholdRateBps?: number;
}

export interface BundangAcquisitionTaxQuoteV1 {
  taxableAmountWon: number;
  thresholdWon: number;
  acquisitionTaxRatePercent: number;
  acquisitionTaxWonBeforeRelief: number;
  manualReliefWon: number;
  acquisitionTaxWon: number;
  localEducationTaxWon: number;
  ruralSpecialTaxWon: number;
  totalTaxWon: number;
}

export interface BundangMortgageInputV1 {
  /** Loan assessment base; the supply price is normally used, not option totals. */
  loanBaseWon: number;
  termYears: 20 | 30;
  requestedLoanWon?: number;
  annualRateBps?: number;
  ltvBps?: number;
  maxLoanWon?: number;
}

export interface BundangMortgageQuoteV1 {
  loanBaseWon: number;
  ltvBps: number;
  annualRateBps: number;
  termMonths: number;
  graceMonths: number;
  repaymentMonths: number;
  eligibleMaximumWon: number;
  principalWon: number;
  graceMonthlyInterestWon: number;
  repaymentMonthlyPrincipalInterestWon: number;
  totalRepaymentWon: number;
  totalInterestWon: number;
}

export interface BundangFinanceInputV1 {
  household: BundangSaleHouseholdV1;
  paymentPlanKind: BundangPaymentPlanKind;
  includeBalconyExtension?: boolean;
  selectMinusOption?: boolean;
  optionLines?: readonly BundangFinanceOptionLineV1[];
  acquisitionTax?: BundangAcquisitionTaxInputV1;
  mortgage?: Omit<BundangMortgageInputV1, 'loanBaseWon'>;
  catalog?: BundangSaleFinanceCatalogV1;
}

export interface BundangFinanceQuoteV1 {
  household: BundangSaleHouseholdV1;
  paymentPlanKind: BundangPaymentPlanKind;
  baseSupplyPriceWon: number;
  baseBalconyExtensionWon: number;
  minusSupplyDiscountWon: number;
  minusBalconyDiscountWon: number;
  adjustedSupplyPriceWon: number;
  adjustedBalconyExtensionWon: number;
  optionIiSubtotalWon: number;
  optionIiiSubtotalWon: number;
  contractTotalWon: number;
  /** All `잔금` installments less selected mortgage principal; excludes tax. */
  moveInRequiredCashWon?: number;
  paymentSchedules: readonly BundangPaymentScheduleV1[];
  acquisitionTax: BundangAcquisitionTaxQuoteV1;
  mortgage?: BundangMortgageQuoteV1;
}

const won = (value: number): number => Math.round(value);
const nonNegativeWon = (value: number): number => Math.max(0, won(value));

const OFFICIAL_SALE_PRICE_ROWS: readonly [BundangSaleUnitType, readonly [number, number, number, number, number]][] = [
  ['51A', [555_310_000, 561_220_000, 573_030_000, 584_850_000, 590_760_000]],
  ['55A', [598_310_000, 604_680_000, 617_410_000, 630_140_000, 636_510_000]],
  ['55B', [598_110_000, 604_470_000, 617_200_000, 629_920_000, 636_290_000]],
  ['59A', [641_430_000, 648_260_000, 661_900_000, 675_550_000, 682_380_000]],
];

const SALE_PRICES: readonly BundangSalePriceEntryV1[] = Object.freeze(OFFICIAL_SALE_PRICE_ROWS.flatMap(([unitType, prices]) => prices.map((supplyPriceWon, index) => ({
  unitType,
  floorFrom: index + 1,
  floorTo: index === 4 ? null : index + 1,
  supplyPriceWon,
}))));

export const BUNDANG_SALE_FINANCE_CATALOG_V1: BundangSaleFinanceCatalogV1 = Object.freeze({
  schemaVersion: 1,
  source: Object.freeze({
    title: 'e편한세상 분당 퍼스트빌리지 입주자모집공고',
    announcedAt: '2026-05-29',
    priceTablePage: 5,
  }),
  salePrices: SALE_PRICES,
  balconyExtensions: Object.freeze([
    { unitType: '51A', priceWon: 5_213_000 },
    { unitType: '55A', priceWon: 5_138_000 },
    { unitType: '55B', priceWon: 4_556_000 },
    { unitType: '59A', priceWon: 6_620_000 },
  ] as const),
  minusOptionDiscounts: Object.freeze([
    { unitType: '51A', supplyPriceWon: 26_440_000, balconyExtensionWon: 780_000 },
    { unitType: '55A', supplyPriceWon: 28_490_000, balconyExtensionWon: 770_000 },
    { unitType: '55B', supplyPriceWon: 28_480_000, balconyExtensionWon: 680_000 },
    { unitType: '59A', supplyPriceWon: 30_550_000, balconyExtensionWon: 990_000 },
  ] as const),
  housingCityFundWon: 55_000_000,
});

export const BUNDANG_MORTGAGE_DEFAULTS_V1 = Object.freeze({
  annualRateBps: 160,
  ltvBps: 7_000,
  maxLoanWon: 400_000_000,
});

/**
 * Read the official floor-priced supply amount.  Floors 5 and above share the
 * fifth price band; a non-positive floor is invalid instead of silently using
 * the first-floor price.
 */
export function findBundangSalePrice(
  catalog: BundangSaleFinanceCatalogV1,
  household: BundangSaleHouseholdV1,
): BundangSalePriceEntryV1 {
  const floor = household.floorBand ?? household.floor;
  if (!Number.isInteger(floor) || floor < 1) {
    throw new Error('유효한 세대 층수를 입력하세요.');
  }
  const entry = catalog.salePrices.find((candidate) =>
    candidate.unitType === household.unitType
      && floor >= candidate.floorFrom
      && (candidate.floorTo === null || floor <= candidate.floorTo));
  if (!entry) throw new Error(`${household.unitType} ${floor}층 공급가를 찾을 수 없습니다.`);
  return entry;
}

export function findBundangBalconyExtensionPrice(
  catalog: BundangSaleFinanceCatalogV1,
  unitType: BundangSaleUnitType,
): BundangBalconyExtensionEntryV1 {
  const entry = catalog.balconyExtensions.find((candidate) => candidate.unitType === unitType);
  if (!entry) throw new Error(`${unitType} 발코니 확장비를 찾을 수 없습니다.`);
  return entry;
}

export function findBundangMinusOptionDiscount(
  catalog: BundangSaleFinanceCatalogV1,
  unitType: BundangSaleUnitType,
): BundangMinusOptionDiscountV1 {
  const entry = catalog.minusOptionDiscounts.find((candidate) => candidate.unitType === unitType);
  if (!entry) throw new Error(`${unitType} 마이너스 옵션 감액을 찾을 수 없습니다.`);
  return entry;
}

export function calculateBundangOptionSubtotal(
  options: readonly BundangFinanceOptionLineV1[],
  tier?: BundangOptionTier,
): number {
  return options
    .filter((option) => !tier || option.tier === tier)
    .reduce((total, option) => total + nonNegativeWon(option.priceWon), 0);
}

interface PaymentDefinition {
  id: string;
  label: string;
  due: string;
  rateBps: number;
}

const PAYMENT_DEFINITIONS: Record<BundangPaymentPlanKind, Record<BundangPaymentTarget, readonly PaymentDefinition[]>> = {
  'pre-subscription': {
    supply: [
      { id: 'contract', label: '계약금', due: '계약 시', rateBps: 500 },
      { id: 'interim', label: '중도금', due: '2028-02-14', rateBps: 2_000 },
      { id: 'balance', label: '잔금', due: '입주 시', rateBps: 7_500 },
    ],
    balcony: [
      { id: 'contract', label: '계약금', due: '계약 시', rateBps: 500 },
      { id: 'interim', label: '중도금', due: '2028-02-14', rateBps: 2_000 },
      { id: 'balance', label: '잔금', due: '입주 시', rateBps: 7_500 },
    ],
    'option-ii': [
      { id: 'contract', label: '계약금', due: '계약 시', rateBps: 500 },
      { id: 'interim', label: '중도금', due: '2028-02-14', rateBps: 2_000 },
      { id: 'balance', label: '잔금', due: '입주 시', rateBps: 7_500 },
    ],
    'option-iii': [
      { id: 'contract', label: '계약금', due: '계약 시', rateBps: 500 },
      { id: 'interim', label: '중도금', due: '별도 안내', rateBps: 2_000 },
      { id: 'balance', label: '잔금', due: '입주 시', rateBps: 7_500 },
    ],
  },
  'main-subscription': {
    supply: [
      { id: 'contract', label: '계약금', due: '계약 시', rateBps: 1_000 },
      { id: 'interim-1', label: '중도금 1회차', due: '2027-04-12', rateBps: 1_000 },
      { id: 'interim-2', label: '중도금 2회차', due: '2028-02-14', rateBps: 1_000 },
      { id: 'balance', label: '잔금', due: '입주 시', rateBps: 7_000 },
    ],
    balcony: [
      { id: 'contract', label: '계약금', due: '계약 시', rateBps: 1_000 },
      { id: 'interim', label: '중도금', due: '2027-04-12', rateBps: 2_000 },
      { id: 'balance', label: '잔금', due: '입주 시', rateBps: 7_000 },
    ],
    'option-ii': [
      { id: 'contract', label: '계약금', due: '계약 시', rateBps: 1_000 },
      { id: 'interim', label: '중도금', due: '2027-04-12', rateBps: 3_000 },
      { id: 'balance', label: '잔금', due: '입주 시', rateBps: 6_000 },
    ],
    'option-iii': [
      { id: 'contract', label: '계약금', due: '계약 시', rateBps: 1_000 },
      { id: 'interim', label: '중도금', due: '별도 안내', rateBps: 3_000 },
      { id: 'balance', label: '잔금', due: '입주 시', rateBps: 6_000 },
    ],
  },
};

export const BUNDANG_PAYMENT_PLAN_PRESETS_V1 = PAYMENT_DEFINITIONS;

/**
 * Rounds each percentage line to won and assigns all rounding residue to the
 * final balance line. The housing-city-fund amount is notice metadata only;
 * it is not a supply-payment installment and never reduces the balance.
 */
export function calculateBundangPaymentSchedule(
  totalWon: number,
  planKind: BundangPaymentPlanKind,
  target: BundangPaymentTarget = 'supply',
): BundangPaymentScheduleV1 {
  const total = nonNegativeWon(totalWon);
  const definitions = PAYMENT_DEFINITIONS[planKind][target];
  let assigned = 0;
  return {
    target,
    totalWon: total,
    installments: definitions.map((definition, index) => {
      const isBalance = definition.id === 'balance';
      const amountWon = isBalance
          ? total - assigned
          : won(total * definition.rateBps / 10_000);
      assigned += amountWon;
      return {
        id: definition.id,
        label: definition.label,
        due: definition.due,
        rateBps: definition.rateBps,
        amountWon: index === definitions.length - 1 ? total - (assigned - amountWon) : amountWon,
      };
    }),
  };
}

/** Korean acquisition-tax estimate with the legal 6억/9억 rate bands and optional manual relief. */
export function calculateBundangAcquisitionTax(input: BundangAcquisitionTaxInputV1): BundangAcquisitionTaxQuoteV1 {
  const taxableAmountWon = nonNegativeWon(input.taxableAmountWon ?? 0);
  const thresholdWon = nonNegativeWon(input.thresholdWon ?? 600_000_000);
  // Deprecated configurable rates remain accepted for callers needing a
  // scenario, but the default follows the legal 1% / continuous / 3% bands.
  const underRatePercent = (input.underThresholdRateBps ?? 100) / 100;
  const overRatePercent = (input.overThresholdRateBps ?? 300) / 100;
  const rawAcquisitionTaxRatePercent = taxableAmountWon <= thresholdWon
    ? underRatePercent
    : taxableAmountWon <= 900_000_000
      ? taxableAmountWon * 2 / 300_000_000 - 3
      : overRatePercent;
  // 지방세법 제11조는 6억 초과~9억 이하 산식의 세율을 소수점
  // 다섯째 자리에서 반올림해 소수점 넷째 자리까지 사용한다.
  const acquisitionTaxRatePercent = Math.round(rawAcquisitionTaxRatePercent * 10_000) / 10_000;
  const acquisitionTaxWonBeforeRelief = won(taxableAmountWon * acquisitionTaxRatePercent / 100);
  const manualReliefWon = Math.min(acquisitionTaxWonBeforeRelief, nonNegativeWon(input.manualReliefWon ?? 0));
  const acquisitionTaxWon = acquisitionTaxWonBeforeRelief - manualReliefWon;
  // The manual relief control applies to acquisition tax only. Keep the
  // separately disclosed education-tax estimate on the pre-relief tax base.
  const localEducationTaxWon = won(acquisitionTaxWonBeforeRelief * 0.1);
  const ruralSpecialTaxWon = 0;
  return {
    taxableAmountWon,
    thresholdWon,
    acquisitionTaxRatePercent,
    acquisitionTaxWonBeforeRelief,
    manualReliefWon,
    acquisitionTaxWon,
    localEducationTaxWon,
    ruralSpecialTaxWon,
    totalTaxWon: acquisitionTaxWon + localEducationTaxWon + ruralSpecialTaxWon,
  };
}

/** 1.6% / 70% LTV / 4억원 cap with 1-year interest-only grace, then equal payments. */
export function calculateBundangMortgage(input: BundangMortgageInputV1): BundangMortgageQuoteV1 {
  const loanBaseWon = nonNegativeWon(input.loanBaseWon);
  const ltvBps = nonNegativeWon(input.ltvBps ?? BUNDANG_MORTGAGE_DEFAULTS_V1.ltvBps);
  const annualRateBps = nonNegativeWon(input.annualRateBps ?? BUNDANG_MORTGAGE_DEFAULTS_V1.annualRateBps);
  const maxLoanWon = nonNegativeWon(input.maxLoanWon ?? BUNDANG_MORTGAGE_DEFAULTS_V1.maxLoanWon);
  const termMonths = input.termYears * 12;
  const graceMonths = 12;
  const repaymentMonths = termMonths - graceMonths;
  const eligibleMaximumWon = Math.min(won(loanBaseWon * ltvBps / 10_000), maxLoanWon);
  const principalWon = Math.min(eligibleMaximumWon, nonNegativeWon(input.requestedLoanWon ?? eligibleMaximumWon));
  const monthlyRate = annualRateBps / 10_000 / 12;
  const graceMonthlyInterestWon = won(principalWon * annualRateBps / 10_000 / 12);
  const repaymentMonthlyPrincipalInterestWon = principalWon === 0
    ? 0
    : monthlyRate === 0
      ? won(principalWon / repaymentMonths)
      : won(principalWon * monthlyRate / (1 - (1 + monthlyRate) ** -repaymentMonths));
  const totalRepaymentWon = graceMonthlyInterestWon * graceMonths + repaymentMonthlyPrincipalInterestWon * repaymentMonths;
  return {
    loanBaseWon,
    ltvBps,
    annualRateBps,
    termMonths,
    graceMonths,
    repaymentMonths,
    eligibleMaximumWon,
    principalWon,
    graceMonthlyInterestWon,
    repaymentMonthlyPrincipalInterestWon,
    totalRepaymentWon,
    totalInterestWon: Math.max(0, totalRepaymentWon - principalWon),
  };
}

export function calculateMoveInRequiredCash(
  schedules: readonly BundangPaymentScheduleV1[],
  mortgagePrincipalWon: number,
): number {
  const balanceWon = schedules.reduce((sum, schedule) => sum + schedule.installments
    .filter((installment) => installment.id === 'balance')
    .reduce((subtotal, installment) => subtotal + installment.amountWon, 0), 0);
  return Math.max(0, balanceWon - nonNegativeWon(mortgagePrincipalWon));
}

export function calculateBundangSaleFinance(input: BundangFinanceInputV1): BundangFinanceQuoteV1 {
  const catalog = input.catalog ?? BUNDANG_SALE_FINANCE_CATALOG_V1;
  const salePrice = findBundangSalePrice(catalog, input.household);
  const balconyPrice = findBundangBalconyExtensionPrice(catalog, input.household.unitType).priceWon;
  const minus = input.selectMinusOption ? findBundangMinusOptionDiscount(catalog, input.household.unitType) : null;
  const adjustedSupplyPriceWon = Math.max(0, salePrice.supplyPriceWon - (minus?.supplyPriceWon ?? 0));
  const adjustedBalconyExtensionWon = input.includeBalconyExtension === false
    ? 0
    : Math.max(0, balconyPrice - (minus?.balconyExtensionWon ?? 0));
  // A minus-option contract cannot include ordinary paid option II/III items.
  const effectiveOptionLines = input.selectMinusOption ? [] : (input.optionLines ?? []);
  const optionIiSubtotalWon = calculateBundangOptionSubtotal(effectiveOptionLines, 'option-ii');
  const optionIiiSubtotalWon = calculateBundangOptionSubtotal(effectiveOptionLines, 'option-iii');
  const contractTotalWon = adjustedSupplyPriceWon + adjustedBalconyExtensionWon + optionIiSubtotalWon + optionIiiSubtotalWon;
  const paymentSchedules: BundangPaymentScheduleV1[] = [
    calculateBundangPaymentSchedule(adjustedSupplyPriceWon, input.paymentPlanKind, 'supply'),
  ];
  if (adjustedBalconyExtensionWon > 0) {
    paymentSchedules.push(calculateBundangPaymentSchedule(adjustedBalconyExtensionWon, input.paymentPlanKind, 'balcony'));
  }
  if (optionIiSubtotalWon > 0) {
    paymentSchedules.push(calculateBundangPaymentSchedule(optionIiSubtotalWon, input.paymentPlanKind, 'option-ii'));
  }
  if (optionIiiSubtotalWon > 0) {
    paymentSchedules.push(calculateBundangPaymentSchedule(optionIiiSubtotalWon, input.paymentPlanKind, 'option-iii'));
  }
  const acquisitionTax = calculateBundangAcquisitionTax({
    taxableAmountWon: contractTotalWon,
    ...input.acquisitionTax,
  });
  const mortgage = input.mortgage
    ? calculateBundangMortgage({ ...input.mortgage, loanBaseWon: adjustedSupplyPriceWon })
    : undefined;
  return {
    household: input.household,
    paymentPlanKind: input.paymentPlanKind,
    baseSupplyPriceWon: salePrice.supplyPriceWon,
    baseBalconyExtensionWon: input.includeBalconyExtension === false ? 0 : balconyPrice,
    minusSupplyDiscountWon: minus?.supplyPriceWon ?? 0,
    minusBalconyDiscountWon: input.includeBalconyExtension === false ? 0 : (minus?.balconyExtensionWon ?? 0),
    adjustedSupplyPriceWon,
    adjustedBalconyExtensionWon,
    optionIiSubtotalWon,
    optionIiiSubtotalWon,
    contractTotalWon,
    moveInRequiredCashWon: mortgage ? calculateMoveInRequiredCash(paymentSchedules, mortgage.principalWon) : undefined,
    paymentSchedules,
    acquisitionTax,
    mortgage,
  };
}
