import { expect, test } from '@playwright/test';

test('기본 쿡탑·후드와 택1 옵션이 같은 주방 앵커에서 즉시 교체된다', async ({ page }) => {
  await page.goto('?map=bundang-first-village-55b-prototype&actor=200&variant=A');
  const canvas = page.locator('#three-world-canvas');
  await expect(canvas).toHaveAttribute('data-apartment-structure', 'ready');
  await expect(canvas).toHaveAttribute('data-kitchen-cooktop-asset-id', 'bunfirvil-default-navien-magic-gas-cooktop-3');
  await expect(canvas).toHaveAttribute('data-kitchen-range-hood-asset-id', 'bunfirvil-default-kitchen-range-hood');
  await expect(canvas).toHaveAttribute('data-kitchen-cooktop-yaw-deg', '90');
  await expect(canvas).toHaveAttribute('data-kitchen-cooktop-position', '6.24,7.89');
  await expect(canvas).toHaveAttribute('data-kitchen-range-hood-position', '6.46,7.89');

  const erh = page.locator('input[data-option-id="electric-cooktop-erh-3903"]');
  const lg = page.locator('input[data-option-id="induction-cooktop-bei3asb4bi"]');
  const samsung = page.locator('input[data-option-id="induction-cooktop-nz63b5056ak"]');
  await erh.check({ force: true });
  await expect(canvas).toHaveAttribute('data-kitchen-cooktop-asset-id', 'electric-cooktop-erh-3903');
  await lg.check({ force: true });
  await expect(erh).not.toBeChecked();
  await expect(canvas).toHaveAttribute('data-kitchen-cooktop-asset-id', 'induction-cooktop-bei3asb4bi');
  await samsung.check({ force: true });
  await expect(lg).not.toBeChecked();
  await expect(canvas).toHaveAttribute('data-kitchen-cooktop-asset-id', 'induction-cooktop-nz63b5056ak');
  await samsung.uncheck({ force: true });
  await expect(canvas).toHaveAttribute('data-kitchen-cooktop-asset-id', 'bunfirvil-default-navien-magic-gas-cooktop-3');

  const silentHood = page.locator('input[data-option-id="silent-range-hood"]');
  await silentHood.check({ force: true });
  await expect(canvas).toHaveAttribute('data-kitchen-range-hood-asset-id', 'silent-range-hood');
  await silentHood.uncheck({ force: true });
  await expect(canvas).toHaveAttribute('data-kitchen-range-hood-asset-id', 'bunfirvil-default-kitchen-range-hood');
});
