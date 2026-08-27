import { describe, expect, it } from "vitest";
import { EXPECTED_MAP_IDS, validateCatalog } from "./catalog";

function validCatalog(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    exportId: "snapshot-1",
    generatedAt: "2026-08-27T00:00:00.000Z",
    maps: EXPECTED_MAP_IDS.map((id, index) => ({
      id,
      label: `${["51A", "55A", "55B", "59A"][index]} 검수맵`,
      unitType: ["51A", "55A", "55B", "59A"][index],
      revision: `r${index + 1}`,
      width: 64,
      height: 64,
      chunkCount: 16,
      assetBytes: 2048,
      renderer: index === 0 ? "canvas2d" : "three-pbr",
      manifestUrl: `generated/worlds/${id}/manifest.json`,
      minimapUrl: `generated/worlds/${id}/minimap.png`,
      spawn: { x: 2, y: 3 },
    })),
    characters: [],
    skills: [],
    defaultHotbar: [],
    bOptions: [
      {
        id: "base",
        label: "기본",
        category: "마감",
        price: 0,
        prices: { "51A": 100_000 },
        description: "기본 옵션",
        compatibleUnitTypes: ["51A"],
        requires: [],
        requiresAny: [],
        excludes: [],
      },
    ],
  };
}

describe("validateCatalog", () => {
  it("accepts the four-map project-relative contract", () => {
    expect(validateCatalog(validCatalog()).ok).toBe(true);
  });

  it("rejects root paths that would break a GitHub project page", () => {
    const catalog = validCatalog();
    const maps = catalog.maps as Array<Record<string, unknown>>;
    maps[0].minimapUrl = "/assets/private/minimap.png";
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("프로젝트 기준 상대경로");
    }
  });

  it("rejects missing required maps and unexpected map additions", () => {
    const catalog = validCatalog();
    const maps = catalog.maps as Array<Record<string, unknown>>;
    maps.pop();
    maps.push({ ...maps[0], id: "site-plan" });
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const message = result.errors.join(" ");
      expect(message).toContain("필수 검수맵");
      expect(message).toContain("1차 공개 범위");
    }
  });

  it("rejects invalid per-unit prices and unknown any-dependency references", () => {
    const catalog = validCatalog();
    const options = catalog.bOptions as Array<Record<string, unknown>>;
    options[0].prices = { "51A": -1, "77A": 100 };
    options[0].requiresAny = ["missing-island"];
    const result = validateCatalog(catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const message = result.errors.join(" ");
      expect(message).toContain("prices는 세대형별 0 이상의 가격 객체");
      expect(message).toContain("대안 필수 옵션 missing-island");
    }

    const unknownUnitCatalog = validCatalog();
    const unknownUnitOptions = unknownUnitCatalog.bOptions as Array<Record<string, unknown>>;
    unknownUnitOptions[0].prices = { "77A": 100 };
    const unknownUnitResult = validateCatalog(unknownUnitCatalog);
    expect(unknownUnitResult.ok).toBe(false);
    if (!unknownUnitResult.ok) {
      expect(unknownUnitResult.errors.join(" ")).toContain("알 수 없는 세대형 77A");
    }
  });
});
