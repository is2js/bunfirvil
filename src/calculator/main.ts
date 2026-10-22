import './style.css';
import { loadCatalog } from '../game/catalog';
import { readHouseholdVerificationSession } from '../game/household-verification';
import { BUNDANG_MINUS_OPTION_ID } from '../game/minus-option';
import { BUNDANG_INTERIM_LOAN_ASSUMED_MOVE_IN_DATE, calculateBundangInterimLoanInterest, calculateBundangSaleFinance, type BundangInterimLoanInterestQuoteV1, type BundangMortgageChildCount, type BundangPaymentPlanKind, type BundangSaleFloorBand, type BundangSaleUnitType } from '../game/bundang-sale-finance';
import { calculateBundangMoveInSettlement } from '../game/bundang-move-in-finance';
import { calculateBundangMortgageSettlement } from '../game/bundang-mortgage-settlement';
import { countdownForDeadline, paymentDeadlineForDue, seoulDateKey } from '../game/bundang-payment-timeline';
import { clearSaleCalculatorContext, readSaleCalculatorLaunchContext, type SaleCalculatorContextV1 } from '../game/sale-calculator-context';
import { resolveSaleCalculatorOptionLines, type SaleCalculatorOptionLineV1 } from '../game/sale-calculator-options';

type ScheduleRow = { label: string; due: string; dueKey: string; supply: number; balcony: number; systemAc: number; other: number };
type TaxReliefMode = 'none' | 'first-home' | 'birth-care';
type Quote = {
  baseSupply: number; adjustedSupply: number; baseBalcony: number; selectedOptions: number;
  minusSupply: number; minusBalcony: number; minusDiscount: number; contractTotal: number;
  schedule: ScheduleRow[]; optionLines: SaleCalculatorOptionLineV1[]; interimLoan: BundangInterimLoanInterestQuoteV1;
  moveIn: ReturnType<typeof calculateBundangMoveInSettlement>;
  tax?: { taxable: number; ratePercent: number; relief: number; acquisition: number; education: number; rural: number; total: number };
  mortgage?: { principal: number; eligibleMaximum: number; moveInCash: number; graceInterest: number;
    repayment: number; ltvPercent: number; annualRatePercent: number; repaymentMonths: number; loanBase: number;
    settlement: ReturnType<typeof calculateBundangMortgageSettlement> };
};
const COST_ITEMS = [
  ['stamp', '인지세 등 미납 계약비', '계약서별 세액·분담액을 확인하고 이미 낸 금액은 제외하세요.'],
  ['bond', '국민주택채권 할인손실', '시가표준액·지분·지역·당일 할인율로 별도 확인합니다.'],
  ['registration', '등기·법무사 비용', '등기 수수료·법무사 보수 등 실제 견적을 입력합니다.'],
  ['guarantee', '대출 보증·담보 비용', '은행의 보증료·근저당 등 부담 항목을 확인합니다.'],
  ['management', '관리비 예치금', '입주 안내에서 정한 예치금이며 소모 비용과 구분합니다.'],
  ['moving', '이사·추가 공사 예산', '마이너스 옵션 후 개별 시공비는 여기에 따로 반영합니다.'],
] as const;
type CostId = typeof COST_ITEMS[number][0];
const FINANCE_REVIEWED_AT = '2026.10.22';
const MORTGAGE_SOURCE = 'https://obank.kbstar.com/quics?cc=b032425%3Ab033525&isNew=N&page=C020709&prcode=LN40001026';
const MORTGAGE_CONTRACT = 'https://img2.kbstar.com/obj/ocommon/251201_Contract_6.pdf';

