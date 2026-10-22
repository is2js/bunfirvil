import { describe, expect, it } from 'vitest';
import {
  BUNDANG_MORTGAGE_SETTLEMENT_SOURCE_V1,
  calculateBundangMortgageSettlement,
  type BundangMortgageSettlementInputV1,
} from './bundang-mortgage-settlement';

const scenario: BundangMortgageSettlementInputV1 = {
  loanBaseWon: 500_000_000,
  principalWon: 350_000_000,
  annualRateBps: 130,
  termYears: 30,
  holdingYears: 10,
  childCount: 0,
  salePriceWon: 800_000_000,
};

describe('dedicated mortgage sale/appraisal scenario', () => {
  it('uses the actual agreement year rows, not interpolation between summary rows', () => {
    const years = [3, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 30];
    const expected70 = [50, 50, 48, 46, 44, 42, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 20];
    expect(years.map((holdingYears) => calculateBundangMortgageSettlement({ ...scenario, holdingYears }).fundSharePercent)).toEqual(expected70);
    // Floors of 15% and 10% are discrete table entries, not summary interpolation.
    expect(calculateBundangMortgageSettlement({ ...scenario, principalWon: 150_000_000, holdingYears: 11, childCount: 1 }).fundSharePercent).toBe(15);
    expect(calculateBundangMortgageSettlement({ ...scenario, principalWon: 200_000_000, holdingYears: 11, childCount: 2 }).fundSharePercent).toBe(10);
    expect(calculateBundangMortgageSettlement({ ...scenario, principalWon: 300_000_000, holdingYears: 21 }).fundSharePercent).toBe(20);
    expect(calculateBundangMortgageSettlement({ ...scenario, holdingYears: 21, childCount: 1 }).fundSharePercent).toBe(15);
  });

  it('matches all five official LTV and three child columns at the 10-year row', () => {
    const expected = [
      [70, [48, 38, 28]], [60, [43, 33, 23]], [50, [38, 28, 18]],
      [40, [33, 23, 13]], [30, [28, 18, 10]],
    ] as const;
    for (const [ltv, shares] of expected) {
      shares.forEach((share, childCount) => {
        const result = calculateBundangMortgageSettlement({ ...scenario, principalWon: scenario.loanBaseWon * ltv / 100, childCount });
        expect(result.effectiveLtvPercent).toBe(ltv);
        expect(result.fundSharePercent).toBe(share);
      });
    }
    expect(calculateBundangMortgageSettlement({ ...scenario, childCount: 3 }).fundSharePercent).toBe(28);
  });

  it('truncates actual LTV only for a capped loan and then interpolates the correct row', () => {
    const result = calculateBundangMortgageSettlement({ ...scenario, loanBaseWon: 645_000_000, principalWon: 400_000_000 });
    expect(result.effectiveLtvPercent).toBe(62);
    expect(result.fundSharePercent).toBe(44);
    expect(result.fundSettlementWon).toBe(68_200_000);
    const bucketRounding = calculateBundangMortgageSettlement({ ...scenario, loanBaseWon: 500_000_001, principalWon: 350_000_001 });
    expect(bucketRounding.effectiveLtvPercent).toBe(70);
  });

  it('uses supply plus balcony as acquisition base, with zero sharing on losses', () => {
    const result = calculateBundangMortgageSettlement(scenario);
    expect(result.appreciationWon).toBe(300_000_000);
    expect(result.fundSettlementWon).toBe(144_000_000);
    expect(result.netSaleProceedsWon).toBe(800_000_000 - result.remainingPrincipalWon - 144_000_000);
    const loss = calculateBundangMortgageSettlement({ ...scenario, salePriceWon: 400_000_000 });
    expect(loss.appreciationWon).toBe(0);
    expect(loss.fundSettlementWon).toBe(0);
    const gap = calculateBundangMortgageSettlement({ ...scenario, salePriceWon: 0 });
    expect(gap.netSaleProceedsWon).toBe(-gap.remainingPrincipalWon);
  });

  it('includes one interest-only year and amortizes the remaining 19/29 years', () => {
    const principalWon = 350_000_000;
    for (const termYears of [20, 30] as const) {
      const interestFree = calculateBundangMortgageSettlement({ ...scenario, termYears, holdingYears: 3, annualRateBps: 0 });
      expect(interestFree.remainingPrincipalWon).toBe(Math.round(principalWon * (1 - 24 / ((termYears - 1) * 12))));
      expect(interestFree.paidInterestWon).toBe(0);
      const result = calculateBundangMortgageSettlement({ ...scenario, termYears, holdingYears: 3 });
      const monthlyRate = 0.013 / 12;
      const count = (termYears - 1) * 12;
      const payment = principalWon * monthlyRate / (1 - (1 + monthlyRate) ** -count);
      const balance = principalWon * (1 + monthlyRate) ** 24 - payment * ((1 + monthlyRate) ** 24 - 1) / monthlyRate;
      expect(result.remainingPrincipalWon).toBe(Math.round(balance));
      expect(result.repaidPrincipalWon + result.remainingPrincipalWon).toBe(principalWon);
      expect(result.paidInterestWon).toBe(Math.round(principalWon * 0.013 + payment * 24 - (principalWon - balance)));
      const maturity = calculateBundangMortgageSettlement({ ...scenario, termYears, holdingYears: termYears });
      expect(maturity.remainingPrincipalWon).toBe(0);
      expect(maturity.repaidPrincipalWon).toBe(principalWon);
      expect(maturity.paidInterestWon).toBeGreaterThan(result.paidInterestWon);
    }
  });

  it('retains official provenance and rejects impossible or nonfinite scenarios', () => {
    expect(BUNDANG_MORTGAGE_SETTLEMENT_SOURCE_V1.agreementRevisedAt).toBe('2025-12-01');
    const invalid: Partial<BundangMortgageSettlementInputV1>[] = [
      { loanBaseWon: 0 }, { loanBaseWon: NaN }, { principalWon: -1 }, { principalWon: 0 },
      { principalWon: 149_000_000 }, { principalWon: 351_000_000 }, { principalWon: 401_000_000, loanBaseWon: 700_000_000 },
      { principalWon: 310_000_000 }, { holdingYears: 2 }, { holdingYears: 31 }, { holdingYears: 3.5 },
      { annualRateBps: -1 }, { annualRateBps: NaN }, { childCount: -1 }, { childCount: 1.5 },
      { salePriceWon: -1 }, { salePriceWon: Infinity }, { salePriceWon: 10.5 },
    ];
    for (const input of invalid) expect(() => calculateBundangMortgageSettlement({ ...scenario, ...input })).toThrow();
    expect(() => calculateBundangMortgageSettlement({ ...scenario, termYears: 25 as 20 })).toThrow();
  });
});
