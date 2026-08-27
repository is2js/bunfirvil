import { describe, expect, it } from "vitest";
import type { BOptionEntryV1 } from "./contracts";
import { validateReviewBundle } from "./storage";

const options: BOptionEntryV1[] = [
  {
    id: "base",
    label: "기본 마감",
    category: "마감",
    price: 0,
    description: "",
    compatibleUnitTypes: ["51A"],
    requires: [],
    excludes: [],
  },
  {
    id: "upgrade",
    label: "마감 업그레이드",
    category: "마감",
    price: 100,
    description: "",
    compatibleUnitTypes: ["51A"],
    requires: ["base"],
    excludes: [],
  },
];

describe("validateReviewBundle", () => {
  it("deduplicates selected options and keeps valid local review data", () => {
    const bundle = validateReviewBundle({
      schemaVersion: 1,
      exportedAt: "2026-08-27T00:00:00.000Z",
      reviews: [{
        mapId: "bundang-first-village-51a-prototype",
        status: "pass",
        notes: "확인",
        selectedOptionIds: ["base", "upgrade", "base"],
        updatedAt: "2026-08-27T00:00:00.000Z",
      }],
    }, options);
    expect(bundle.reviews[0]?.selectedOptionIds).toEqual(["base", "upgrade"]);
  });

  it("rejects a selection whose dependency is missing", () => {
    expect(() => validateReviewBundle({
      schemaVersion: 1,
      reviews: [{
        mapId: "bundang-first-village-51a-prototype",
        status: "unreviewed",
        notes: "",
        selectedOptionIds: ["upgrade"],
      }],
    }, options)).toThrow(/필수 옵션/);
  });
});
