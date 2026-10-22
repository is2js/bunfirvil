import type { BundangPaymentScheduleV1 } from './bundang-sale-finance';

export interface BundangMoveInAdditionalCostV1 {
  id: string;
  amountWon: number;
}

export interface BundangMoveInSettlementInputV1 {
  paymentSchedules: readonly BundangPaymentScheduleV1[];
  interimFunding: 'cash' | 'loan';
  interimInterestWon?: number;
  mortgagePrincipalWon?: number;
  acquisitionTaxWon?: number;
  additionalCosts?: readonly BundangMoveInAdditionalCostV1[];
}

export interface BundangMoveInSettlementV1 {
  balancePaymentsWon: number;
  interimLoanRepaymentWon: number;
  deferredInterestWon: number;
  acquisitionTaxWon: number;
  additionalCostsWon: number;
  usesAtMoveInWon: number;
  mortgageAppliedWon: number;
  mortgageExcessWon: number;
  requiredCashAtMoveInWon: number;
  selfFundedBeforeMoveInWon: number;
  totalOwnCashWon: number;
  totalAcquisitionBudgetWon: number;
}

/** Reject invalid money rather than silently turning an invalid scenario into zero. */
function checkedWon(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value))) {
    throw new Error(`${label}은 0 이상의 유한한 원화 금액이어야 합니다.`);
  }
  return Math.round(value);
}

function sumWon(values: readonly number[], label: string): number {
  return checkedWon(values.reduce((sum, value) => sum + value, 0), label);
}

/**
 * Separate contract payments from financing and move-in-only costs. A supply
 * interim loan defers that principal until move-in; it is not a second grant.
 * The final mortgage is applied only once, against all uses at move-in. Excess
 * mortgage capacity is disclosed instead of becoming negative required cash.
 * Does not mutate the official payment schedules or persist household details.
 */
export function calculateBundangMoveInSettlement(
  input: BundangMoveInSettlementInputV1,
): BundangMoveInSettlementV1 {
  if (input.interimFunding !== 'cash' && input.interimFunding !== 'loan') {
    throw new Error('중도금 자금 조달 방식이 올바르지 않습니다.');
  }
  const interest = checkedWon(input.interimInterestWon ?? 0, '중도금 후불이자');
  const mortgage = checkedWon(input.mortgagePrincipalWon ?? 0, '잔금 대출금');
  const acquisitionTaxWon = checkedWon(input.acquisitionTaxWon ?? 0, '취득 관련 세금');
  const additionalCostsWon = sumWon((input.additionalCosts ?? []).map((cost) =>
    checkedWon(cost.amountWon, '입주 부대비용')), '입주 부대비용 합계');
  const balances: number[] = [];
  const beforeMoveIn: number[] = [];
  const supplyInterims: number[] = [];
  for (const schedule of input.paymentSchedules) {
    checkedWon(schedule.totalWon, '계약 항목 합계');
    for (const installment of schedule.installments) {
      const amount = checkedWon(installment.amountWon, '납부 회차 금액');
      (installment.id === 'balance' ? balances : beforeMoveIn).push(amount);
      if (schedule.target === 'supply' && installment.id.startsWith('interim')) {
        supplyInterims.push(amount);
      }
    }
  }
  const balancePaymentsWon = sumWon(balances, '잔금 합계');
  const beforeMoveInWon = sumWon(beforeMoveIn, '입주 전 납부 합계');
  const interimLoanRepaymentWon = input.interimFunding === 'loan'
    ? sumWon(supplyInterims, '중도금 대출 상환원금') : 0;
  const deferredInterestWon = input.interimFunding === 'loan' ? interest : 0;
  const usesAtMoveInWon = sumWon([
    balancePaymentsWon, interimLoanRepaymentWon, deferredInterestWon,
    acquisitionTaxWon, additionalCostsWon,
  ], '입주 시 필요금액');
  const mortgageAppliedWon = Math.min(mortgage, usesAtMoveInWon);
  const mortgageExcessWon = mortgage - mortgageAppliedWon;
  const requiredCashAtMoveInWon = usesAtMoveInWon - mortgageAppliedWon;
  const selfFundedBeforeMoveInWon = beforeMoveInWon - interimLoanRepaymentWon;
  return {
    balancePaymentsWon,
    interimLoanRepaymentWon,
    deferredInterestWon,
    acquisitionTaxWon,
    additionalCostsWon,
    usesAtMoveInWon,
    mortgageAppliedWon,
    mortgageExcessWon,
    requiredCashAtMoveInWon,
    selfFundedBeforeMoveInWon,
    totalOwnCashWon: sumWon([selfFundedBeforeMoveInWon, requiredCashAtMoveInWon], '전체 자기자금'),
    totalAcquisitionBudgetWon: sumWon([
      beforeMoveInWon, balancePaymentsWon, deferredInterestWon,
      acquisitionTaxWon, additionalCostsWon,
    ], '총 취득 예산'),
  };
}
