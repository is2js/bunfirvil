import { expect, test, type Page } from '@playwright/test';

const CALCULATOR_CONTEXT_KEY = 'bunfirvil:sale-calculator:v1';
const VERIFICATION_KEY = 'bunfirvil:household-verification:v1';
const RETURN_URL = '/bunfirvil/?map=bundang-first-village-55a-prototype&actor=200&variant=A';

type CalculatorContext = {
  schemaVersion: 1;
  unitType: '55A';
  priceFloorBand: '5+';
  applicantRoute: 'pre-subscription' | 'main-subscription';
  optionIds: string[];
  returnUrl: string;
};

async function seedCalculatorSession(page: Page, context: CalculatorContext): Promise<void> {
  await page.addInitScript(({ calculatorContext, verificationKey, calculatorKey }) => {
    sessionStorage.clear();
    sessionStorage.setItem(verificationKey, JSON.stringify({
      schemaVersion: 1,
      provider: 'google-apps-script',
      verifiedAt: Date.now(),
      role: 'verified',
    }));
    sessionStorage.setItem(calculatorKey, JSON.stringify(calculatorContext));
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: () => document.documentElement.dataset.printCalled = 'true',
    });
  }, { calculatorContext: context, verificationKey: VERIFICATION_KEY, calculatorKey: CALCULATOR_CONTEXT_KEY });
}

test('인증 세대의 옵션·청약·감액 계산 흐름은 개인정보 없이 이어진다', async ({ page }) => {
  const context: CalculatorContext = {
    schemaVersion: 1,
    unitType: '55A',
    priceFloorBand: '5+',
    applicantRoute: 'main-subscription',
    optionIds: ['system-ac-2-general', 'wide-plank-floor-finish'],
    returnUrl: RETURN_URL,
  };
  await seedCalculatorSession(page, context);
  await page.goto('calculator/');

  await expect(page.getByRole('heading', { name: '내 자금 계획' })).toBeVisible();
  await expect(page.locator('#calculator-context-header')).toContainText('55A · 5층 이상');
  await expect(page.locator('.context-highlight')).toContainText('55A · 5층 이상 · 본청약 기준');
  await expect(page.getByLabel('본청약(신규신청자)')).toBeChecked();
  await expect(page.locator('.calculator-side > :first-child')).toHaveAttribute('id', 'calculator-option-details');
  await expect(page.locator('#calculator-option-details')).not.toHaveAttribute('open', '');
  await page.locator('#calculator-option-details summary').click();
  await expect(page.locator('[data-option-tier="option-ii"]')).toContainText('시스템에어컨 2대 · 일반형');
  await expect(page.locator('[data-option-tier="option-ii"]')).toContainText('3,600,000원');
  await expect(page.locator('[data-option-tier="option-iii"]')).toContainText('광폭 강마루');
  await expect(page.locator('[data-option-tier="option-iii"]')).toContainText('1,820,000원');
  await expect(page.locator('.schedule-table thead')).toContainText('시스템에어컨');
  await expect(page.locator('.schedule-table thead')).toContainText('기타 옵션');
  await expect(page.locator('.schedule-table thead')).toContainText('납부일');
  await expect(page.locator('.schedule-table tr[data-phase="contract"] .schedule-date')).toContainText('2026.11.07~11.13');

  await page.locator('.plan-switch label').filter({ hasText: '사전청약 당첨자' }).click();
  await expect(page.getByLabel('사전청약 당첨자')).toBeChecked();
  await expect(page.locator('.context-highlight')).toContainText('사전청약 당첨자 기준');
  await expect(page.locator('.schedule-table tbody')).toContainText('계약금');
  await expect(page.locator('.schedule-table tbody')).toContainText('31,825,500원');
  await expect(page.locator('.schedule-table tbody')).toContainText('중도금');
  await expect(page.locator('.schedule-table tbody')).not.toContainText('중도금 2차');

  const taxDetails = page.locator('#calculator-tax-details');
  await taxDetails.locator('summary').click();
  await page.getByLabel('취득세 추정 활성화').check();
  await expect(page.locator('#calculator-tax-details')).toHaveAttribute('open', '');
  await taxDetails.locator('.relief-options label').filter({ hasText: '생애최초' }).click();
  await expect(page.locator('#calculator-tax-details')).toContainText('−2,000,000원');
  await expect(page.locator('#calculator-tax-details')).toContainText('지방교육세');
  const interimDetails = page.locator('#calculator-interim-loan-details');
  await interimDetails.locator('summary').click();
  await page.getByLabel('이자후불제 추정 활성화').check();
  await expect(interimDetails).toContainText('4.0%');
  await expect(interimDetails).toContainText('주택 공급대금 중도금 20%');
  await expect(interimDetails).toContainText('기타 옵션 중도금 · 자납');
  await page.getByRole('button', { name: '금리 0.5%포인트 높이기' }).click();
  await expect(interimDetails).toContainText('4.5%');
  const mortgageDetails = page.locator('#calculator-mortgage-details');
  await mortgageDetails.locator('summary').click();
  await page.getByLabel('대출 추정 활성화').check();
  await expect(page.locator('#calculator-mortgage-details')).toHaveAttribute('open', '');
  await expect(page.locator('#calculator-mortgage-details')).toContainText('월 원리금');
  await expect(page.locator('#calculator-mortgage-details')).toContainText('1.3% 고정');
  await page.locator('#calculator-children').selectOption('2');
  await page.locator('#calculator-settlement-period').selectOption('1-9');
  await expect(page.locator('#calculator-mortgage-details')).toContainText('향후 매각차익 기금 정산비율30%');

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.calculator-side')).toBeVisible();
  await expect(page.locator('#calculator-tax-details')).toBeVisible();
  await expect(page.locator('.source-card')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: '인쇄 · PDF 저장' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-called', 'true');

  const stored = await page.evaluate((key) => sessionStorage.getItem(key), CALCULATOR_CONTEXT_KEY);
  expect(JSON.parse(stored || '{}')).toEqual(context);
  expect(page.url()).not.toMatch(/105|1903|%ED%94%BC%EC%B9%98/u);
  await expect(page.locator('body')).not.toContainText('105');
  await expect(page.locator('body')).not.toContainText('1903');
  await expect(page.locator('body')).not.toContainText('피치');
  expect(stored).not.toMatch(/105|1903|피치/u);

  await page.locator('#calculator-return-options').click();
  await expect(page).toHaveURL(new RegExp(`${RETURN_URL.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`));

  // 동일 탭의 새 계산기 실행은 선택 옵션 스냅샷만 바꾸며 개인 식별값을 추가하지 않는다.
  await seedCalculatorSession(page, {
    schemaVersion: 1,
    unitType: '55A',
    priceFloorBand: '5+',
    applicantRoute: 'main-subscription',
    optionIds: ['bundang-minus-option-package'],
    returnUrl: RETURN_URL,
  });
  await page.goto('calculator/');

  await expect(page.getByRole('heading', { name: '내 자금 계획' })).toBeVisible();
  await expect(page.locator('[data-option-tier="discount-metadata-only"]')).toContainText('마이너스 옵션은 할인 전용 항목');
  await expect(page.locator('[data-option-tier="discount-metadata-only"]')).toContainText('공급가 감액−28,490,000원');
  await expect(page.locator('[data-option-tier="discount-metadata-only"]')).toContainText('발코니 감액−770,000원');
  await expect(page.locator('.contract-breakdown .discount')).toContainText('마이너스 감액');
  await expect(page.locator('.contract-breakdown .discount')).toContainText('−29,260,000원');
});
