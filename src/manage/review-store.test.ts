import { describe, expect, it } from "vitest";
import { validateReview } from "./review-model";
import { migrateLegacyReviewFields } from "./review-store";
import type { ShowcaseCatalogV1 } from "./types";

const mapId = "bundang-first-village-51a-prototype";
const catalog: ShowcaseCatalogV1 = {
  schemaVersion: 1,
  exportId: "test",
  generatedAt: "2026-08-27T00:00:00.000Z",
  maps: [
    {
      id: mapId,
      label: "51A 검수맵",
      unitType: "51A",
      revision: "r1",
      width: 64,
      height: 64,
      chunkCount: 16,
      assetBytes: 1024,
      renderer: "three-pbr",
      manifestUrl: "generated/exports/test/maps/51a/manifest.json",
      minimapUrl: "generated/exports/test/maps/51a/minimap.png",
      spawn: { x: 1, y: 1 },
    },
  ],
  characters: [],
  skills: [],
  defaultHotbar: [],
  bOptions: [],
};

const legacyReview = {
  mapId,
  selectedOptionIds: [],
  updatedAt: "2026-08-27T01:00:00.000Z",
};

describe("migrateLegacyReviewFields", () => {
  it("fills only missing status and notes on the historical game review shape", () => {
    const migrated = migrateLegacyReviewFields(legacyReview);
    expect(migrated).toEqual({ ...legacyReview, status: "unreviewed", notes: "" });
    expect(validateReview(migrated, catalog).ok).toBe(true);
  });

  it("does not replace a present invalid status", () => {
    const migrated = migrateLegacyReviewFields({ ...legacyReview, status: "approved" });
    const result = validateReview(migrated, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("status가 지원되지 않습니다");
  });

  it("does not replace present invalid notes", () => {
    const migrated = migrateLegacyReviewFields({ ...legacyReview, notes: null });
    const result = validateReview(migrated, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("notes는 문자열");
  });

  it("does not broaden migration to unrelated incomplete objects", () => {
    const unrelated = { mapId, selectedOptionIds: [] };
    expect(migrateLegacyReviewFields(unrelated)).toBe(unrelated);
  });
});
