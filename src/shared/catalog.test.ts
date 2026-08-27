import { describe, expect, it } from "vitest";
import { validateCatalog } from "./catalog";

const maps = ["51a", "55a", "55b", "59a"].map((unit) => ({
  id: `bundang-first-village-${unit}-prototype`,
  label: unit.toUpperCase(),
  unitType: unit.toUpperCase(),
  revision: "r1",
  width: 64,
  height: 64,
  chunkCount: 16,
  assetBytes: 10,
  renderer: "canvas2d",
  manifestUrl: `maps/${unit}/manifest.json`,
  minimapUrl: `maps/${unit}/minimap.png`,
  spawn: { x: 1, y: 1 },
}));

const validCatalog = {
  schemaVersion: 1,
  exportId: "abc123",
  generatedAt: "2026-08-27T00:00:00.000Z",
  maps,
  characters: [
    { key: "100", label: "100", manifestUrl: "characters/100/animation.json" },
    { key: "200", label: "200", manifestUrl: "characters/200/animation.json" },
  ],
  skills: [
    { id: "warrior-shock-stun" },
    { id: "common-double-arrow" },
    { id: "common-teleport" },
  ],
  defaultHotbar: ["basic-attack", "warrior-shock-stun", "common-double-arrow", "common-teleport", null, null, null, null],
  bOptions: [],
};

describe("validateCatalog", () => {
  it("accepts the selected four-map, two-character snapshot", () => {
    expect(validateCatalog(validCatalog).exportId).toBe("abc123");
  });

  it("rejects a snapshot missing a required map", () => {
    expect(() => validateCatalog({ ...validCatalog, maps: maps.slice(1) })).toThrow(/4종/);
  });
});
