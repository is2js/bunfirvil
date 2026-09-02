import './style.css';
import { loadCatalog } from '../game/catalog';
import { readHouseholdVerificationSession } from '../game/household-verification';
import { BUNDANG_MINUS_OPTION_ID } from '../game/minus-option';
import { bundangMortgageFundSharePercent, calculateBundangSaleFinance, type BundangMortgageChildCount, type BundangMortgageSettlementPeriod, type BundangPaymentPlanKind, type BundangSaleFloorBand, type BundangSaleUnitType } from '../game/bundang-sale-finance';
import { clearSaleCalculatorContext, readSaleCalculatorLaunchContext, type SaleCalculatorContextV1 } from '../game/sale-calculator-context';
import { resolveSaleCalculatorOptionLines, type SaleCalculatorOptionLineV1 } from '../game/sale-calculator-options';

type ScheduleRow = { label: string; due: string; supply: number; balcony: number; systemAc: number; other: number };
type Quote = { baseSupply: number; baseBalcony: number; selectedOptions: number; minusSupply: number; minusBalcony: number; minusDiscount: number; contractTotal: number; schedule: ScheduleRow[]; optionLines: SaleCalculatorOptionLineV1[]; tax?: { taxable: number; ratePercent: number; relief: number; acquisition: number; education: number; rural: number; total: number }; mortgage?: { principal: number; eligibleMaximum: number; moveInCash: number; graceInterest: number; repayment: number; ltvPercent: number; annualRatePercent: number; repaymentMonths: number; fundSharePercent: number } };

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
    const row = merged.get(key) ?? { label: item.label, due: item.due, supply: 0, balcony: 0, systemAc: 0, other: 0 };
    if (schedule.target === 'supply') row.supply += item.amountWon;
    else if (schedule.target === 'balcony') row.balcony += item.amountWon;
    else if (schedule.target === 'option-ii') row.systemAc += item.amountWon;
    else row.other += item.amountWon;
    merged.set(key, row);
  }
  const dueOrder = new Map([['계약 시', 1], ['2027-04-12', 2], ['별도 안내', 3], ['2028-02-14', 4], ['입주 시', 5]]);
  const labelForDue = (due: string) => ({
    '계약 시': '계약금', '2027-04-12': '중도금 1차', '별도 안내': '기타 옵션 중도금',
    '2028-02-14': plan === 'pre-subscription' ? '중도금' : '중도금 2차', '입주 시': '잔금',
  }[due] ?? '납부 일정');
  return [...merged.values()]
    .map((row) => ({ ...row, label: labelForDue(row.due) }))
    .sort((left, right) => (dueOrder.get(left.due) ?? 99) - (dueOrder.get(right.due) ?? 99));
}

class CalculatorApp {
  private readonly context = readSaleCalculatorLaunchContext();
  private readonly verification = readHouseholdVerificationSession();
  private options: SaleCalculatorOptionLineV1[] = [];
  private plan: BundangPaymentPlanKind;
  private taxEnabled = false;
  private taxRelief = 0;
  private mortgageEnabled = false;
  private ltv: 30 | 40 | 50 | 60 | 70 = 70;
  private term: 20 | 30 = 30;
  private childCount: BundangMortgageChildCount = 0;
  private settlementPeriod: BundangMortgageSettlementPeriod = '24+';

