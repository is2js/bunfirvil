import { readFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";

const MAPS = [
  ["bundang-first-village-51a-prototype", "51A"],
  ["bundang-first-village-55a-prototype", "55A"],
  ["bundang-first-village-55b-prototype", "55B"],
  ["bundang-first-village-59a-prototype", "59A"],
] as const;

async function observeNextMotion(actor: Locator, expected: "attack" | "cast"): Promise<void> {
  await actor.evaluate((element, motion) => {
    const actorElement = element as HTMLElement;
    actorElement.removeAttribute("data-observed-motion");
    let observer: MutationObserver | null = null;
    const capture = () => {
      if (actorElement.dataset.motion !== motion) return;
      actorElement.dataset.observedMotion = motion;
      observer?.disconnect();
    };
    observer = new MutationObserver(capture);
    observer.observe(actorElement, { attributes: true, attributeFilter: ["data-motion"] });
    capture();
  }, expected);
}

test("runs the full serverless showcase and local review workflow", async ({ page }) => {
  const forbiddenRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/^wss?:/i.test(url) || /socket\.io/i.test(url) || new URL(url).pathname.includes("/api/")) {
      forbiddenRequests.push(url);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("./");
  await expect(page.getByText("프론트엔드 로컬 데모", { exact: true })).toBeVisible();
  await expect(page.locator("#stage-loader")).toBeHidden();
  await expect(page.locator("#metric-renderer")).toHaveText(/THREE·PBR|CANVAS·(?:ISO|FALLBACK)|MINIMAP|PROCEDURAL/);
  const initialTransferBytes = await page.evaluate(() => performance.getEntriesByType("resource")
    .reduce((total, entry) => {
      const resource = entry as PerformanceResourceTiming;
      return total + (resource.transferSize || resource.encodedBodySize || 0);
    }, 0));
  expect(initialTransferBytes).toBeLessThan(10 * 1024 * 1024);

  const mapSelect = page.getByLabel("검수맵 선택");
  for (const [mapId, unitType] of MAPS) {
    await mapSelect.selectOption(mapId);
    await expect(mapSelect).toHaveValue(mapId);
    await expect(page.locator("#map-unit")).toHaveText(unitType);
    await expect(page.locator("#stage-loader")).toBeHidden();
    await expect(page.locator("#metric-chunks")).toHaveText("16/16");
  }

  const actor100 = page.locator('.rpg-actor[data-actor="100"]');
  const actor200 = page.locator('.rpg-actor[data-actor="200"]');
  await page.getByRole("button", { name: "100", exact: true }).click();
  await expect(page.locator("#active-actor-label")).toHaveText("남자의료진");
  await observeNextMotion(actor100, "attack");
  await page.getByRole("button", { name: "1번 기본 공격" }).click();
  await expect(actor100).toHaveAttribute("data-observed-motion", "attack");

  await page.getByRole("button", { name: "200", exact: true }).click();
  await expect(page.locator("#active-actor-label")).toHaveText("여자의료진");
  await observeNextMotion(actor200, "cast");
  await page.getByRole("button", { name: "2번 쇼크스턴" }).click();
  await expect(actor200).toHaveAttribute("data-observed-motion", "cast");

  await observeNextMotion(actor200, "attack");
  await page.keyboard.press("Digit3");
  await expect(actor200).toHaveAttribute("data-observed-motion", "attack");
  await observeNextMotion(actor200, "cast");
  await page.keyboard.press("Digit4");
  await expect(actor200).toHaveAttribute("data-observed-motion", "cast");

  const firstSlot = page.locator('#hotbar [data-slot="0"]');
  const eighthSlot = page.locator('#hotbar [data-slot="7"]');
  await expect(firstSlot).toHaveAttribute("data-skill-id", "basic-attack");
  await firstSlot.dragTo(eighthSlot);
  await expect(firstSlot).toHaveAttribute("data-skill-id", "");
  await expect(eighthSlot).toHaveAttribute("data-skill-id", "basic-attack");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bunfirvil:hotbar:v1") || "[]")[7])).toBe("basic-attack");

  const firstOption = page.locator('.option-card input[type="checkbox"]').first();
  const firstOptionId = await firstOption.getAttribute("data-option-id");
  expect(firstOptionId).toBeTruthy();
  await firstOption.setChecked(true, { force: true });
  await expect(page.locator("#option-selected-count")).toHaveText("1개");
  await expect(page.locator("#option-total")).not.toHaveText(/^0/);
  const savedQuote = await page.locator("#option-total").innerText();
  const savedMapId = await mapSelect.inputValue();

  await page.reload();
  await expect(page.locator("#stage-loader")).toBeHidden();
  await expect(page.getByLabel("검수맵 선택")).toHaveValue(savedMapId);
  await expect(page.locator(`#option-list input[data-option-id="${firstOptionId}"]`)).toBeChecked();
  await expect(page.locator("#option-total")).toHaveText(savedQuote);
  await expect(page.locator('#hotbar [data-slot="7"]')).toHaveAttribute("data-skill-id", "basic-attack");

  await page.goto("manage/");
  await expect(page.locator("#loadingState")).toBeHidden();
  await expect(page.locator("#errorState")).toBeHidden();
  await expect(page.locator(".map-card")).toHaveCount(4);
  await expect(page.locator(".map-card img").first()).toBeVisible();
  expect(await page.locator(".map-card img").first().evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  const map55b = page.locator(".map-card").filter({ hasText: "55B 세대 검증" });
  await map55b.getByLabel("검수 상태").selectOption("pass");
  await map55b.getByLabel("검수 메모").fill("정적 렌더링 확인 완료");
  await page.reload();
  await expect(page.locator("#loadingState")).toBeHidden();
  const restored55b = page.locator(".map-card").filter({ hasText: "55B 세대 검증" });
  await expect(restored55b.getByLabel("검수 상태")).toHaveValue("pass");
  await expect(restored55b.getByLabel("검수 메모")).toHaveValue("정적 렌더링 확인 완료");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 JSON 내보내기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^bunfirvil-reviews-\d{4}-\d{2}-\d{2}\.json$/);
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const exportedBundle = JSON.parse(await readFile(downloadedPath!, "utf8"));
  expect(exportedBundle.schemaVersion).toBe(1);
  expect(exportedBundle.reviews).toHaveLength(4);
  expect(exportedBundle.reviews).toEqual(expect.arrayContaining([
    expect.objectContaining({
      mapId: "bundang-first-village-55b-prototype",
      status: "pass",
      notes: "정적 렌더링 확인 완료",
    }),
  ]));

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "로컬 기록 초기화" }).click();
  for (const status of await page.getByLabel("검수 상태").all()) await expect(status).toHaveValue("unreviewed");
  for (const notes of await page.getByLabel("검수 메모").all()) await expect(notes).toHaveValue("");
  await expect(page.locator("#passCount")).toHaveText("0");

  const importPayload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    reviews: [{
      mapId: "bundang-first-village-55b-prototype",
      status: "pass",
      notes: "JSON 복원 확인",
      selectedOptionIds: [],
      updatedAt: new Date().toISOString(),
    }],
  };
  await page.locator("#importFile").setInputFiles({
    name: "reviews.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importPayload)),
  });
  await expect(page.locator("#messageRegion")).toContainText("1개 맵의 검수자료를 가져왔습니다");
  const imported55b = page.locator(".map-card").filter({ hasText: "55B 세대 검증" });
  await expect(imported55b.getByLabel("검수 상태")).toHaveValue("pass");
  await expect(imported55b.getByLabel("검수 메모")).toHaveValue("JSON 복원 확인");

  expect(forbiddenRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
