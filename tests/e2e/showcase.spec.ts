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
  const threeCanvas = page.locator("#three-world-canvas");
  await expect.poll(async () => Number(await threeCanvas.getAttribute("data-interior-asset-count"))).toBeGreaterThanOrEqual(96);
  await expect.poll(async () => Number(await threeCanvas.getAttribute("data-recipe-part-count"))).toBeGreaterThanOrEqual(450);
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
    await expect(threeCanvas).toHaveAttribute("data-apartment-structure", "ready");
    await expect.poll(async () => Number(await threeCanvas.getAttribute("data-structure-mesh-count"))).toBeGreaterThan(50);
    await expect(threeCanvas).toHaveAttribute("data-interior-placement-status", "verified");
    await expect(threeCanvas).toHaveAttribute("data-interior-placement-issue-count", "0");
  }

  const actor100 = page.locator('.rpg-actor[data-actor="100"]');
  const actor200 = page.locator('.rpg-actor[data-actor="200"]');
  const hotbarSlots = page.locator("#hotbar .hotbar-slot");
  await expect(hotbarSlots).toHaveCount(4);
  await expect(hotbarSlots.nth(0)).toHaveAttribute("data-skill-id", "common-teleport");
  await expect(hotbarSlots.nth(1)).toHaveAttribute("data-skill-id", "basic-attack");
  await page.getByRole("button", { name: "100", exact: true }).click();
  await expect(page.locator("#active-actor-label")).toHaveText("남자의료진");
  await observeNextMotion(actor100, "attack");
  await page.getByRole("button", { name: "2번 기본 공격" }).click();
  await expect(actor100).toHaveAttribute("data-observed-motion", "attack");

  await page.getByRole("button", { name: "200", exact: true }).click();
  await expect(page.locator("#active-actor-label")).toHaveText("여자의료진");
  expect(await actor200.locator(".actor-sprite").evaluate((element) => Number.parseFloat(getComputedStyle(element).width))).toBe(58);
  await expect(page.locator("#game-stage")).toHaveAttribute("data-movement-interval-ms", "420");
  await expect(page.locator("#game-stage")).toHaveAttribute("data-cell-projection", "32x24");
  const startX = Number(await actor200.getAttribute("data-world-x"));
  const startY = Number(await actor200.getAttribute("data-world-y"));
  await page.keyboard.down("KeyD");
  await expect(actor200).toHaveAttribute("data-travel-state", "moving");
  await expect(actor200).toHaveAttribute("data-animation-cycle-ms", "420");
  await page.waitForTimeout(520);
  await page.keyboard.up("KeyD");
  await expect(actor200).toHaveAttribute("data-direction", "e");
  await expect.poll(async () => Number(await actor200.getAttribute("data-world-x"))).toBeGreaterThan(startX);
  const endX = Number(await actor200.getAttribute("data-world-x"));
  const endY = Number(await actor200.getAttribute("data-world-y"));
  expect(endX - startX).toBeGreaterThanOrEqual(1);
  expect(startY - endY).toBe(endX - startX);
  await observeNextMotion(actor200, "cast");
  await page.getByRole("button", { name: "3번 쇼크스턴" }).click();
  await expect(actor200).toHaveAttribute("data-observed-motion", "cast");

  const originalSkillIcons = page.locator('#hotbar .hotbar-slot[data-skill-id]:not([data-skill-id="basic-attack"]):not([data-skill-id=""]) img');
  await expect(originalSkillIcons).toHaveCount(3);
  for (const icon of await originalSkillIcons.all()) {
    expect(await icon.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }

  await observeNextMotion(actor200, "attack");
  await page.keyboard.press("Digit4");
  await expect(actor200).toHaveAttribute("data-observed-motion", "attack");

  const stageBounds = await page.locator("#game-stage").boundingBox();
  expect(stageBounds).not.toBeNull();
  const beforeNumberTeleport = {
    x: Number(await actor200.getAttribute("data-world-x")),
    y: Number(await actor200.getAttribute("data-world-y")),
  };
  await page.mouse.move(stageBounds!.x + stageBounds!.width * 0.7, stageBounds!.y + stageBounds!.height * 0.42);
  await observeNextMotion(actor200, "cast");
  await page.keyboard.press("Digit1");
  await expect(actor200).toHaveAttribute("data-observed-motion", "cast");
  await expect.poll(async () => `${await actor200.getAttribute("data-world-x")},${await actor200.getAttribute("data-world-y")}`)
    .not.toBe(`${beforeNumberTeleport.x},${beforeNumberTeleport.y}`);

  const beforeWheelTeleport = `${await actor200.getAttribute("data-world-x")},${await actor200.getAttribute("data-world-y")}`;
  await page.mouse.move(stageBounds!.x + stageBounds!.width * 0.32, stageBounds!.y + stageBounds!.height * 0.52);
  await page.mouse.down({ button: "middle" });
  await page.mouse.up({ button: "middle" });
  await expect.poll(async () => `${await actor200.getAttribute("data-world-x")},${await actor200.getAttribute("data-world-y")}`)
    .not.toBe(beforeWheelTeleport);

  const secondSlot = page.locator('#hotbar [data-slot="1"]');
  const fourthSlot = page.locator('#hotbar [data-slot="3"]');
  await secondSlot.dragTo(fourthSlot);
  await expect(secondSlot).toHaveAttribute("data-skill-id", "common-double-arrow");
  await expect(fourthSlot).toHaveAttribute("data-skill-id", "basic-attack");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bunfirvil:hotbar:v1") || "[]")[3])).toBe("basic-attack");

  const firstOption = page.locator('.option-card input[type="checkbox"]').first();
  const firstOptionPreview = page.locator(".option-card .option-preview img").first();
  await expect(firstOptionPreview).toBeVisible();
  expect(await firstOptionPreview.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const firstOptionId = await firstOption.getAttribute("data-option-id");
  expect(firstOptionId).toBeTruthy();
  const propsBeforeOption = Number(await threeCanvas.getAttribute("data-apartment-prop-count"));
  await firstOption.setChecked(true, { force: true });
  await expect(page.locator("#option-selected-count")).toHaveText("1개");
  await expect(page.locator("#option-total")).not.toHaveText(/^0/);
  await expect(page.locator("#stage-option-chips")).not.toContainText("기본 마감");
  await expect(page.locator("#stage-option-total")).toHaveText(await page.locator("#option-total").innerText());
  await page.locator('#option-categories button', { hasText: '시스템에어컨' }).click();
  const generalAcCard = page.locator('.system-ac-card[data-system-ac-tier="general"]');
  await expect(generalAcCard).toBeVisible();
  await generalAcCard.getByRole('button', { name: '설치 대수 1 증가' }).click();
  await expect(generalAcCard.locator('output')).toHaveText('2대');
  await generalAcCard.getByRole('button', { name: '설치 대수 1 증가' }).click();
  // 59A 공개 계약은 3대 패키지가 없어 원본 팔레트와 같이 다음 제공 대수인 4대로 이동한다.
  await expect(page.locator('.system-ac-card[data-system-ac-tier="general"] output')).toHaveText('4대');
  await expect.poll(async () => Number(await threeCanvas.getAttribute("data-apartment-prop-count"))).toBeGreaterThan(propsBeforeOption);
  await expect(threeCanvas).toHaveAttribute("data-interior-placement-status", "verified");
  const savedQuote = await page.locator("#option-total").innerText();
  const savedMapId = await mapSelect.inputValue();

  await page.reload();
  await expect(page.locator("#stage-loader")).toBeHidden();
  await expect(page.getByLabel("검수맵 선택")).toHaveValue(savedMapId);
  await expect(page.locator(`#option-list input[data-option-id="${firstOptionId}"]`)).toBeChecked();
  await expect(page.locator("#option-total")).toHaveText(savedQuote);
  await expect(page.locator('#hotbar [data-slot="3"]')).toHaveAttribute("data-skill-id", "basic-attack");

  await page.goto("manage/");
  await expect(page.locator("#loadingState")).toBeHidden();
  await expect(page.locator("#errorState")).toBeHidden();
  await expect(page.locator(".map-card")).toHaveCount(4);
  await expect(page.locator(".map-card img").first()).toBeVisible();
  expect(await page.locator(".map-card img").first().evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator("#interiorEditor")).toHaveAttribute("data-loading", "false");
  await expect.poll(async () => page.locator("#editorAssetList .editor-asset").count()).toBeGreaterThan(30);
  await page.locator("#editorAssetList .editor-asset").first().click();
  await expect(page.locator("#interiorEditor")).toHaveAttribute("data-local-prop-count", "1");
  await expect(page.locator("#editorPlanCanvas")).toHaveAttribute("data-local-prop-count", "1");
  await expect.poll(async () => Number(await page.locator("#editorThreeCanvas").getAttribute("data-apartment-prop-count"))).toBeGreaterThan(0);
  await page.getByRole("button", { name: "+90°" }).click();
  await page.getByRole("button", { name: "⇆ 좌우 반전" }).click();
  const editorMapId = await page.locator("#editorMapSelect").inputValue();
  expect(await page.evaluate((mapId) => JSON.parse(localStorage.getItem(`bunfirvil:layout:v1:${mapId}`) || '{}').props?.[0]?.yawDeg, editorMapId)).toBe(90);

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
