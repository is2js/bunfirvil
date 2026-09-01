import { expect, test } from '@playwright/test';

const OPTION_ID = 'air-planner-ceiling-vent';

async function expectLinkedOption(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('#option-palette-body')).toBeVisible();
  await expect(page.locator('#option-categories button.is-active')).toHaveText('빌트인 가전');
  await expect(page.locator(`[data-option-card-id="${OPTION_ID}"]`)).toHaveClass(/is-world-linked/);
  await expect(page.locator(`.stage-option-chip[data-stage-option-select="${OPTION_ID}"]`)).toHaveClass(/is-world-selected/);
  await expect(page.locator('#three-world-canvas')).toHaveAttribute('data-selected-editor-mask', 'rpg-gold');
  await expect(page.locator('#three-world-canvas')).toHaveAttribute('data-air-planner-room-unit-count', '4');

  const cardIsVisible = await page.locator(`[data-option-card-id="${OPTION_ID}"]`).evaluate((card) => {
    const list = card.closest('#option-list');
    if (!list) return false;
    const listBounds = list.getBoundingClientRect();
    const cardBounds = card.getBoundingClientRect();
    return cardBounds.top >= listBounds.top && cardBounds.bottom <= listBounds.bottom;
  });
  expect(cardIsVisible).toBe(true);
}

test('좌하단 옵션 chip은 옵션·가구 탭 모두에서 인게임 mask와 우측 카드로 연결된다', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('./?map=bundang-first-village-55a-prototype&actor=200&variant=A');
  await expect(page.locator('#stage-loader')).toHaveClass(/is-hidden/, { timeout: 30_000 });

  await page.locator(`input[data-option-id="${OPTION_ID}"]`).setChecked(true, { force: true });
  const chipButton = page.locator(`button[data-stage-option-select="${OPTION_ID}"]`);
  await expect(chipButton).toBeVisible();

  // 기본 B옵션 탭: stage pointerdown이 chip DOM을 교체하지 않아야 한다.
  await chipButton.click();
  await expectLinkedOption(page);

  // 가구 탭에서도 chip의 얇은 바깥 테두리까지 동일한 선택 동작을 한다.
  await page.getByRole('button', { name: '가구 배치', exact: true }).click();
  await page.locator(`.stage-option-chip[data-stage-option-select="${OPTION_ID}"]`).click({ position: { x: 1, y: 1 } });
  await expectLinkedOption(page);
});
