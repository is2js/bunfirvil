import { expect, test } from '@playwright/test';

const MAPS = [
  ['bundang-first-village-51a-prototype', '51A'],
  ['bundang-first-village-55a-prototype', '55A'],
  ['bundang-first-village-55b-prototype', '55B'],
  ['bundang-first-village-59a-prototype', '59A'],
] as const;

test('smokes household selection, deployed maps, living-room spawn, and B palette', async ({ page }) => {
  const forbiddenRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/^wss?:/i.test(url) || /socket\.io/i.test(url) || new URL(url).pathname.includes('/api/')) forbiddenRequests.push(url);
  });
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '분당퍼스트빌리지 동 선택' })).toBeVisible();
  await expect(page.locator('.household-selector-shell > .topbar')).toBeVisible();
  await expect(page.locator('.household-selector-shell > .serverless-banner')).toBeVisible();
  await expect(page.locator('.household-building-choice')).toHaveCount(12);
  await expect(page.locator('#household-step-building')).toHaveAttribute('aria-current', 'step');
  await expect.poll(async () => page.locator('.household-building-picker').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3);
  expect((await page.locator('.household-building-choice').first().boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('[data-choose-building="105"]').click();
  expect(await page.locator('.household-building-row.is-single .household-cell[data-floor="25"]').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(9.5);
  await page.getByRole('button', { name: '동 다시 선택' }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(async () => page.locator('.household-building-picker').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);
  expect((await page.locator('.household-building-choice').first().boundingBox())!.height).toBeLessThanOrEqual(72);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./households/');
  await expect(page.getByRole('heading', { name: '분당퍼스트빌리지 전체 동·호 현황' })).toBeVisible();
  await expect(page.locator('.household-overview-shell > .topbar')).toBeVisible();
  await expect(page.locator('.household-building-row').first().locator('.household-building-card')).toHaveCount(3);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.household-building-row').first().locator('.household-building-card')).toHaveCount(4);
  await page.goto('./');
  await page.locator('[data-choose-building="105"]').click();
  await expect(page.getByRole('heading', { name: '105동 세대 선택' })).toBeVisible();
  await expect(page.locator('#household-step-unit')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#household-selected-building')).toHaveText('105동 선택됨');
  await expect(page.locator('.household-building-row.is-single .household-building-card')).toHaveCount(1);
  expect(await page.locator('.household-building-row.is-single .household-cell[data-floor="25"]').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(11);
  await page.getByRole('button', { name: '동 다시 선택' }).click();
  await expect(page.getByRole('heading', { name: '분당퍼스트빌리지 동 선택' })).toBeVisible();
  await expect(page.locator('[data-choose-building="105"]')).toHaveClass(/is-selected/);
  await page.locator('[data-choose-building="105"]').click();
  const household = page.locator('.household-cell[data-building="105"][data-floor="25"][data-line="1"]');
  await household.click();
  await expect(household).toHaveClass(/is-selected/);
  await expect(page.locator('#household-selection-summary')).toHaveText('105동 2501호 · 51A · 남동향');
  await expect(page.locator('#household-selection-summary')).not.toContainText('A형');
  await page.getByRole('button', { name: '선택한 세대 쇼케이스 보기' }).click();
  await expect(page).toHaveURL(/map=bundang-first-village-51a-prototype/);
  await expect(page).toHaveURL(/variant=A/);
  await expect(page.locator('#stage-loader')).toHaveClass(/is-hidden/, { timeout: 30_000 });
  const mapSelect = page.getByLabel('검수맵 선택');
  for (const [mapId, unitType] of MAPS) {
    await mapSelect.selectOption(mapId);
    await expect(page.locator('#stage-loader')).toHaveClass(/is-hidden/, { timeout: 30_000 });
    await expect(page.locator('#map-unit')).toHaveText(unitType);
    await expect(page.locator('#metric-chunks')).toHaveText('16/16');
    await expect(page.locator('#game-stage')).toHaveAttribute('data-actor-spawn-room', 'living');
  }

  await expect(page.locator('.rpg-actor')).toHaveCount(2);
  const categories = page.locator('#option-categories');
  await expect.poll(async () => categories.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: '주방 벽/상판·냉장고장', exact: true })).toBeVisible();

  const optionList = page.locator('#option-list');
  const summary = page.locator('.option-summary');
  await expect.poll(async () => optionList.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  const summaryTop = (await summary.boundingBox())!.y;
  await optionList.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(async () => optionList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(Math.abs((await summary.boundingBox())!.y - summaryTop)).toBeLessThan(1);
  expect((await page.locator('#option-total').innerText()).replace(/\s/g, '')).toMatch(/^\d{1,3}(,\d{3})*원$/);
  expect(await page.locator('.option-copy b').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(11);
  expect(await page.locator('.stage-tip').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(10);

  await page.getByRole('button', { name: '주방 벽/상판·냉장고장', exact: true }).click();
  await expect.poll(async () => page.locator('#option-list .option-card').count()).toBeGreaterThan(0);

  const laserToggle = page.locator('#inspection-laser-toggle');
  await expect(laserToggle).toBeAttached();
  await expect(page.locator('#inspection-laser-point-mode')).toBeAttached();
  if (await laserToggle.isVisible()) {
    await mapSelect.evaluate((element) => (element as HTMLSelectElement).blur());
    await page.keyboard.press('KeyJ');
    await expect(page.locator('#game-stage')).toHaveAttribute('data-istarpark-laser-active', 'true');
    await expect(page.locator('#inspection-laser-phase')).toHaveText('자동');
    await page.keyboard.press('KeyJ');
    await expect(page.locator('#inspection-laser-phase')).toHaveText('시작점');
    await expect(page.locator('#inspection-laser-point-mode')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('KeyJ');
    await expect(page.locator('#inspection-laser-phase')).toHaveText('자동');
    await page.keyboard.press('Escape');
    await expect(page.locator('#game-stage')).not.toHaveAttribute('data-istarpark-laser-active', 'true');
    await expect(page.locator('#inspection-laser-hud')).toBeHidden();
  }

  await page.goto('manage/');
  await expect(page.locator('#loadingState')).toBeHidden();
  await expect(page.locator('.map-card')).toHaveCount(4);
  expect(forbiddenRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