  constructor(private readonly mount: HTMLElement) { this.plan = this.context?.applicantRoute ?? 'main-subscription'; }
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
  }

  private calculate(): Quote {
    const result = calculateBundangSaleFinance({
      household: { unitType: this.unitType, floorBand: this.floor }, paymentPlanKind: this.plan,
      includeBalconyExtension: true, selectMinusOption: this.minus, optionLines: this.options,
      acquisitionTax: { manualReliefWon: this.taxEnabled ? this.taxRelief : 0 },
      mortgage: this.mortgageEnabled ? { termYears: this.term, ltvBps: this.ltv * 100 } : undefined,
    });
    return {
      baseSupply: result.baseSupplyPriceWon, baseBalcony: result.baseBalconyExtensionWon,
      selectedOptions: result.optionIiSubtotalWon + result.optionIiiSubtotalWon,
      minusSupply: result.minusSupplyDiscountWon, minusBalcony: result.minusBalconyDiscountWon,
      minusDiscount: result.minusSupplyDiscountWon + result.minusBalconyDiscountWon,
      contractTotal: result.contractTotalWon, schedule: mergeSchedules(result.paymentSchedules, this.plan), optionLines: this.options,
      ...(this.taxEnabled ? { tax: {
        taxable: result.acquisitionTax.taxableAmountWon,
        ratePercent: result.acquisitionTax.acquisitionTaxRatePercent,
        relief: result.acquisitionTax.manualReliefWon,
        acquisition: result.acquisitionTax.acquisitionTaxWon,
        education: result.acquisitionTax.localEducationTaxWon,
        rural: result.acquisitionTax.ruralSpecialTaxWon,
        total: result.acquisitionTax.totalTaxWon,
      } } : {}),
      ...(this.mortgageEnabled && result.mortgage ? { mortgage: {
        principal: result.mortgage.principalWon,
        eligibleMaximum: result.mortgage.eligibleMaximumWon,
        moveInCash: result.moveInRequiredCashWon ?? result.contractTotalWon,
        graceInterest: result.mortgage.graceMonthlyInterestWon,
        repayment: result.mortgage.repaymentMonthlyPrincipalInterestWon,
        ltvPercent: result.mortgage.ltvBps / 100,
        annualRatePercent: result.mortgage.annualRateBps / 100,
        repaymentMonths: result.mortgage.repaymentMonths,
        fundSharePercent: bundangMortgageFundSharePercent(this.ltv, this.childCount, this.settlementPeriod),
      } } : {}),
    };
  }

  private renderRecovery(message = '이 계산기는 인증된 쇼케이스 선택과 계산기 실행 컨텍스트가 있어야 열립니다. 개인정보나 동·호 정보는 이 화면에 표시하지 않습니다.'): void {
    this.mount.innerHTML = `<main class="recovery-shell"><section class="recovery-card"><p class="eyebrow">SALE CALCULATOR / ACCESS REQUIRED</p><h1>계산 정보를 복구할 수 없습니다.</h1><p>${escape(message)}</p><a id="calculator-reselect-household" class="primary-link" href="../">세대 다시 선택</a><a class="muted-link" href="../guides/">공개 가이드 보기</a></section></main>`;
  }

  private render(): void {
    const quote = this.calculate();
    const planName = this.plan === 'main-subscription' ? '본청약 기준' : '사전청약 당첨자 기준';
    this.mount.innerHTML = `<div class="calculator-shell">
      <a class="skip-link" href="#calculator-main">계산기 본문으로 건너뛰기</a>
      <header class="topbar"><a class="brand" href="../" aria-label="Bunfirvil 쇼케이스로 돌아가기"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span><b>BUNFIRVIL</b><small>RPG RENDERING LAB</small></span></a><nav class="topnav" aria-label="주 메뉴"><a href="../">쇼케이스</a><a class="is-active" href="./">자금 계획</a><a href="../guides/">가이드</a><a href="../households/">동·호 현황</a></nav><div id="calculator-context-header" class="build-chip" data-payment-plan="${this.plan}"><i class="status-dot"></i><span><small>${this.unitType} · ${floorLabel(this.floor)} · 2026.09.02 검토</small><b>${planName}</b></span></div></header>
      <div class="serverless-banner"><span class="banner-pulse"></span><b>브라우저 계산 도구</b><i></i><span>계산 결과는 참고용이며 공식 공고·계약서가 우선합니다.</span></div>
      <main id="calculator-main" class="calculator-main">
        <section class="calculator-hero"><div><p class="eyebrow">BUNFIRVIL / SALE FINANCE</p><h1>내 자금 계획</h1><p><b>${this.unitType} · ${floorLabel(this.floor)} · ${planName}</b> 쇼케이스 선택을 기준으로 계산합니다. 세대 정보는 이 화면에 남기지 않습니다.</p><p class="source-stamp">기준: 입주자모집공고 2026.05.29 · 계산 검토 2026.09.02</p></div><aside class="restore-card"><span>선택 옵션 상태</span><strong>${(this.context!.optionIds ?? []).length}개 불러옴</strong><p>평형·층은 인증된 선택값으로 고정됩니다.</p><button id="calculator-return-options" data-action="return-to-showcase" type="button">옵션 다시 선택</button></aside></section>
        <section class="calculator-card controls-card"><div class="section-head"><div><p class="eyebrow">01 / PLAN</p><h2>청약 구분</h2></div><span class="data-note">본청약과 사전청약의 일정·납부 조건을 혼용하지 않습니다.</span></div><fieldset class="plan-switch" aria-label="청약 구분"><label><input id="calculator-plan-pre" name="payment-plan" value="pre-subscription" type="radio" ${this.plan === 'pre-subscription' ? 'checked' : ''}><span>사전청약 당첨자</span></label><label><input id="calculator-plan-main" name="payment-plan" value="main-subscription" type="radio" ${this.plan === 'main-subscription' ? 'checked' : ''}><span>본청약(신규신청자)</span></label></fieldset><p class="mode-notice ${this.plan === 'pre-subscription' ? 'is-pre' : ''}"><b>${planName}</b> · 납부 일정과 회차는 표시된 공고 기준을 확인하세요.</p></section>
        <section class="quote-layout"><article class="calculator-card result-card"><div class="section-head result-head"><div><p class="eyebrow">02 / CONTRACT</p><h2>최종 계약 예상 총액</h2></div><button id="calculator-print" data-action="print" class="print-button" type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-3M7 13h10v8H7z" /></svg><span>인쇄 · PDF 저장</span></button></div><div class="hero-total"><span>공급가 + 발코니 + 선택 옵션 − 마이너스 감액</span><strong>${money(quote.contractTotal)}</strong><p>세금·대출은 아래 항목을 활성화할 때만 별도로 계산합니다.</p></div><dl class="contract-breakdown"><div><dt>조정 전 공급가</dt><dd>${money(quote.baseSupply)}</dd></div><div><dt>발코니 확장</dt><dd>${money(quote.baseBalcony)}</dd></div><div><dt>선택 옵션 합계</dt><dd>${money(quote.selectedOptions)}</dd></div><div class="discount"><dt>마이너스 감액</dt><dd>−${money(quote.minusDiscount)}</dd></div></dl><p class="fund-note">공고표의 주택도시기금 55,000,000원은 실제 수령액으로 차감하지 않았습니다.</p><div class="payment-block"><div class="subhead"><h3>납부 일정</h3><span>동일 회차·일자 기준 합산</span></div>${this.scheduleTable(quote.schedule)}</div></article><aside class="calculator-side"><article class="calculator-card option-card"><div class="section-head compact"><div><p class="eyebrow">SELECTED OPTIONS</p><h2>선택 옵션</h2></div><span>${this.minus ? 1 : quote.optionLines.length}개</span></div>${this.optionMarkup(quote)}</article>${this.taxDetails(quote)}${this.mortgageDetails(quote)}<article class="calculator-card source-card"><p class="eyebrow">NOTICE</p><h2>계산 전 확인</h2><p>금액·일정·감면·대출 실행은 공고문, 계약서, 관계기관 심사 결과가 우선합니다.</p><a href="../guides/" class="text-link">옵션·저장 가이드 보기 →</a></article></aside></section>
      </main><footer class="calculator-footer"><span>BUNFIRVIL · STATIC FRONTEND</span><span>개인정보·인증값은 인쇄물과 계산 URL에 포함하지 않습니다.</span></footer></div>`;
    this.bind();
  }

  private scheduleTable(rows: ScheduleRow[]): string {
    if (!rows.length) return '<div class="empty-state">납부 일정 데이터를 불러오지 못했습니다.</div>';
    const cell = (value: number) => value ? money(value) : '—';
    return `<div class="schedule-scroll"><table class="schedule-table"><thead><tr><th>회차 · 납부일</th><th>주택</th><th>발코니</th><th>시스템<br>에어컨</th><th>기타 옵션</th><th>회차 합계</th></tr></thead><tbody>${rows.map((row) => { const total = row.supply + row.balcony + row.systemAc + row.other; return `<tr><th>${escape(row.label)}<small>${escape(row.due)}</small></th><td>${cell(row.supply)}</td><td>${cell(row.balcony)}</td><td>${cell(row.systemAc)}</td><td>${cell(row.other)}</td><td class="total">${money(total)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }

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
    return `<details id="calculator-tax-details" class="calculator-card disclosure" ${this.taxEnabled ? 'open' : ''}><summary>취득세 추정 <span>열기</span></summary><div class="disclosure-body"><label class="enable-row"><input id="calculator-tax-enabled" type="checkbox" ${this.taxEnabled ? 'checked' : ''}> 취득세 추정 활성화</label><label class="number-field">수동 감면액<input id="calculator-tax-relief" type="number" min="0" step="10000" value="${this.taxRelief}" ${this.taxEnabled ? '' : 'disabled'}></label>${quote.tax ? `<dl><dt>과세 추정 기준</dt><dd>${money(quote.tax.taxable)}</dd><dt>적용 취득세율</dt><dd>${quote.tax.ratePercent}%</dd><dt>수동 감면 반영</dt><dd>−${money(quote.tax.relief)}</dd><dt>취득세</dt><dd>${money(quote.tax.acquisition)}</dd><dt>지방교육세</dt><dd>${money(quote.tax.education)}</dd><dt>농어촌특별세</dt><dd>${money(quote.tax.rural)}</dd><dt>합계</dt><dd>${money(quote.tax.total)}</dd></dl>` : '<p class="muted-copy">활성화 시 계약 예상 총액 기준으로 계산합니다.</p>'}<p class="legal-copy">수동 감면액은 취득세에서만 차감합니다. 2028-12-31 일몰 감면은 2029년에 자동 적용하지 않습니다. 전용 85㎡ 이하 기준 농어촌특별세는 0원이며 등기비용·인지세·법무비·대출 부대비용은 제외됩니다. <a href="https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&amp;lsId=001649&amp;lsJoLnkSeq=1000889820&amp;print=print" target="_blank" rel="noreferrer">지방세법 제11조 ↗</a> · <a href="https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&amp;lsJoLnkSeq=1029506947" target="_blank" rel="noreferrer">지방세특례제한법 제36조의3 ↗</a></p></div></details>`;
  }

  private mortgageDetails(quote: Quote): string {
    return `<details id="calculator-mortgage-details" class="calculator-card disclosure" ${this.mortgageEnabled ? 'open' : ''}><summary>신혼희망타운 전용 모기지 추정 <span>열기</span></summary><div class="disclosure-body"><label class="enable-row"><input id="calculator-mortgage-enabled" type="checkbox" ${this.mortgageEnabled ? 'checked' : ''}> 대출 추정 활성화</label><div class="mini-controls mortgage-controls"><label>LTV<select id="calculator-ltv" ${this.mortgageEnabled ? '' : 'disabled'}>${[30,40,50,60,70].map((value) => `<option ${value === this.ltv ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>기간<select id="calculator-term" ${this.mortgageEnabled ? '' : 'disabled'}><option value="20" ${this.term === 20 ? 'selected' : ''}>20년</option><option value="30" ${this.term === 30 ? 'selected' : ''}>30년</option></select></label><label>자녀 수<select id="calculator-children" ${this.mortgageEnabled ? '' : 'disabled'}><option value="0" ${this.childCount === 0 ? 'selected' : ''}>0명</option><option value="1" ${this.childCount === 1 ? 'selected' : ''}>1명</option><option value="2" ${this.childCount === 2 ? 'selected' : ''}>2명 이상</option></select></label><label>예상 정산시점<select id="calculator-settlement-period" ${this.mortgageEnabled ? '' : 'disabled'}><option value="1-9" ${this.settlementPeriod === '1-9' ? 'selected' : ''}>1~9년</option><option value="14" ${this.settlementPeriod === '14' ? 'selected' : ''}>14년</option><option value="19" ${this.settlementPeriod === '19' ? 'selected' : ''}>19년</option><option value="24+" ${this.settlementPeriod === '24+' ? 'selected' : ''}>24년 이상</option></select></label></div>${quote.mortgage ? `<dl><dt>적용 LTV</dt><dd>${quote.mortgage.ltvPercent}%</dd><dt>공고문 기준 연 이율</dt><dd>${quote.mortgage.annualRatePercent}% 고정</dd><dt>대출 가능 상한</dt><dd>${money(quote.mortgage.eligibleMaximum)}</dd><dt>대출 원금</dt><dd>${money(quote.mortgage.principal)}</dd><dt>입주 시 잔금 자기자금</dt><dd>${money(quote.mortgage.moveInCash)}</dd><dt>1년 거치 월 이자</dt><dd>${money(quote.mortgage.graceInterest)}</dd><dt>거치 후 ${quote.mortgage.repaymentMonths / 12}년 월 원리금</dt><dd>${money(quote.mortgage.repayment)}</dd><dt>향후 매각차익 기금 정산비율</dt><dd>${quote.mortgage.fundSharePercent}%</dd></dl>` : '<p class="muted-copy">활성화 시 공고문 기준 LTV 30~70%, 연 1.3%, 1년 거치 조건으로 추정합니다.</p>'}<p class="legal-copy">자녀 수와 예상 정산시점은 향후 매각차익의 기금 정산비율에만 반영되며 대출원금·월 상환액을 바꾸지 않습니다. 매각차익 금액은 계산하지 않습니다. 대출액은 조정 공급가×LTV와 400,000,000원 중 작은 금액이며, 발코니·옵션·세금은 대출 기준에서 제외됩니다. 공고문 이후 실행 시점 기금운용계획과 실제 심사 결과가 우선합니다. <a href="https://lh.or.kr/menu.es?mid=a10402010200" target="_blank" rel="noreferrer">LH 안내 ↗</a></p></div></details>`;
  }

  private bind(): void {
    this.mount.querySelectorAll<HTMLInputElement>('input[name="payment-plan"]').forEach((input) => input.addEventListener('change', () => { this.plan = input.value as BundangPaymentPlanKind; this.render(); }));
    this.mount.querySelector('#calculator-print')?.addEventListener('click', () => window.print());
    this.mount.querySelector('#calculator-return-options')?.addEventListener('click', () => window.location.assign(this.context!.returnUrl!));
    this.mount.querySelector<HTMLInputElement>('#calculator-tax-enabled')?.addEventListener('change', (event) => { this.taxEnabled = (event.target as HTMLInputElement).checked; this.render(); });
    this.mount.querySelector<HTMLInputElement>('#calculator-tax-relief')?.addEventListener('change', (event) => { this.taxRelief = Math.max(0, Number((event.target as HTMLInputElement).value) || 0); this.render(); });
    this.mount.querySelector<HTMLInputElement>('#calculator-mortgage-enabled')?.addEventListener('change', (event) => { this.mortgageEnabled = (event.target as HTMLInputElement).checked; this.render(); });
    this.mount.querySelector<HTMLSelectElement>('#calculator-ltv')?.addEventListener('change', (event) => { this.ltv = Number((event.target as HTMLSelectElement).value) as 30 | 40 | 50 | 60 | 70; this.render(); });
    this.mount.querySelector<HTMLSelectElement>('#calculator-term')?.addEventListener('change', (event) => { this.term = Number((event.target as HTMLSelectElement).value) as 20 | 30; this.render(); });
    this.mount.querySelector<HTMLSelectElement>('#calculator-children')?.addEventListener('change', (event) => { this.childCount = Number((event.target as HTMLSelectElement).value) as BundangMortgageChildCount; this.render(); });
    this.mount.querySelector<HTMLSelectElement>('#calculator-settlement-period')?.addEventListener('change', (event) => { this.settlementPeriod = (event.target as HTMLSelectElement).value as BundangMortgageSettlementPeriod; this.render(); });
  }
}

const mount = document.querySelector<HTMLElement>('#calculatorApp');
if (!mount) throw new Error('Missing #calculatorApp mount');
void new CalculatorApp(mount).start();
