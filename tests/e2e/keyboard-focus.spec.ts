import { expect, test } from '@playwright/test';

test('scene and pointer hotbar restore keyboard control after Space and dialogs', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.addInitScript(() => {
    sessionStorage.setItem('bunfirvil:household-verification:v1', JSON.stringify({
      schemaVersion: 1, provider: 'google-apps-script', verifiedAt: Date.now(),
      role: 'operator', authRevision: 2, scope: 'playground', nickname: '테스트',
    }));
  });
  await page.goto('./?map=bundang-first-village-55a-prototype&variant=A');
  const stage = page.locator('#game-stage');
  const children = page.locator('[data-hotbar-action="showcase-children"]');
  await expect(children).toBeVisible();
  // A focus left on a HUD button must not survive a subsequent canvas click.
  await children.focus();
  await page.locator('#three-world-canvas').click({ position: { x: 300, y: 260 }, timeout: 15_000 });
  await expect(stage).toBeFocused();
  await page.locator('.rpg-actor--100').click();
  await expect(stage).toBeFocused();
  await page.evaluate(() => {
    const actor = document.querySelector('.rpg-actor--100')!;
    new MutationObserver(() => {
      if (actor.getAttribute('data-motion') === 'attack') actor.setAttribute('data-observed-attack', 'true');
    }).observe(actor, { attributes: true, attributeFilter: ['data-motion'] });
  });
  await page.keyboard.down('Space');
  await expect(page.locator('.rpg-actor--100')).toHaveAttribute('data-observed-attack', 'true');
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(stage).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await page.keyboard.down('ArrowRight');
  await expect(page.locator('.rpg-actor--100')).toHaveAttribute('data-motion', 'walk');
  await page.keyboard.up('ArrowRight');
  await children.click();
  await expect(page.locator('.child-companion-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(stage).toBeFocused();
  // Pointer hotbar actions return to the game; Tab-focused buttons still
  // support native Space activation for keyboard-only users.
  await page.locator('[data-hotbar-action="showcase-gender-toggle"]').click();
  await expect(stage).toBeFocused();
  await page.evaluate(() => {
    const actor = document.querySelector('.rpg-actor--200')!;
    new MutationObserver(() => {
      if (actor.getAttribute('data-motion') === 'attack') actor.setAttribute('data-observed-attack', 'true');
    }).observe(actor, { attributes: true, attributeFilter: ['data-motion'] });
  });
  await page.keyboard.press('Space');
  await expect(page.locator('.rpg-actor--200')).toHaveAttribute('data-observed-attack', 'true');
  await children.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.child-companion-dialog')).toBeVisible();
});
