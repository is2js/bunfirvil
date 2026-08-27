import { MAP_IDS, type ShowcaseCatalogV1 } from "./contracts";
import { assetUrl } from "./base";

let catalogPromise: Promise<ShowcaseCatalogV1> | undefined;

export function validateCatalog(value: unknown): ShowcaseCatalogV1 {
  if (!value || typeof value !== "object") {
    throw new Error("카탈로그가 JSON 객체가 아닙니다.");
  }
  const catalog = value as Partial<ShowcaseCatalogV1>;
  if (catalog.schemaVersion !== 1 || !catalog.exportId) {
    throw new Error("지원하지 않는 카탈로그 버전입니다.");
  }
  if (!Array.isArray(catalog.maps) || !Array.isArray(catalog.characters)) {
    throw new Error("카탈로그의 맵 또는 캐릭터 목록이 없습니다.");
  }
  const mapIds = catalog.maps.map((map) => map.id);
  if (MAP_IDS.some((id) => !mapIds.includes(id))) {
    throw new Error("필수 검수맵 4종이 모두 포함되어야 합니다.");
  }
  if (catalog.characters.map((actor) => actor.key).sort().join(",") !== "100,200") {
    throw new Error("캐릭터 100·200 manifest가 모두 필요합니다.");
  }
  if (!Array.isArray(catalog.skills) || catalog.skills.length !== 3) {
    throw new Error("선별 스킬 3종이 필요합니다.");
  }
  if (!Array.isArray(catalog.defaultHotbar) || catalog.defaultHotbar.length !== 4) {
    throw new Error("기본 핫바는 4칸이어야 합니다.");
  }
  if (catalog.defaultHotbar[0] !== "common-teleport") {
    throw new Error("기본 핫바 1번은 텔레포트여야 합니다.");
  }
  if (!Array.isArray(catalog.bOptions)) {
    catalog.bOptions = [];
  }
  return catalog as ShowcaseCatalogV1;
}

export function loadCatalog(): Promise<ShowcaseCatalogV1> {
  catalogPromise ??= fetch(assetUrl("generated/catalog.v1.json"), {
    headers: { Accept: "application/json" },
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`정적 카탈로그를 불러오지 못했습니다 (${response.status}).`);
    }
    return validateCatalog(await response.json());
  });
  return catalogPromise;
}