const moneyFormat = new Intl.NumberFormat('ko-KR');
const money = (value: number) => `${moneyFormat.format(value)}원`;
const escape = (value: string) => value.replace(/[&<>'"]/g, (key) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[key] ?? key));
const floorLabel = (floor: BundangSaleFloorBand) => floor === 5 ? '5층 이상' : `${floor}층`;
const toFloor = (band: SaleCalculatorContextV1['priceFloorBand']): BundangSaleFloorBand => band === '5+' ? 5 : Number(band) as BundangSaleFloorBand;

function mergeSchedules(schedules: ReturnType<typeof calculateBundangSaleFinance>['paymentSchedules'], plan: BundangPaymentPlanKind): ScheduleRow[] {
  const merged = new Map<string, ScheduleRow>();
  for (const schedule of schedules) for (const item of schedule.installments) {
    // The 5,500만원 housing-city-fund figure is notice metadata here, not an
    // actual installment. Do not render a misleading zero-value payment row.
    if (item.id === 'fund' && item.amountWon === 0) continue;
    const key = item.due;
    const row = merged.get(key) ?? { label: item.label, due: item.due, dueKey: key, supply: 0, balcony: 0, systemAc: 0, other: 0 };
    if (schedule.target === 'supply') row.supply += item.amountWon;
    else if (schedule.target === 'balcony') row.balcony += item.amountWon;
    else if (schedule.target === 'option-ii') row.systemAc += item.amountWon;
    else row.other += item.amountWon;
    merged.set(key, row);
  }
  const dueOrder = new Map([['계약 시', 1], ['2027-04-12', 2], ['2028-02-14', 3], ['별도 안내', 4], ['입주 시', 5]]);
  const labelForDue = (due: string) => ({
    '계약 시': '계약금', '2027-04-12': '중도금 1차', '별도 안내': '기타 옵션 중도금',
    '2028-02-14': plan === 'pre-subscription' ? '중도금' : '중도금 2차', '입주 시': '잔금',
  }[due] ?? '납부 일정');
  return [...merged.values()]
    .sort((left, right) => (dueOrder.get(left.due) ?? 99) - (dueOrder.get(right.due) ?? 99))
    .map((row) => ({ ...row, label: labelForDue(row.due), due: paymentDeadlineForDue(row.due).dateLabel }));
}

class CalculatorApp {
  private readonly context = readSaleCalculatorLaunchContext();
  private readonly verification = readHouseholdVerificationSession();
  private options: SaleCalculatorOptionLineV1[] = [];
  private plan: BundangPaymentPlanKind;
  private taxEnabled = false;
  private taxReliefMode: TaxReliefMode = 'none';
  private interimLoanEnabled = false;
  private interimRatePercent = 4;
  private mortgageEnabled = false;
  private ltv: 30 | 40 | 50 | 60 | 70 = 70;
  private term: 20 | 30 = 30;
  private childCount: BundangMortgageChildCount = 0;
  private holdingYears = 24;
  private interimFunding: 'cash' | 'loan' = 'loan';
  private assumedMoveInDate = BUNDANG_INTERIM_LOAN_ASSUMED_MOVE_IN_DATE;
  private costsEnabled = false;
  private costs: Record<CostId, number> = { stamp: 0, bond: 0, registration: 0, guarantee: 0, management: 0, moving: 0 };
  private salePriceWon: number | null = null;
  private restorePrintState: (() => void) | null = null;
  private scheduleRows: ScheduleRow[] = [];
  private countdownTimer: number | undefined;

  constructor(private readonly mount: HTMLElement) {
    this.plan = this.context?.applicantRoute ?? 'main-subscription';
    window.addEventListener('beforeprint', () => this.preparePrint());
    window.addEventListener('afterprint', () => { this.restorePrintState?.(); this.restorePrintState = null; });
    document.addEventListener('visibilitychange', this.scheduleCountdownRefresh);
    window.addEventListener('pageshow', this.scheduleCountdownRefresh);
    window.addEventListener('pagehide', () => window.clearTimeout(this.countdownTimer));
  }
  private get ready(): boolean { return Boolean(this.context && this.verification); }
  private get unitType(): BundangSaleUnitType { return this.context!.unitType as BundangSaleUnitType; }
  private get floor(): BundangSaleFloorBand { return toFloor(this.context!.priceFloorBand); }
  private get minus(): boolean { return (this.context!.optionIds ?? []).includes(BUNDANG_MINUS_OPTION_ID); }

  async start(): Promise<void> {
    if (!this.ready) { this.renderRecovery(); return; }
    const { catalog, fallback } = await loadCatalog();
    if (fallback) {
      this.renderRecovery('공식 옵션 가격 카탈로그를 불러오지 못해 계산을 중단했습니다. 잠시 후 쇼케이스에서 다시 시도해 주세요.');
      return;
    }
    this.options = resolveSaleCalculatorOptionLines(catalog.bOptions, this.context!.optionIds ?? [], this.unitType);
    const selectedIds = [...new Set(this.context!.optionIds ?? [])];
    if (!this.minus && (this.options.length !== selectedIds.length || this.options.some((line) => !selectedIds.includes(line.id)))) {
      clearSaleCalculatorContext();
      this.renderRecovery('선택 옵션 일부를 공식 가격 카탈로그에서 확인하지 못해 계산을 중단했습니다. 쇼케이스에서 옵션을 다시 선택해 주세요.');
      return;
    }
    this.render();
    this.scheduleCountdownRefresh();
  }

  private calculate(): Quote {
    const taxRelief = this.taxReliefMode === 'first-home' ? 2_000_000 : this.taxReliefMode === 'birth-care' ? 5_000_000 : 0;
    const result = calculateBundangSaleFinance({
      household: { unitType: this.unitType, floorBand: this.floor }, paymentPlanKind: this.plan,
      includeBalconyExtension: true, selectMinusOption: this.minus, optionLines: this.options,
      acquisitionTax: { manualReliefWon: this.taxEnabled ? taxRelief : 0 },
      mortgage: this.mortgageEnabled ? { termYears: this.term, ltvBps: this.ltv * 100 } : undefined,
    });
    const interimLoan = calculateBundangInterimLoanInterest({
      adjustedSupplyPriceWon: result.adjustedSupplyPriceWon, paymentPlanKind: this.plan,
      annualRateBps: Math.round(this.interimRatePercent * 100), assumedMoveInDate: this.assumedMoveInDate,
    });
    const moveIn = calculateBundangMoveInSettlement({
      paymentSchedules: result.paymentSchedules, interimFunding: this.interimFunding,
      interimInterestWon: this.interimFunding === 'loan' && this.interimLoanEnabled ? interimLoan.totalInterestWon : 0,
      mortgagePrincipalWon: result.mortgage?.principalWon ?? 0,
      acquisitionTaxWon: this.taxEnabled ? result.acquisitionTax.totalTaxWon : 0,
      additionalCosts: this.costsEnabled ? COST_ITEMS.map(([id]) => ({ id, amountWon: this.costs[id] })) : [],
    });
    return {
      baseSupply: result.baseSupplyPriceWon, adjustedSupply: result.adjustedSupplyPriceWon, baseBalcony: result.baseBalconyExtensionWon,
      selectedOptions: result.optionIiSubtotalWon + result.optionIiiSubtotalWon,
      minusSupply: result.minusSupplyDiscountWon, minusBalcony: result.minusBalconyDiscountWon,
      minusDiscount: result.minusSupplyDiscountWon + result.minusBalconyDiscountWon,
      contractTotal: result.contractTotalWon, schedule: mergeSchedules(result.paymentSchedules, this.plan), optionLines: this.options,
      interimLoan, moveIn,
      ...(this.taxEnabled ? { tax: {
        taxable: result.acquisitionTax.taxableAmountWon, ratePercent: result.acquisitionTax.acquisitionTaxRatePercent,
        relief: result.acquisitionTax.manualReliefWon, acquisition: result.acquisitionTax.acquisitionTaxWon,
        education: result.acquisitionTax.localEducationTaxWon, rural: result.acquisitionTax.ruralSpecialTaxWon,
        total: result.acquisitionTax.totalTaxWon,
      } } : {}),
      ...(this.mortgageEnabled && result.mortgage ? { mortgage: {
        principal: result.mortgage.principalWon, eligibleMaximum: result.mortgage.eligibleMaximumWon,
        moveInCash: moveIn.requiredCashAtMoveInWon, graceInterest: result.mortgage.graceMonthlyInterestWon,
        repayment: result.mortgage.repaymentMonthlyPrincipalInterestWon, ltvPercent: result.mortgage.ltvBps / 100,
        annualRatePercent: result.mortgage.annualRateBps / 100, repaymentMonths: result.mortgage.repaymentMonths,
        loanBase: result.mortgage.loanBaseWon,
        settlement: calculateBundangMortgageSettlement({
          loanBaseWon: result.mortgage.loanBaseWon, principalWon: result.mortgage.principalWon,
          annualRateBps: result.mortgage.annualRateBps, termYears: this.term, holdingYears: this.holdingYears,
          childCount: this.childCount, salePriceWon: this.salePriceWon ?? result.mortgage.loanBaseWon,
        }),
      } } : {}),
    };
  }

  private renderRecovery(message = '이 계산기는 인증된 쇼케이스 선택과 계산기 실행 컨텍스트가 있어야 열립니다. 개인정보나 동·호 정보는 이 화면에 표시하지 않습니다.'): void {
    this.mount.innerHTML = `<main class="recovery-shell"><section class="recovery-card"><p class="eyebrow">SALE CALCULATOR / ACCESS REQUIRED</p><h1>계산 정보를 복구할 수 없습니다.</h1><p>${escape(message)}</p><a id="calculator-reselect-household" class="primary-link" href="../">세대 다시 선택</a><a class="muted-link" href="../guides/">공개 가이드 보기</a></section></main>`;
  }

  private render(): void {
    const disclosureState = new Map([...this.mount.querySelectorAll<HTMLDetailsElement>('details[id]')].map((node) => [node.id, node.open]));
    const active = this.mount.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const focusId = active?.id;
    const quote = this.calculate();
    this.scheduleRows = quote.schedule;
    const planName = this.plan === 'main-subscription' ? '본청약 기준' : '사전청약 당첨자 기준';
    this.mount.innerHTML = `<div class="calculator-shell">
      <a class="skip-link" href="#calculator-main">계산기 본문으로 건너뛰기</a>
      <header class="topbar"><a class="brand" href="../" aria-label="놀이터로 돌아가기"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span><b>e편한세상 분당퍼스트빌리지</b><small>돌아온범생의 놀이터 개발 연구실</small></span></a><nav class="topnav" aria-label="주 메뉴"><a href="../">놀이터</a><a class="is-active" href="./">자금 계획</a><a href="../guides/">가이드</a><a href="../households/">동·호 현황</a></nav><div id="calculator-context-header" class="build-chip" data-payment-plan="${this.plan}"><i class="status-dot"></i><span><small>${this.unitType} · ${floorLabel(this.floor)} · ${FINANCE_REVIEWED_AT} 검토</small><b>${planName}</b></span></div></header>
      <div class="serverless-banner"><span class="banner-pulse"></span><b>브라우저 계산 도구</b><i></i><span>계산 결과는 참고용이며 공식 공고·계약서가 우선합니다.</span></div>
      <main id="calculator-main" class="calculator-main">
        <section class="calculator-hero"><div><p class="eyebrow">BUNFIRVIL / SALE FINANCE</p><h1>내 자금 계획</h1><p><b class="context-highlight">${this.unitType} · ${floorLabel(this.floor)} · ${planName}</b> 쇼케이스 선택을 기준으로 계산합니다. 세대 정보는 이 화면에 남기지 않습니다.</p><fieldset class="plan-switch hero-plan-switch" aria-label="청약 구분"><legend>청약 구분</legend><label><input id="calculator-plan-main" name="payment-plan" value="main-subscription" type="radio" ${this.plan === 'main-subscription' ? 'checked' : ''}><span>본청약(신규신청자)</span></label><label><input id="calculator-plan-pre" name="payment-plan" value="pre-subscription" type="radio" ${this.plan === 'pre-subscription' ? 'checked' : ''}><span>사전청약 당첨자</span></label></fieldset><p class="source-stamp">기준: 입주자모집공고 2026.05.29 · 자금 정보 검토 ${FINANCE_REVIEWED_AT} · 예정 일정은 변경될 수 있습니다.</p></div><aside class="restore-card"><span>선택 옵션 상태</span><strong>${(this.context!.optionIds ?? []).length}개 불러옴</strong><p>평형·층은 인증된 선택값으로 고정됩니다.</p><button id="calculator-return-options" data-action="return-to-showcase" type="button">옵션 다시 선택</button></aside></section>
        <section class="quote-layout"><article class="calculator-card result-card"><div class="section-head result-head"><div><p class="eyebrow">CONTRACT</p><h2>최종 계약 예상 총액</h2></div><button id="calculator-print" data-action="print" class="print-button" type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-3M7 13h10v8H7z" /></svg><span>인쇄 · PDF 저장</span></button></div><div class="hero-total"><span>공급가 + 발코니 + 선택 옵션 − 마이너스 감액</span><strong>${money(quote.contractTotal)}</strong><p>세금·대출은 오른쪽 항목을 펼쳐 선택할 때만 별도로 계산합니다.</p></div><dl class="contract-breakdown"><div><dt>조정 전 공급가</dt><dd>${money(quote.baseSupply)}</dd></div><div><dt>발코니 확장</dt><dd>${money(quote.baseBalcony)}</dd></div><div><dt>선택 옵션 합계</dt><dd>${money(quote.selectedOptions)}</dd></div><div class="discount"><dt>마이너스 감액</dt><dd>−${money(quote.minusDiscount)}</dd></div></dl><p class="fund-note">공고표의 주택도시기금 55,000,000원은 실제 수령액으로 차감하지 않았습니다.</p><div class="payment-block" id="calculator-payments"><div class="subhead"><h3>납부 일정</h3><span>동일 회차·일자 기준 합산</span></div>${this.scheduleTable(quote.schedule)}<p class="schedule-note">추가선택품목 Ⅲ 중도금은 공고문상 납부일이 <b>별도 안내</b>로 명시되어 공급대금 중도금 1·2차에 합산하지 않습니다.</p></div>${this.moveInMarkup(quote)}${this.paymentGuideMarkup()}</article><aside class="calculator-side"><details id="calculator-option-details" class="calculator-card disclosure option-card"><summary><span class="summary-title">선택 옵션 <b>${this.minus ? 1 : quote.optionLines.length}개</b></span><span>펼치기</span></summary><div class="disclosure-body">${this.optionMarkup(quote)}</div></details>${this.taxDetails(quote)}${this.interimLoanDetails(quote)}${this.mortgageDetails(quote)}${this.costDetails(quote)}${this.resaleDetails(quote)}<article class="calculator-card source-card"><p class="eyebrow">NOTICE</p><h2>계산 전 확인</h2><p>금액·일정·감면·대출 실행은 공고문, 계약서, 관계기관 심사 결과가 우선합니다.</p><a href="../guides/?guide=sale-finance" class="text-link">입주·자금 계산 가이드 보기 →</a></article></aside></section>
      </main><footer class="calculator-footer"><span>BUNFIRVIL · STATIC FRONTEND</span><span>개인정보·인증값은 인쇄물과 계산 URL에 포함하지 않습니다.</span></footer></div>`;
    for (const node of this.mount.querySelectorAll<HTMLDetailsElement>('details[id]')) {
      if (disclosureState.has(node.id)) node.open = disclosureState.get(node.id)!;
    }
    this.refreshCountdowns();
    this.bind();
    if (focusId) {
      const restored = this.mount.querySelector<HTMLElement>(`#${CSS.escape(focusId)}`);
      if (restored && !restored.matches(':disabled')) restored.focus({ preventScroll: true });
    }
  }

  private scheduleTable(rows: ScheduleRow[]): string {
    if (!rows.length) return '<div class="empty-state">납부 일정 데이터를 불러오지 못했습니다.</div>';
    const cell = (value: number) => value ? money(value) : '—';
    return `<div class="schedule-scroll"><table class="schedule-table"><thead><tr><th>회차</th><th>납부일 · D-day</th><th>주택</th><th>발코니</th><th>시스템<br>에어컨</th><th>기타 옵션</th><th>회차 합계</th></tr></thead><tbody>${rows.map((row) => { const total = row.supply + row.balcony + row.systemAc + row.other; const phase = row.label === '계약금' ? 'contract' : row.label === '잔금' ? 'balance' : 'interim'; return `<tr data-phase="${phase}"><th><strong>${escape(row.label)}</strong></th><td class="schedule-date"><span>${escape(row.due)}</span><span class="schedule-countdown" data-payment-due="${escape(row.dueKey)}"></span></td><td>${cell(row.supply)}</td><td>${cell(row.balcony)}</td><td>${cell(row.systemAc)}</td><td>${cell(row.other)}</td><td class="total">${money(total)}</td></tr>`; }).join('')}</tbody></table></div><p class="deadline-note">계약 기간은 <b>주택 계약 기준</b>입니다. 발코니·추가선택품목의 계약 일정은 별도 안내를 확인하세요. 입주는 <b>2029년 2월 예정</b>이며 확정일이 아닙니다. 경과 표시는 납부 완료를 뜻하지 않습니다.</p>`;
  }

  private refreshCountdowns(): void {
    const block = this.mount.querySelector('#calculator-payments');
    if (!block) return;
    const now = new Date();
    const today = seoulDateKey(now);
    for (const node of block.querySelectorAll<HTMLElement>('[data-payment-due]')) {
      const deadline = paymentDeadlineForDue(node.dataset.paymentDue!);
      const countdown = countdownForDeadline(deadline, now);
      node.dataset.state = countdown.state;
      node.innerHTML = `<b>${escape(countdown.text)}</b><small>${escape(countdown.detail)}</small>`;
    }
    // Only official dated housing payments qualify as the next confirmed event.
    // An unknown option date or a planning assumption must never become a deadline.
    const upcoming = this.scheduleRows.find(row => {
      const deadline = paymentDeadlineForDue(row.dueKey);
      return (deadline.precision === 'date' || deadline.precision === 'range')
        && deadline.endDate !== undefined && deadline.endDate >= today;
    });
    let summary = block.querySelector<HTMLElement>('#calculator-deadline-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.id = 'calculator-deadline-summary';
      summary.className = 'deadline-summary';
      block.querySelector('.subhead')?.after(summary);
    }
    const next = upcoming ? countdownForDeadline(paymentDeadlineForDue(upcoming.dueKey), now) : null;
    summary.innerHTML = `<div><span>다가오는 주택 납부 일정</span><strong>${upcoming ? escape(upcoming.label) : '확정된 다음 납부일 없음'}</strong><small>${upcoming ? escape(upcoming.due) : '입주·기타 옵션은 별도 확정 안내를 확인하세요.'}</small></div>${next ? `<b class="deadline-next" data-state="${next.state}">${escape(next.text)}</b>` : ''}<p id="calculator-deadline-today">D-day 기준 <time datetime="${today}">${today.replaceAll('-', '.')}</time> · 한국시간(KST)<small>입주 예정월은 2월 1일 기준 참고값 · 실제 잔금일 미정</small></p>`;
  }

  private readonly scheduleCountdownRefresh = (): void => {
    window.clearTimeout(this.countdownTimer);
    if (document.hidden || !this.scheduleRows.length) return;
    this.refreshCountdowns();
    // Refresh at Seoul midnight, regardless of the viewer's browser time zone.
    // Only date labels are replaced, preserving open folds and in-progress inputs.
    const dayMs = 86_400_000;
    const untilMidnight = dayMs - ((Date.now() + 9 * 3_600_000) % dayMs);
    this.countdownTimer = window.setTimeout(this.scheduleCountdownRefresh, untilMidnight + 50);
  };

  private optionMarkup(quote: Quote): string {
    if (this.minus) return `<section class="option-group option-minus" data-option-tier="discount-metadata-only"><h3>마이너스 옵션</h3><dl><div><dt>공급가 감액</dt><dd>−${money(quote.minusSupply)}</dd></div><div><dt>발코니 감액</dt><dd>−${money(quote.minusBalcony)}</dd></div><div class="subtotal"><dt>총 감액</dt><dd>−${money(quote.minusDiscount)}</dd></div></dl><p>마이너스 옵션은 할인 전용 항목이며 일반 유상옵션은 계약 합계에 넣지 않습니다.</p></section>`;
    if (!quote.optionLines.length) return '<div class="empty-state">선택한 유상옵션이 없습니다.</div>';
    const groups = new Map<string, SaleCalculatorOptionLineV1[]>();
    quote.optionLines.forEach((line) => groups.set(line.category, [...(groups.get(line.category) ?? []), line]));
    return [...groups].map(([category, lines]) => {
      const subtotal = lines.reduce((sum, line) => sum + line.priceWon, 0);
      return `<section class="option-group"><h3>${escape(category)}</h3><ul class="option-list">${lines.map((line) => `<li data-option-tier="${line.tier}"><span><b>${escape(line.priceVariantLabel ? `${line.label} · ${line.priceVariantLabel}` : line.label)}</b><small>${line.tier === 'option-ii' ? '시스템에어컨' : '기타 옵션'}</small></span><strong>${money(line.priceWon)}</strong></li>`).join('')}</ul><div class="option-subtotal"><span>${escape(category)} 소계</span><b>${money(subtotal)}</b></div></section>`;
    }).join('');
  }

  private taxDetails(quote: Quote): string {
    const choices: readonly [TaxReliefMode, string, number][] = [['none', '감면 없음', 0], ['first-home', '생애최초', 2_000_000], ['birth-care', '출산·양육', 5_000_000]];
    const result = quote.tax ? `<dl><dt>과세 추정 기준</dt><dd>${money(quote.tax.taxable)}</dd><dt>적용 취득세율</dt><dd>${quote.tax.ratePercent}%</dd><dt>선택 감면 반영</dt><dd>−${money(quote.tax.relief)}</dd><dt>취득세</dt><dd>${money(quote.tax.acquisition)}</dd><dt>지방교육세</dt><dd>${money(quote.tax.education)}</dd><dt>농어촌특별세</dt><dd>${money(quote.tax.rural)}</dd><dt class="calculation-total-label">합계</dt><dd class="calculation-total">${money(quote.tax.total)}</dd></dl>` : '<p class="muted-copy">활성화 시 계약 예상 총액 기준으로 계산합니다.</p>';
    return `<details id="calculator-tax-details" class="calculator-card disclosure" ${this.taxEnabled ? 'open' : ''}><summary>취득세 추정 <span>펼치기</span></summary><div class="disclosure-body"><label class="enable-row"><input id="calculator-tax-enabled" type="checkbox" ${this.taxEnabled ? 'checked' : ''}> 취득세 추정 활성화</label><fieldset class="relief-options" ${this.taxEnabled ? '' : 'disabled'}><legend>감면 시나리오</legend>${choices.map(([value, label, amount]) => `<label><input name="tax-relief-mode" type="radio" value="${value}" ${this.taxReliefMode === value ? 'checked' : ''}><span><b>${label}</b><small>${amount ? `최대 ${money(amount)}` : '기본 계산'}</small></span></label>`).join('')}</fieldset>${result}<p class="legal-copy">생애최초는 이 아파트 기준 최대 200만원 시나리오이며 현행 취득 기한은 2028-12-31입니다. 2029년 예정 취득에는 현행법상 자동 적용되지 않습니다. 출산·양육은 <b>2028-12-31까지 출산</b>하고 출산 후 5년 이내(취득 후 1년 이내 출산 포함), 12억원 이하·1가구1주택 등 요건을 충족하면 최대 500만원입니다. 출산 기준일과 취득 기한은 다릅니다. 두 감면은 합산하지 않으며 이 선택은 자격 판정이 아닌 가정입니다. 지방교육세는 감면 전 취득세 기준의 보수적 추정으로, 감면에 연동된 교육세 감면을 제외하여 실제보다 클 수 있습니다. 거주 개시·유지 등 추징 요건은 지자체 확인이 필요하며 등기·법무·대출 부대비용은 별도입니다. <a href="https://www.law.go.kr/법령/지방세특례제한법/제36조의3" target="_blank" rel="noreferrer">생애최초 조문 ↗</a> · <a href="https://www.law.go.kr/법령/지방세특례제한법/제36조의5" target="_blank" rel="noreferrer">출산·양육 조문 ↗</a></p></div></details>`;
  }

  private interimLoanDetails(quote: Quote): string {
    const details = quote.interimLoan;
    const interimRows = quote.schedule.filter((row) => row.label.includes('중도금'));
    const selfFunded = interimRows.reduce((total, row) => total + row.balcony + row.systemAc + row.other, 0);
    const balconyInterim = interimRows.reduce((total, row) => total + row.balcony, 0);
    const systemAcInterim = interimRows.reduce((total, row) => total + row.systemAc, 0);
    const otherInterim = interimRows.reduce((total, row) => total + row.other, 0);
    const result = this.interimFunding === 'loan' && this.interimLoanEnabled ? `<dl><dt>은행 집단대출 원금</dt><dd>${money(details.totalPrincipalWon)}</dd><dt class="calculation-total-label">입주 시 납부 예상 이자</dt><dd class="calculation-total">${money(details.totalInterestWon)}</dd><dt>발코니 중도금 · 자납</dt><dd>${money(balconyInterim)}</dd><dt>시스템에어컨 중도금 · 자납</dt><dd>${money(systemAcInterim)}</dd><dt>기타 옵션 중도금 · 자납</dt><dd>${money(otherInterim)}</dd><dt>계산상 입주 기준일</dt><dd>${details.assumedMoveInDate}</dd></dl><ul class="tranche-list">${details.tranches.map((tranche, index) => `<li><span>${this.plan === 'main-subscription' ? `${index + 1}차 · ` : ''}${tranche.executionDate}<small>${tranche.days}일 후불</small></span><b>${money(tranche.principalWon)}<small>이자 ${money(tranche.interestWon)}</small></b></li>`).join('')}</ul>` : '<p class="muted-copy">활성화하면 주택 공급대금 중도금 20%에 대한 이자후불 예상액을 계산합니다.</p>';
    return `<details id="calculator-interim-loan-details" class="calculator-card disclosure" ${this.interimLoanEnabled ? 'open' : ''}><summary>중도금 대출 이자 추정 <span>펼치기</span></summary><div class="disclosure-body"><div class="loan-scope"><span><small>집단대출 추정 대상</small><b>주택 공급대금 중도금 20%</b></span><span><small>별도 현금납부 예상</small><b>${money(selfFunded)}</b></span></div><label class="enable-row"><input id="calculator-interim-loan-enabled" type="checkbox" ${this.interimLoanEnabled ? 'checked' : ''}> 이자후불제 추정 활성화</label><label class="date-field">입주 정산 기준일 · 계획값<input id="calculator-move-in-date" type="date" min="2028-02-15" max="2099-12-31" value="${this.assumedMoveInDate}"></label><div class="rate-stepper" aria-label="예상 연 금리"><span>예상 연 금리</span><div><button id="calculator-interim-rate-down" type="button" ${this.interimLoanEnabled ? '' : 'disabled'} aria-label="금리 0.5%포인트 낮추기">−</button><strong>${this.interimRatePercent.toFixed(1)}%</strong><button id="calculator-interim-rate-up" type="button" ${this.interimLoanEnabled ? '' : 'disabled'} aria-label="금리 0.5%포인트 높이기">＋</button></div></div>${result}<p class="legal-copy">공고문은 중도금 융자알선을 <b>전체 공급대금의 20% 범위</b>로 명시합니다. 발코니·시스템에어컨·기타 옵션에는 계약상 중도금 회차가 있지만 별도 계약·계좌이며, 은행 집단대출 포함 근거가 없어 자납으로 분리했습니다. 단지 금융기관·금리는 미정이며 4.0%는 현재 금리를 뜻하지 않는 계획값입니다. 기준일 기본값은 2029-02-01이며 입주지정기간 최초일·은행 실제 실행일이 확정되면 다시 확인하세요. 실제 이자는 윤년·실행일·일수 산정에 따라 달라질 수 있습니다. 자납을 선택하면 원금 상환과 후불이자는 입주 정산에서 제외됩니다.</p></div></details>`;
  }

  private mortgageDetails(quote: Quote): string {
    const result = quote.mortgage;
    return `<details id="calculator-mortgage-details" class="calculator-card disclosure" ${this.mortgageEnabled ? 'open' : ''}><summary>신혼희망타운 전용 모기지 추정 <span>열기</span></summary><div class="disclosure-body">
      <label class="enable-row"><input id="calculator-mortgage-enabled" type="checkbox" ${this.mortgageEnabled ? 'checked' : ''}> 대출 추정 활성화</label>
      <div class="mini-controls mortgage-controls">
        <label>선택 LTV<select id="calculator-ltv" ${this.mortgageEnabled ? '' : 'disabled'}>${[30,40,50,60,70].map(value => `<option ${value === this.ltv ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <label>상환 만기<select id="calculator-term" ${this.mortgageEnabled ? '' : 'disabled'}><option value="20" ${this.term === 20 ? 'selected' : ''}>20년</option><option value="30" ${this.term === 30 ? 'selected' : ''}>30년</option></select></label>
        <label>자녀 수<select id="calculator-children" ${this.mortgageEnabled ? '' : 'disabled'}><option value="0" ${this.childCount === 0 ? 'selected' : ''}>0명</option><option value="1" ${this.childCount === 1 ? 'selected' : ''}>1명</option><option value="2" ${this.childCount === 2 ? 'selected' : ''}>2명 이상</option></select></label>
        <label>정산 시 대출 유지기간<select id="calculator-settlement-period" ${this.mortgageEnabled ? '' : 'disabled'}>${Array.from({ length: this.term - 2 }, (_, i) => i + 3).map(year => `<option value="${year}" ${year === this.holdingYears ? 'selected' : ''}>${year}년</option>`).join('')}</select></label>
      </div>
      ${result ? `<dl><dt>대출 기준액 · 공급가+발코니</dt><dd>${money(result.loanBase)}</dd><dt>선택 LTV / 정산용 실효 LTV</dt><dd>${result.ltvPercent}% / ${result.settlement.effectiveLtvPercent}%</dd><dt>공고문 기준 연 이율</dt><dd>${result.annualRatePercent}% 고정</dd><dt>대출 가능 상한</dt><dd>${money(result.eligibleMaximum)}</dd><dt>대출 원금</dt><dd>${money(result.principal)}</dd><dt>입주 시 필요 현금 · 정산표 기준</dt><dd>${money(result.moveInCash)}</dd><dt>1년 거치 월 이자</dt><dd>${money(result.graceInterest)}</dd><dt>거치 후 ${result.repaymentMonths / 12}년 월 원리금</dt><dd>${money(result.repayment)}</dd><dt>향후 매각차익 기금 정산비율</dt><dd>${result.settlement.fundSharePercent}%</dd></dl>` : '<p class="muted-copy">활성화 시 단지 공고 기준 연 1.3%, 1년 거치 후 원리금균등상환을 추정합니다.</p>'}
      <p class="legal-copy">기준액은 <b>감액 후 공급가 + 발코니 확장비</b>이며 시스템에어컨·기타 옵션·세금은 제외합니다. 선택 LTV와 4억원 한도 중 작은 금액입니다. 4억원 상한 적용 시 실제 LTV를 절사한 뒤 공식 표를 보간합니다. 자녀 수는 계약 이후 가족관계등록부에 등재되거나 등재됐던 만19세 이하 자녀로 출산·입양·사망 포함, 파양 제외입니다. 일반 상품 금리는 1.6%지만 이 단지는 공고의 1.3% 예외를 기준으로 하며 실행 시 기금 조건·심사가 우선합니다. <a href="${MORTGAGE_SOURCE}" target="_blank" rel="noreferrer">KB 공식 상품 ↗</a> · <a href="https://housing.gg.go.kr/html/51501.do?headerFilter=2026" target="_blank" rel="noreferrer">금리 예외 안내 ↗</a></p>
    </div></details>`;
  }

  private moveInMarkup(quote: Quote): string {
    const value = quote.moveIn;
    const missing = [this.interimFunding === 'loan' && !this.interimLoanEnabled ? '후불이자' : '', !this.taxEnabled ? '취득 관련 세금' : '', !this.costsEnabled ? '입주 부대비용' : ''].filter(Boolean);
    return `<section id="calculator-move-in-settlement" class="move-in-block" aria-labelledby="move-in-heading">
      <div class="subhead"><h3 id="move-in-heading">입주 시 자금 정산</h3><span class="assumption-chip">현재 선택한 가정 기준</span></div>
      <p>계약 총액과 입주 때 준비할 현금은 다릅니다. 중도금 대출은 입주 시 정리할 채무이며, 잔금 모기지에서 한 번만 차감합니다.</p>
      <fieldset class="funding-switch"><legend>주택 중도금 20% 납부 방식</legend><label><input id="calculator-funding-loan" name="interim-funding" value="loan" type="radio" ${this.interimFunding === 'loan' ? 'checked' : ''}> 집단대출 가정</label><label><input id="calculator-funding-cash" name="interim-funding" value="cash" type="radio" ${this.interimFunding === 'cash' ? 'checked' : ''}> 전액 자납 가정</label></fieldset>
      <dl class="settlement-table"><div><dt>잔금 · 주택·발코니·옵션</dt><dd>${money(value.balancePaymentsWon)}</dd></div>
        <div><dt>＋ 중도금 대출 원금 상환</dt><dd id="calculator-interim-repayment">${money(value.interimLoanRepaymentWon)}</dd></div>
        <div><dt>＋ 후불이자 ${this.interimFunding === 'loan' && this.interimLoanEnabled ? '' : '· 미반영'}</dt><dd>${money(value.deferredInterestWon)}</dd></div>
        <div><dt>＋ 선택한 취득 관련 세금</dt><dd>${this.taxEnabled ? money(value.acquisitionTaxWon) : '미반영'}</dd></div>
        <div><dt>＋ 미납 입주 부대비용</dt><dd>${this.costsEnabled ? money(value.additionalCostsWon) : '미반영'}</dd></div>
        <div><dt>− 잔금 모기지 충당</dt><dd>${this.mortgageEnabled ? money(value.mortgageAppliedWon) : '미적용'}</dd></div>
        <div class="settlement-total"><dt>입주 시 필요 현금</dt><dd id="calculator-required-cash">${money(value.requiredCashAtMoveInWon)}</dd></div></dl>
      ${missing.length ? `<p class="scenario-warning" role="note">${missing.join('·')} 미반영: 위 금액은 실제 입주 비용 전부를 확정한 값이 아닙니다. 우측 항목을 펼쳐 반영하세요.</p>` : ''}
      ${this.costsEnabled && COST_ITEMS.every(([id]) => this.costs[id] === 0) ? '<p class="scenario-warning">부대비용 예상액이 아직 0원입니다. 무료로 확정된 것이 아니므로 실제 견적을 확인하세요.</p>' : ''}
      ${value.mortgageExcessWon ? `<p class="scenario-warning">계산상 모기지 초과액 ${money(value.mortgageExcessWon)}은 현금 수령·추가대출로 간주하지 않습니다.</p>` : ''}
      <div class="funding-metrics"><div><span>입주 전 계약금·자납 중도금</span><b id="calculator-upfront-cash">${money(value.selfFundedBeforeMoveInWon)}</b></div><div><span>계약·선택한 비용 포함 예산</span><b>${money(value.totalAcquisitionBudgetWon)}</b></div><div><span>계약부터 입주까지 자기자금</span><b>${money(value.totalOwnCashWon)}</b></div></div>
      <p class="legal-copy">기타 옵션 중도금은 별도 안내일에 입주 전 자납하는 것으로 분리했습니다. 이미 납부한 부대비용과 모기지 만기까지의 이자·향후 세금은 이 입주 예산에 넣지 않습니다. 이 시뮬레이션 입력은 저장하거나 전송하지 않습니다.</p>
    </section>`;
  }

  private paymentGuideMarkup(): string {
    return `<details id="calculator-payment-guide" class="payment-explainer"><summary>납부·대출·입주 순서와 확인할 정보</summary><ol><li><b>계약부터 입주 전</b>: 계약금과 발코니·Ⅱ·Ⅲ 중도금은 자금 준비가 필요합니다. Ⅲ 중도금 납부일은 별도 통지입니다.</li><li><b>입주 정산</b>: 잔금과 기존 집단대출 원금·대납이자를 정리합니다. 전용 모기지는 승인·실행된 금액만 한 번 충당합니다.</li><li><b>입주 이후</b>: 거치기간 이자와 이후 월 원리금이 발생합니다. 매각·전액 상환·만기에는 별도의 수익공유 정산이 있습니다.</li></ol><p><span class="assumption-chip">공고 기준</span> 공급가·납부 비율 <span class="assumption-chip">미정</span> 단지 은행·실제 금리·입주지정일 <span class="assumption-chip">가정</span> 4.0%·정산 기준일·부대비용</p><p><a href="../guides/?guide=sale-finance">분퍼빌 입주·자금 계산 가이드</a> · <a href="https://joy-papa.github.io/ipju-e-bundang/manual.html" target="_blank" rel="noreferrer">참고 입주 가이드 ↗</a> · <a href="https://joy-papa.github.io/ipju-e-bundang/#home" target="_blank" rel="noreferrer">참고 내집·자금 ↗</a></p></details>`;
  }

  private costDetails(quote: Quote): string {
    return `<details id="calculator-cost-details" class="calculator-card disclosure" ${this.costsEnabled ? 'open' : ''}><summary>입주 부대비용 예산 <span>펼치기</span></summary><div class="disclosure-body">
      <label class="enable-row"><input id="calculator-costs-enabled" type="checkbox" ${this.costsEnabled ? 'checked' : ''}> 미납 부대비용 반영</label>
      <p>입주까지 추가 납부할 예상액만 입력합니다. 계약 시 이미 낸 금액을 다시 넣지 마세요.</p>
      <div class="cost-controls">${COST_ITEMS.map(([id, label, hint]) => `<label class="money-field" for="calculator-cost-${id}"><span>${label}</span><input id="calculator-cost-${id}" data-cost-id="${id}" type="number" min="0" max="10000000000" step="1" inputmode="numeric" value="${this.costs[id]}" ${this.costsEnabled ? '' : 'disabled'}><small>${hint}</small></label>`).join('')}</div>
      <dl><dt class="calculation-total-label">반영한 부대비용 합계</dt><dd id="calculator-extra-cost-total" class="calculation-total">${money(quote.moveIn.additionalCostsWon)}</dd></dl>
      ${this.costsEnabled ? `<dl class="cost-print-summary">${COST_ITEMS.map(([id,label]) => `<dt>${label}</dt><dd>${money(this.costs[id])}</dd>`).join('')}</dl>` : ''}
      <p class="legal-copy">채권은 분양가의 일정 비율로 단정하지 않습니다. 시가표준액·등기 유형·지분·지역·할인율에 따라 다르며 매입 원금과 할인손실을 구분하세요. 예치금은 일반 소비 지출과 다릅니다. <a href="https://nhuf.molit.go.kr/FP/FP07/FP0705/FP070509.jsp" target="_blank" rel="noreferrer">공식 채권 안내 ↗</a></p>
    </div></details>`;
  }

  private resaleDetails(quote: Quote): string {
    const value = this.salePriceWon === null ? undefined : quote.mortgage?.settlement;
    return `<details id="calculator-resale-details" class="calculator-card disclosure"><summary>향후 매각·수익공유 정산 <span>펼치기</span></summary><div class="disclosure-body">
      <p>우측 모기지의 자녀 수·대출 유지기간을 사용합니다. 매도가 예상액을 넣어 보는 시나리오이며 시세·세금·매각 승인을 예측하지 않습니다.</p>
      <label class="money-field" for="calculator-sale-price">예상 매도가 · 원<input id="calculator-sale-price" type="number" min="1" max="100000000000" step="1" inputmode="numeric" placeholder="예: 900000000" value="${this.salePriceWon ?? ''}" ${this.mortgageEnabled ? '' : 'disabled'}></label>
      ${value && quote.mortgage ? `<dl><dt>가정한 매도가</dt><dd>${money(this.salePriceWon!)}</dd><dt>대출 유지기간 / 자녀 수</dt><dd>${this.holdingYears}년 / ${this.childCount === 2 ? '2명 이상' : this.childCount + '명'}</dd><dt>취득 기준액 · 공급가+발코니</dt><dd>${money(quote.mortgage.loanBase)}</dd><dt>양(+)의 평가차익</dt><dd>${money(value.appreciationWon)}</dd><dt>기금 정산비율</dt><dd>${value.fundSharePercent}%</dd><dt>− 기금 수익공유 정산액</dt><dd>${money(value.fundSettlementWon)}</dd><dt>− 남은 대출 원금</dt><dd>${money(value.remainingPrincipalWon)}</dd><dt class="calculation-total-label">세금·매각비용 전 회수액</dt><dd id="calculator-resale-proceeds" class="calculation-total">${money(value.netSaleProceedsWon)}</dd></dl>` : '<p class="muted-copy">모기지 추정 활성화 후 예상 매도가를 입력하세요. 매도가를 임의로 채우지 않습니다.</p>'}
      <p class="legal-copy"><b>회수액은 순이익이 아닙니다.</b> 기존 자기자금·기납부 원리금·취득/양도세·중개/등기 비용 등을 빼지 않았습니다. 손실이면 기금 수익공유금은 0원이지만 손실을 기금이 보전하지 않습니다. 중도상환은 원칙적으로 실행 3년 경과 후 전액이며 부분상환은 불가합니다. 만기 이후로 정산을 미뤄 유리한 비율을 적용하지 않습니다. <b>실제 정산가격은 은행 감정·약정 검증으로 매도가와 달라질 수 있으며, 매각 없는 전액상환·만기는 감정가격을 사용합니다.</b> <a href="${MORTGAGE_CONTRACT}" target="_blank" rel="noreferrer">KB 추가약정·정산표 ↗</a></p>
    </div></details>`;
  }

  private bind(): void {
    this.mount.querySelectorAll<HTMLInputElement>('input[name="payment-plan"]').forEach((input) => input.addEventListener('change', () => { this.plan = input.value as BundangPaymentPlanKind; this.render(); }));
    this.mount.querySelector('#calculator-print')?.addEventListener('click', () => {
      this.preparePrint();
      window.print();
    });

    this.mount.querySelector('#calculator-return-options')?.addEventListener('click', () => window.location.assign(this.context!.returnUrl!));
    this.mount.querySelector<HTMLInputElement>('#calculator-tax-enabled')?.addEventListener('change', (event) => { this.taxEnabled = (event.target as HTMLInputElement).checked; this.render(); });
    this.mount.querySelectorAll<HTMLInputElement>('input[name="tax-relief-mode"]').forEach((input) => input.addEventListener('change', () => { this.taxReliefMode = input.value as TaxReliefMode; this.render(); }));
    this.mount.querySelectorAll<HTMLInputElement>('input[name="interim-funding"]').forEach(input => input.addEventListener('change', () => { this.interimFunding = input.value as 'cash' | 'loan'; this.render(); }));
    this.mount.querySelector<HTMLInputElement>('#calculator-move-in-date')?.addEventListener('change', event => {
      const input = event.target as HTMLInputElement;
      if (!input.value || !input.reportValidity()) { input.value = this.assumedMoveInDate; return; }
      this.assumedMoveInDate = input.value; this.render();
    });
    this.mount.querySelector<HTMLInputElement>('#calculator-costs-enabled')?.addEventListener('change', event => { this.costsEnabled = (event.target as HTMLInputElement).checked; this.render(); });
    this.mount.querySelectorAll<HTMLInputElement>('input[data-cost-id]').forEach(input => input.addEventListener('change', () => {
      const id = input.dataset.costId as CostId;
      const value = input.value === '' ? 0 : input.valueAsNumber;
      if (!input.reportValidity() || !Number.isFinite(value)) { input.value = String(this.costs[id]); return; }
      this.costs[id] = value; this.render();
    }));
    this.mount.querySelector<HTMLInputElement>('#calculator-sale-price')?.addEventListener('change', event => {
      const input = event.target as HTMLInputElement;
      if (input.value && (!input.reportValidity() || !Number.isFinite(input.valueAsNumber))) { input.value = String(this.salePriceWon ?? ''); return; }
      this.salePriceWon = input.value ? input.valueAsNumber : null; this.render();
    });
    this.mount.querySelector<HTMLInputElement>('#calculator-interim-loan-enabled')?.addEventListener('change', (event) => { this.interimLoanEnabled = (event.target as HTMLInputElement).checked; if (this.interimLoanEnabled) this.interimFunding = 'loan'; this.render(); });
    this.mount.querySelector('#calculator-interim-rate-down')?.addEventListener('click', () => { this.interimRatePercent = Math.max(0.5, this.interimRatePercent - 0.5); this.render(); });
    this.mount.querySelector('#calculator-interim-rate-up')?.addEventListener('click', () => { this.interimRatePercent = Math.min(15, this.interimRatePercent + 0.5); this.render(); });
    this.mount.querySelector<HTMLInputElement>('#calculator-mortgage-enabled')?.addEventListener('change', (event) => { this.mortgageEnabled = (event.target as HTMLInputElement).checked; this.render(); });
    this.mount.querySelector<HTMLSelectElement>('#calculator-ltv')?.addEventListener('change', (event) => { this.ltv = Number((event.target as HTMLSelectElement).value) as 30 | 40 | 50 | 60 | 70; this.render(); });
    this.mount.querySelector<HTMLSelectElement>('#calculator-term')?.addEventListener('change', (event) => { this.term = Number((event.target as HTMLSelectElement).value) as 20 | 30; this.holdingYears = Math.min(this.holdingYears, this.term); this.render(); });
    this.mount.querySelector<HTMLSelectElement>('#calculator-children')?.addEventListener('change', (event) => { this.childCount = Number((event.target as HTMLSelectElement).value) as BundangMortgageChildCount; this.render(); });
    this.mount.querySelector<HTMLSelectElement>('#calculator-settlement-period')?.addEventListener('change', (event) => { this.holdingYears = Number((event.target as HTMLSelectElement).value); this.render(); });
  }

  private preparePrint(): void {
    this.refreshCountdowns();
    if (this.restorePrintState) return;
    const ids = ['calculator-option-details', 'calculator-payment-guide'];
    if (this.taxEnabled) ids.push('calculator-tax-details');
    if (this.interimFunding === 'loan' && this.interimLoanEnabled) ids.push('calculator-interim-loan-details');
    if (this.mortgageEnabled) ids.push('calculator-mortgage-details');
    if (this.costsEnabled) ids.push('calculator-cost-details');
    if (this.mortgageEnabled && this.salePriceWon !== null) ids.push('calculator-resale-details');
    const nodes = ids.map(id => this.mount.querySelector<HTMLDetailsElement>(`#${id}`)).filter((node): node is HTMLDetailsElement => Boolean(node));
    const states = nodes.map(node => node.open);
    nodes.forEach(node => { node.open = true; });
    this.restorePrintState = () => nodes.forEach((node, index) => { node.open = states[index]; });
  }
}

const mount = document.querySelector<HTMLElement>('#calculatorApp');
if (!mount) throw new Error('Missing #calculatorApp mount');
void new CalculatorApp(mount).start();
