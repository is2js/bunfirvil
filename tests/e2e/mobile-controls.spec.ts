import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('touch drag, held direction, release, attack, zoom and furniture preview work without keyboard', async ({ page, context }) => {
  test.setTimeout(180_000);
  await context.addInitScript(() => {
    sessionStorage.setItem('bunfirvil:household-verification:v1', JSON.stringify({
      schemaVersion: 1, provider: 'google-apps-script', verifiedAt: Date.now(),
      role: 'verified', authRevision: 2, scope: 'playground', nickname: '테스트',
    }));
  });
  await page.goto('./?map=bundang-first-village-55a-prototype&variant=A');
  const stage = page.locator('#game-stage');
  const pad = page.locator('.touch-move-pad');
  const actor = page.locator('.rpg-actor--100');
  await expect(pad).toBeVisible();
  await expect(actor).toHaveClass(/has-sprite/);
  await pad.scrollIntoViewIfNeeded();
  const client = await context.newCDPSession(page);
  const box = (await pad.boundingBox())!;
  const start = await actor.getAttribute('data-world-x');
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width - 20, y: box.y + box.height / 2 }] });
  await expect(actor).toHaveAttribute('data-motion', 'walk');
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(actor).toHaveAttribute('data-travel-state', 'settled');
  expect(await actor.getAttribute('data-world-x')).not.toBe(start);
  const stopped = await actor.getAttribute('data-world-x');
  await page.waitForTimeout(600);
  expect(await actor.getAttribute('data-world-x')).toBe(stopped);
  // Explicit pointer cancellation must release a held direction too.
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 20, y: box.y + box.height / 2 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(pad).not.toHaveAttribute('data-direction', /.+/);
  await page.evaluate(() => {
    const actor = document.querySelector('.rpg-actor--100')!;
    new MutationObserver(() => { if (actor.getAttribute('data-motion') === 'attack') actor.setAttribute('data-attack-seen', 'true'); }).observe(actor, { attributes: true, attributeFilter: ['data-motion'] });
  });
  await page.locator('#touch-attack').tap();
  await expect(actor).toHaveAttribute('data-attack-seen', 'true');
  await page.locator('#zoom-in').tap();
  await expect(page.locator('#zoom-value')).not.toHaveText('100%');
  await stage.scrollIntoViewIfNeeded();
  const rect = (await stage.boundingBox())!;
  const x = rect.x + 60, y = Math.max(30, rect.y + 210);
  const beforeScroll = await page.evaluate(() => scrollY);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 65, y: y + 30 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(stage).toHaveAttribute('data-camera-tracking', 'free');
  expect(await page.evaluate(() => scrollY)).toBe(beforeScroll);
  await page.locator('#inspection-laser-toggle').tap();
  await expect(page.locator('#inspection-laser-hud')).toBeVisible();
  await page.locator('#touch-cancel').tap();
  await expect(page.locator('#inspection-laser-hud')).toBeHidden();
  await page.locator('[data-palette-tab="furniture"]').tap();
  await page.locator('[data-furniture-asset]').first().tap();
  await expect(stage).toHaveClass(/has-interior-ghost/);
  await page.locator('[data-touch-ghost="rotate-right"]').tap();
  await page.locator('[data-touch-ghost="snap"]').tap();
  await stage.scrollIntoViewIfNeeded();
  const ghostRect = (await stage.boundingBox())!;
  await page.touchscreen.tap(ghostRect.x + 100, Math.max(30, ghostRect.y + 260));
  await expect(stage).toHaveClass(/has-interior-ghost/);
  await page.locator('[data-touch-ghost="cancel"]').tap();
  await expect(stage).not.toHaveClass(/has-interior-ghost/);
  const padBox = (await pad.boundingBox())!;
  const quote = (await page.locator('.stage-option-quote').boundingBox())!;
  expect(quote.y + quote.height).toBeLessThan(padBox.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-controls.png', fullPage: true });
});
