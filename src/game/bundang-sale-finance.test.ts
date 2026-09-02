import { describe, expect, it } from 'vitest';
import {
  BUNDANG_SALE_FINANCE_CATALOG_V1,
  bundangMortgageFundSharePercent,
  calculateBundangAcquisitionTax,
  calculateBundangMortgage,
  calculateMoveInRequiredCash,
  calculateBundangPaymentSchedule,
  calculateBundangSaleFinance,
  findBundangSalePrice,
} from './bundang-sale-finance';

describe('Bundang sale finance', () => {
  it('contains the official four-type, five-floor supply table and balcony prices', () => {
    expect(BUNDANG_SALE_FINANCE_CATALOG_V1.salePrices).toHaveLength(20);
    const official = {
      '51A': [555_310_000, 561_220_000, 573_030_000, 584_850_000, 590_760_000],
      '55A': [598_310_000, 604_680_000, 617_410_000, 630_140_000, 636_510_000],
      '55B': [598_110_000, 604_470_000, 617_200_000, 629_920_000, 636_290_000],
      '59A': [641_430_000, 648_260_000, 661_900_000, 675_550_000, 682_380_000],
    } as const;
    for (const [unitType, prices] of Object.entries(official)) {
      prices.forEach((price, index) => {
        expect(findBundangSalePrice(BUNDANG_SALE_FINANCE_CATALOG_V1, {
          unitType: unitType as keyof typeof official,
          floorBand: (index + 1) as 1 | 2 | 3 | 4 | 5,
        }).supplyPriceWon).toBe(price);
      });
    }
    expect(BUNDANG_SALE_FINANCE_CATALOG_V1.balconyExtensions).toEqual([
      { unitType: '51A', priceWon: 5_213_000 },
      { unitType: '55A', priceWon: 5_138_000 },
      { unitType: '55B', priceWon: 4_556_000 },
      { unitType: '59A', priceWon: 6_620_000 },
    ]);
    expect(BUNDANG_SALE_FINANCE_CATALOG_V1.minusOptionDiscounts).toEqual([
      { unitType: '51A', supplyPriceWon: 26_440_000, balconyExtensionWon: 780_000 },
      { unitType: '55A', supplyPriceWon: 28_490_000, balconyExtensionWon: 770_000 },
      { unitType: '55B', supplyPriceWon: 28_480_000, balconyExtensionWon: 680_000 },
      { unitType: '59A', supplyPriceWon: 30_550_000, balconyExtensionWon: 990_000 },
    ]);
  });

  it('uses the notice payment configurations and corrects the rounded residue in the balance', () => {
    const pre = calculateBundangPaymentSchedule(5_213_000, 'pre-subscription', 'balcony');
    expect(pre.installments.map((line) => [line.due, line.amountWon])).toEqual([
      ['계약 시', 260_650], ['2028-02-14', 1_042_600], ['입주 시', 3_909_750],
    ]);
    expect(pre.installments.reduce((sum, line) => sum + line.amountWon, 0)).toBe(5_213_000);

    const main = calculateBundangPaymentSchedule(1_000_001, 'main-subscription', 'option-iii');
    expect(main.installments[1]?.due).toBe('별도 안내');
    expect(main.installments.map((line) => line.rateBps)).toEqual([1_000, 3_000, 6_000]);
    expect(main.installments.reduce((sum, line) => sum + line.amountWon, 0)).toBe(1_000_001);

    expect(calculateBundangPaymentSchedule(1_000_000, 'main-subscription', 'supply').installments.map((line) => line.rateBps)).toEqual([1_000, 1_000, 1_000, 7_000]);
    expect(calculateBundangPaymentSchedule(1_000_000, 'main-subscription', 'balcony').installments.map((line) => line.rateBps)).toEqual([1_000, 2_000, 7_000]);
    expect(calculateBundangPaymentSchedule(1_000_000, 'main-subscription', 'option-ii').installments.map((line) => line.rateBps)).toEqual([1_000, 3_000, 6_000]);
    expect(calculateBundangPaymentSchedule(1_000_000, 'pre-subscription', 'option-iii').installments.map((line) => line.rateBps)).toEqual([500, 2_000, 7_500]);
  });

  it('keeps the housing-city-fund metadata out of the supply schedule', () => {
    const schedule = calculateBundangPaymentSchedule(555_310_000, 'pre-subscription', 'supply');
    expect(schedule.installments.map((line) => line.amountWon)).toEqual([27_765_500, 111_062_000, 416_482_500]);
  });

  it('separates option II and III, and clears both under the minus-option contract', () => {
    const base = calculateBundangSaleFinance({
      household: { unitType: '55A', floor: 2 },
      paymentPlanKind: 'main-subscription',
      optionLines: [
        { id: 'system-ac', label: '시스템 에어컨', tier: 'option-ii', priceWon: 5_200_000 },
        { id: 'wide-floor', label: '광폭 강마루', tier: 'option-iii', priceWon: 1_820_000 },
      ],
    });
    expect(base.optionIiSubtotalWon).toBe(5_200_000);
    expect(base.optionIiiSubtotalWon).toBe(1_820_000);
    expect(base.contractTotalWon).toBe(616_838_000);

    const minus = calculateBundangSaleFinance({
      household: { unitType: '55A', floor: 2 },
      paymentPlanKind: 'main-subscription',
      selectMinusOption: true,
      optionLines: [{ id: 'ignored', label: 'ignored', tier: 'option-ii', priceWon: 99_999_999 }],
    });
    expect(minus.adjustedSupplyPriceWon).toBe(576_190_000);
    expect(minus.adjustedBalconyExtensionWon).toBe(4_368_000);
    expect(minus.optionIiSubtotalWon).toBe(0);
    expect(minus.contractTotalWon).toBe(580_558_000);
  });

  it('applies the legal 6억원/9억원 tax bands and caps manual relief on acquisition tax only', () => {
    expect(calculateBundangAcquisitionTax({ taxableAmountWon: 600_000_000 })).toMatchObject({ acquisitionTaxRatePercent: 1, acquisitionTaxWon: 6_000_000, localEducationTaxWon: 600_000, totalTaxWon: 6_600_000 });
    expect(calculateBundangAcquisitionTax({ taxableAmountWon: 600_000_001 }).acquisitionTaxRatePercent).toBe(1);
    expect(calculateBundangAcquisitionTax({ taxableAmountWon: 750_000_000 })).toMatchObject({ acquisitionTaxRatePercent: 2, acquisitionTaxWon: 15_000_000, localEducationTaxWon: 1_500_000 });
    expect(calculateBundangAcquisitionTax({ taxableAmountWon: 900_000_000 })).toMatchObject({ acquisitionTaxRatePercent: 3, acquisitionTaxWon: 27_000_000 });
    expect(calculateBundangAcquisitionTax({ taxableAmountWon: 100_000_000, manualReliefWon: 99_999_999 })).toMatchObject({ acquisitionTaxWonBeforeRelief: 1_000_000, manualReliefWon: 1_000_000, acquisitionTaxWon: 0, localEducationTaxWon: 100_000, totalTaxWon: 100_000 });
  });

  it('uses the notice 1.3% mortgage and caps it at 70% LTV and 4억원', () => {
    const twenty = calculateBundangMortgage({ loanBaseWon: 682_380_000, termYears: 20 });
    const thirty = calculateBundangMortgage({ loanBaseWon: 682_380_000, termYears: 30, requestedLoanWon: 300_000_000 });
    expect(twenty.eligibleMaximumWon).toBe(400_000_000);
    expect(twenty.principalWon).toBe(400_000_000);
    expect(twenty.annualRateBps).toBe(130);
    expect(twenty.graceMonths).toBe(12);
    expect(twenty.repaymentMonths).toBe(228);
    expect(twenty.repaymentMonthlyPrincipalInterestWon).toBeGreaterThan(thirty.repaymentMonthlyPrincipalInterestWon);
    expect(thirty.totalInterestWon).toBeGreaterThan(0);
    const schedules = [calculateBundangPaymentSchedule(600_000_000, 'main-subscription', 'supply')];
    expect(calculateMoveInRequiredCash(schedules, 400_000_000)).toBe(20_000_000);
  });

  it('applies the notice child-count and settlement-period fund share table', () => {
    expect(bundangMortgageFundSharePercent(70, 0, '1-9')).toBe(50);
    expect(bundangMortgageFundSharePercent(70, 2, '1-9')).toBe(30);
    expect(bundangMortgageFundSharePercent(60, 1, '14')).toBe(25);
    expect(bundangMortgageFundSharePercent(30, 0, '19')).toBe(20);
    expect(bundangMortgageFundSharePercent(50, 2, '24+')).toBe(10);
  });
});
