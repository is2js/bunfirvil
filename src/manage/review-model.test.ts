import { describe, expect, it } from "vitest";
import {
  changeOptionSelection,
  makeReviewBundle,
  optionQuote,
  validateReviewBundle,
} from "./review-model";
import type { BOptionV1, LocalReviewV1, ShowcaseCatalogV1, StaticMapEntryV1 } from "./types";

const makeMap = (id: string, unitType: string): StaticMapEntryV1 => ({
  id,
  label: unitType,
  unitType,
  revision: "r1",
  width: 64,
  height: 64,
  chunkCount: 16,
  assetBytes: 1024,
  renderer: "three-pbr",
  manifestUrl: `generated/worlds/${id}/manifest.json`,
  minimapUrl: `generated/worlds/${id}/minimap.png`,
  spawn: { x: 1, y: 1 },
});

const options: BOptionV1[] = [
  {
    id: "base",
    label: "기본 마감",
    category: "마감",
    price: 100,
    prices: { "51A": 110, "55A": 120 },
    description: "기본",
    compatibleUnitTypes: ["51A", "55A"],
    requires: [],
    requiresAny: [],
    excludes: [],
  },
  {
    id: "premium",
    label: "프리미엄 마감",
    category: "마감",
    price: 300,
    prices: { "51A": 330 },
    description: "상위",
    compatibleUnitTypes: ["51A"],
    requires: ["base"],
    requiresAny: [],
    excludes: ["alternative"],
  },
  {
    id: "alternative",
    label: "대체 마감",
    category: "마감",
    price: 200,
    prices: { "51A": 220 },
    description: "대체",
    compatibleUnitTypes: ["51A"],
    requires: [],
    requiresAny: [],
    excludes: ["premium"],
  },
  {
    id: "island-straight",
    label: "일자형 아일랜드",
    category: "주방",
    price: 1_000,
    prices: { "51A": 1_100, "55B": 1_500 },
    description: "일자형",
    compatibleUnitTypes: ["51A", "55B"],
    requires: [],
    requiresAny: [],
    excludes: [],
  },
  {
    id: "island-wide",
    label: "광폭 아일랜드",
    category: "주방",
    price: 1_400,
    prices: { "51A": 1_600, "55B": 1_900 },
    description: "광폭형",
    compatibleUnitTypes: ["51A", "55B"],
    requires: [],
    requiresAny: [],
    excludes: [],
  },
  {
    id: "oven",
    label: "빌트인 오븐",
    category: "가전",
    price: 500,
    prices: { "51A": 600, "55B": 900 },
    description: "아일랜드 설치 시 선택 가능",
    compatibleUnitTypes: ["51A", "55B"],
    requires: [],
    requiresAny: ["island-straight", "island-wide"],
    excludes: [],
  },
];

const catalog: ShowcaseCatalogV1 = {
  schemaVersion: 1,
  exportId: "test-export",
  generatedAt: "2026-08-27T00:00:00.000Z",
  maps: [makeMap("map-51a", "51A"), makeMap("map-55a", "55A")],
  characters: [],
  skills: [],
  defaultHotbar: [],
  bOptions: options,
};

const review = (overrides: Partial<LocalReviewV1> = {}): LocalReviewV1 => ({
  mapId: "map-51a",
  status: "unreviewed",
  notes: "",
  selectedOptionIds: ["base", "premium"],
  updatedAt: "2026-08-27T01:00:00.000Z",
  ...overrides,
});

describe("validateReviewBundle", () => {
  it("accepts an exported subset with valid dependencies", () => {
    const bundle = makeReviewBundle([review()], new Date("2026-08-27T02:00:00.000Z"));
    expect(validateReviewBundle(bundle, catalog)).toEqual({ ok: true, value: bundle });
  });

  it("rejects unknown maps and duplicate map reviews", () => {
    const bundle = makeReviewBundle([
      review({ mapId: "unknown" }),
      review({ mapId: "unknown" }),
    ]);
    const result = validateReviewBundle(bundle, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("현재 catalog에 없는 맵");
      expect(result.errors.join(" ")).toContain("mapId가 중복");
    }
  });

  it("rejects missing dependencies, conflicts and incompatible unit types", () => {
    const invalid = makeReviewBundle([
      review({ selectedOptionIds: ["premium", "alternative"] }),
      review({ mapId: "map-55a", selectedOptionIds: ["premium"] }),
    ]);
    const result = validateReviewBundle(invalid, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const message = result.errors.join(" ");
      expect(message).toContain("필수 옵션 base");
      expect(message).toContain("함께 선택할 수 없는");
      expect(message).toContain("55A 세대형과 호환되지 않습니다");
    }
  });

  it("accepts either island alternative for an oven and rejects an oven alone", () => {
    const valid = makeReviewBundle([
      review({ selectedOptionIds: ["island-wide", "oven"] }),
    ]);
    expect(validateReviewBundle(valid, catalog).ok).toBe(true);

    const invalid = makeReviewBundle([review({ selectedOptionIds: ["oven"] })]);
    const result = validateReviewBundle(invalid, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("대안 필수 옵션");
  });
});

describe("changeOptionSelection", () => {
  it("adds transitive requirements and removes conflicts", () => {
    const added = changeOptionSelection(["alternative"], "premium", true, "51A", options);
    expect(added.selectedOptionIds).toEqual(["base", "premium"]);
    expect(added.addedOptionIds).toEqual(["base", "premium"]);
    expect(added.removedOptionIds).toEqual(["alternative"]);
  });

  it("removes dependants when a required option is cleared", () => {
    const removed = changeOptionSelection(["base", "premium"], "base", false, "51A", options);
    expect(removed.selectedOptionIds).toEqual([]);
    expect(removed.removedOptionIds).toEqual(["base", "premium"]);
  });

  it("refuses options that do not support the map unit type", () => {
    expect(() => changeOptionSelection([], "premium", true, "55A", options)).toThrow(
      "호환되지 않습니다",
    );
  });

  it("selects the first deterministic any-dependency only when none is selected", () => {
    const initial = changeOptionSelection([], "oven", true, "51A", options);
    expect(initial.selectedOptionIds).toEqual(["island-straight", "oven"]);

    const switched = changeOptionSelection(
      ["island-straight", "island-wide", "oven"],
      "island-straight",
      false,
      "51A",
      options,
    );
    expect(switched.selectedOptionIds).toEqual(["island-wide", "oven"]);
  });

  it("removes an any-dependent only after its final alternative is removed", () => {
    const stillValid = changeOptionSelection(
      ["island-straight", "island-wide", "oven"],
      "island-straight",
      false,
      "51A",
      options,
    );
    expect(stillValid.selectedOptionIds).toContain("oven");

    const cascaded = changeOptionSelection(
      stillValid.selectedOptionIds,
      "island-wide",
      false,
      "51A",
      options,
    );
    expect(cascaded.selectedOptionIds).not.toContain("oven");
  });
});

it("sums the quote from known selected options only", () => {
  expect(optionQuote(["base", "premium", "unknown"], options)).toBe(400);
});

it("uses per-unit pricing with the fallback price when no unit price exists", () => {
  expect(optionQuote(["oven"], options, "51A")).toBe(600);
  expect(optionQuote(["oven"], options, "55B")).toBe(900);
  expect(optionQuote(["oven"], options, "59A")).toBe(500);
});
