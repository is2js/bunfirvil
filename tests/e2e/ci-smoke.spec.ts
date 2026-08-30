import { expect, test } from '@playwright/test';

const MAPS = [
  ['bundang-first-village-51a-prototype', '51A'],
  ['bundang-first-village-55a-prototype', '55A'],
  ['bundang-first-village-55b-prototype', '55B'],
  ['bundang-first-village-59a-prototype', '59A'],
] as const;

test('smokes the deployed map, living-room spawn, and B palette', async ({ page }) => {
  const forbiddenRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/^wss?:/i.test(url) || /socket\.io/i.test(url) || new URL(url).pathname.includes('/api/')) forbiddenRequests.push(url);
  });
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('./');
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
  await page.goto('manage/');
  await expect(page.locator('#loadingState')).toBeHidden();
  await expect(page.locator('.map-card')).toHaveCount(4);
  expect(forbiddenRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
