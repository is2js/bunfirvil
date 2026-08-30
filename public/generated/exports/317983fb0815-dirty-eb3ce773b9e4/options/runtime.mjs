export const BUNDANG_OPTION_GROUPS = Object.freeze([
  Object.freeze({ id: "system-air-conditioner-upgrades", label: "시스템에어컨" }),
  Object.freeze({ id: "entry-living-upgrades", label: "현관/거실" }),
  Object.freeze({ id: "bathroom-upgrades", label: "욕실" }),
  Object.freeze({ id: "utility-upgrades", label: "발코니/다용도실" }),
  Object.freeze({ id: "kitchen-design-upgrades", label: "주방 벽/상판·냉장고장" }),
  Object.freeze({ id: "bedroom-storage-upgrades", label: "침실/수납" }),
  Object.freeze({ id: "lighting-upgrades", label: "조명특화" }),
  Object.freeze({ id: "built-in-appliance-upgrades", label: "빌트인 가전" }),
]);

const ALL_UNIT_TYPES = Object.freeze(["51A", "55A", "55B", "59A"]);
const commonPrice = (price) => Object.freeze(Object.fromEntries(ALL_UNIT_TYPES.map((unitType) => [unitType, price])));

export const BUNDANG_PAID_OPTIONS = Object.freeze([
  Object.freeze({ assetId: "system-ac-2-general", label: "시스템에어컨 2대 · 일반형", paletteLabel: "시스템에어컨 · 일반형", groupId: "system-air-conditioner-upgrades", prices: Object.freeze({ "51A": 3600000, "55A": 3600000, "55B": 3600000, "59A": 3800000 }), visualMode: "ceiling-ac", exclusiveGroup: "system-ac-package", systemAcTier: "general", systemAcCount: 2, systemAcPaletteCard: true }),
  Object.freeze({ assetId: "system-ac-2-premium", label: "시스템에어컨 2대 · 고급형", paletteLabel: "시스템에어컨 · 고급형", groupId: "system-air-conditioner-upgrades", prices: Object.freeze({ "51A": 4000000, "55A": 4000000, "55B": 4000000, "59A": 4200000 }), visualMode: "ceiling-ac", exclusiveGroup: "system-ac-package", systemAcTier: "premium", systemAcCount: 2, systemAcPaletteCard: true }),
  Object.freeze({ assetId: "system-ac-3-general", label: "시스템에어컨 3대 · 일반형", groupId: "system-air-conditioner-upgrades", prices: Object.freeze({ "51A": 5200000, "55A": 5200000, "55B": 5200000 }), visualMode: "ceiling-ac", exclusiveGroup: "system-ac-package", systemAcTier: "general", systemAcCount: 3, systemAcPaletteCard: false }),
  Object.freeze({ assetId: "system-ac-3-premium", label: "시스템에어컨 3대 · 고급형", groupId: "system-air-conditioner-upgrades", prices: Object.freeze({ "51A": 5800000, "55A": 5800000, "55B": 5800000 }), visualMode: "ceiling-ac", exclusiveGroup: "system-ac-package", systemAcTier: "premium", systemAcCount: 3, systemAcPaletteCard: false }),
  Object.freeze({ assetId: "system-ac-4-general", label: "시스템에어컨 4대 · 일반형", groupId: "system-air-conditioner-upgrades", prices: Object.freeze({ "55A": 6600000, "55B": 6600000, "59A": 6800000 }), visualMode: "ceiling-ac", exclusiveGroup: "system-ac-package", systemAcTier: "general", systemAcCount: 4, systemAcPaletteCard: false }),
  Object.freeze({ assetId: "system-ac-4-premium", label: "시스템에어컨 4대 · 고급형", groupId: "system-air-conditioner-upgrades", prices: Object.freeze({ "55A": 7400000, "55B": 7400000, "59A": 7600000 }), visualMode: "ceiling-ac", exclusiveGroup: "system-ac-package", systemAcTier: "premium", systemAcCount: 4, systemAcPaletteCard: false }),
  Object.freeze({ assetId: "entry-sliding-partition-door", label: "현관 중문(슬라이딩)", groupId: "entry-living-upgrades", prices: commonPrice(1500000), visualMode: "entry-door" }),
  Object.freeze({ assetId: "wide-plank-floor-finish", label: "광폭 강마루", groupId: "entry-living-upgrades", prices: Object.freeze({ "51A": 1680000, "55A": 1820000, "55B": 1710000, "59A": 1940000 }), visualMode: "room-finish" }),
  Object.freeze({ assetId: "entry-open-premium-shoe-cabinet", label: "개방형 프리미엄 신발장", groupId: "entry-living-upgrades", prices: Object.freeze({ "55A": 1340000, "55B": 1340000, "59A": 1340000 }), visualMode: "entry-storage" }),
  Object.freeze({ assetId: "entry-pantry-system-shelf", label: "현관 팬트리 시스템 선반", groupId: "entry-living-upgrades", prices: Object.freeze({ "55A": 490000, "55B": 490000, "59A": 510000 }), visualMode: "entry-storage" }),
  Object.freeze({ assetId: "living-design-wall-panel", label: "거실 디자인월 패널", groupId: "entry-living-upgrades", prices: Object.freeze({ "51A": 920000, "55A": 1110000, "55B": 1540000, "59A": 1260000 }), priceVariants: Object.freeze([{ whenSelectedAny: Object.freeze(["island-counter-modern", "island-counter-dining-integrated"]), prices: Object.freeze({ "55B": 1600000 }) }]), visualMode: "living-wall" }),
  Object.freeze({ assetId: "infinity-door-bedroom-1", label: "침실1 인피니티 도어", groupId: "entry-living-upgrades", prices: commonPrice(1350000), visualMode: "infinity-door", exclusiveGroup: "infinity-door-package" }),
  Object.freeze({ assetId: "infinity-door-all-bedrooms", label: "전체 침실 인피니티 도어", groupId: "entry-living-upgrades", prices: Object.freeze({ "51A": 4050000, "55A": 5400000, "55B": 5400000, "59A": 5400000 }), visualMode: "infinity-door", requires: "living-design-wall-panel", exclusiveGroup: "infinity-door-package" }),
  Object.freeze({ assetId: "bathroom-combination-ventilator", label: "복합환풍기(전체 욕실)", groupId: "bathroom-upgrades", prices: commonPrice(1300000), visualMode: "bathroom-ceiling" }),
  Object.freeze({ assetId: "toilet-integrated-bidet", label: "비데일체형 양변기(전체 욕실)", groupId: "bathroom-upgrades", prices: commonPrice(830000), visualMode: "bathroom-replace" }),
  Object.freeze({ assetId: "utility-ceramic-elastic-coat", label: "세라믹 탄성코트", groupId: "utility-upgrades", prices: Object.freeze({ "51A": 800000, "55A": 800000, "55B": 880000, "59A": 800000 }), visualMode: "deferred" }),
  Object.freeze({ assetId: "bedroom-1-built-in-closet-pet", label: "침실1 광폭 붙박이장(PET)", groupId: "bedroom-storage-upgrades", prices: commonPrice(2370000), visualMode: "bedroom-storage", exclusiveGroup: "bedroom-1-closet" }),
  Object.freeze({ assetId: "bedroom-1-clothing-care-closet", label: "침실1 의류관리형 붙박이장", groupId: "bedroom-storage-upgrades", prices: commonPrice(2020000), visualMode: "bedroom-storage", exclusiveGroup: "bedroom-1-closet" }),
  Object.freeze({ assetId: "dress-room-powder-storage", label: "드레스룸 파우더 결합형 수납장", groupId: "bedroom-storage-upgrades", prices: Object.freeze({ "51A": 3400000, "55A": 3400000, "55B": 3200000, "59A": 3400000 }), visualMode: "bedroom-storage" }),
  Object.freeze({ assetId: "bedroom-2-built-in-closet-pet", label: "침실2 붙박이장(PET)", groupId: "bedroom-storage-upgrades", prices: Object.freeze({ "51A": 1240000, "55A": 1300000, "55B": 1300000, "59A": 1240000 }), visualMode: "bedroom-storage", exclusiveGroup: "bedroom-2-closet" }),
  Object.freeze({ assetId: "bedroom-2-closet-desk-set", label: "침실2 붙박이장 + 책상", groupId: "bedroom-storage-upgrades", prices: Object.freeze({ "51A": 3880000, "55A": 3620000, "55B": 3540000, "59A": 3620000 }), visualMode: "bedroom-storage", exclusiveGroup: "bedroom-2-closet" }),
  Object.freeze({ assetId: "bedroom-3-built-in-closet-pet", label: "침실3 붙박이장(PET)", groupId: "bedroom-storage-upgrades", prices: Object.freeze({ "59A": 1240000 }), visualMode: "bedroom-storage", exclusiveGroup: "bedroom-3-closet" }),
  Object.freeze({ assetId: "bedroom-3-closet-desk-set", label: "침실3 붙박이장 + 책상", groupId: "bedroom-storage-upgrades", prices: Object.freeze({ "59A": 3620000 }), visualMode: "bedroom-storage", exclusiveGroup: "bedroom-3-closet" }),
  Object.freeze({ assetId: "smart-lighting-package", label: "스마트 조명 특화", groupId: "lighting-upgrades", prices: Object.freeze({ "51A": 3580000, "55A": 4380000, "55B": 3880000, "59A": 4420000 }), visualMode: "smart-lighting" }),
  Object.freeze({ assetId: "air-planner-ceiling-vent", label: "D-에어플래너 + 침실 스마트 디스플레이", groupId: "built-in-appliance-upgrades", prices: commonPrice(4980000), priceVariants: Object.freeze([{ whenSelectedAny: Object.freeze(["smart-lighting-package"]), prices: commonPrice(4830000) }]), visualMode: "manual" }),
  Object.freeze({ assetId: "closet-breeze-dehumidifier", label: "D-클로젯 브리즈", groupId: "built-in-appliance-upgrades", prices: commonPrice(1500000), priceVariants: Object.freeze([{ whenSelectedAny: Object.freeze(["dress-room-powder-storage"]), prices: commonPrice(1800000) }]), visualMode: "manual" }),
  Object.freeze({ assetId: "silent-range-hood", label: "D-사일런트 후드", groupId: "built-in-appliance-upgrades", prices: commonPrice(780000), visualMode: "manual" }),
  Object.freeze({ assetId: "dishwasher-built-in-die6pt", label: "LG DIE6PT 빌트인 식기세척기 + 콘센트", groupId: "built-in-appliance-upgrades", prices: commonPrice(1650000), visualMode: "manual" }),
  Object.freeze({ assetId: "electric-cooktop-erh-3903", label: "ERH-3903 전기쿡탑", groupId: "built-in-appliance-upgrades", prices: commonPrice(580000), visualMode: "manual", exclusiveGroup: "cooktop" }),
  Object.freeze({ assetId: "induction-cooktop-nz63b5056ak", label: "삼성 NZ63B5056AK 인덕션", groupId: "built-in-appliance-upgrades", prices: commonPrice(950000), visualMode: "manual", exclusiveGroup: "cooktop" }),
  Object.freeze({ assetId: "induction-cooktop-bei3asb4bi", label: "LG BEI3ASB4BI 인덕션", groupId: "built-in-appliance-upgrades", prices: commonPrice(1000000), visualMode: "manual", exclusiveGroup: "cooktop" }),
  Object.freeze({ assetId: "lg-styler-sc5mbr53", label: "LG 스타일러 SC5MBR53", groupId: "built-in-appliance-upgrades", prices: commonPrice(1800000), visualMode: "bedroom-appliance", requires: "bedroom-1-clothing-care-closet" }),
  Object.freeze({ assetId: "built-in-oven-navien", label: "경동나비엔 빌트인 오븐", groupId: "built-in-appliance-upgrades", prices: commonPrice(650000), visualMode: "kitchen-appliance", requiresAny: Object.freeze(["island-counter-modern", "island-counter-dining-integrated"]), exclusiveGroup: "built-in-oven" }),
  Object.freeze({ assetId: "built-in-oven-samsung", label: "삼성 빌트인 오븐", groupId: "built-in-appliance-upgrades", prices: commonPrice(900000), visualMode: "kitchen-appliance", requiresAny: Object.freeze(["island-counter-modern", "island-counter-dining-integrated"]), exclusiveGroup: "built-in-oven" }),
  Object.freeze({ assetId: "built-in-oven-lg", label: "LG 빌트인 오븐", groupId: "built-in-appliance-upgrades", prices: commonPrice(480000), visualMode: "kitchen-appliance", requiresAny: Object.freeze(["island-counter-modern", "island-counter-dining-integrated"]), exclusiveGroup: "built-in-oven" }),
]);

export const BUNDANG_DESIGN_OPTIONS = Object.freeze([
  Object.freeze({
    assetId: "island-counter-modern",
    label: "아일랜드장(PET)",
    groupId: "kitchen-design-upgrades",
    visualMode: "kitchen-island",
    prices: Object.freeze({ "51A": 1270000, "55A": 1270000, "55B": 1300000, "59A": 1270000 }),
    priceVariants: Object.freeze([{ whenSelectedAny: Object.freeze(["kitchen-wall-countertop-radianz-golden-shore"]), prices: Object.freeze({ "51A": 1410000, "55A": 1410000, "55B": 1430000, "59A": 1410000 }) }]),
    exclusiveGroup: "kitchen-island",
    evidence: "official-option-calculator",
  }),
  Object.freeze({
    assetId: "island-counter-dining-integrated",
    label: "식탁결합형 아일랜드장(PET)",
    groupId: "kitchen-design-upgrades",
    visualMode: "kitchen-island",
    prices: Object.freeze({ "55B": 2220000 }),
    priceVariants: Object.freeze([{ whenSelectedAny: Object.freeze(["kitchen-wall-countertop-radianz-golden-shore"]), prices: Object.freeze({ "55B": 2490000 }) }]),
    exclusiveGroup: "kitchen-island",
    availableUnitTypes: Object.freeze(["55B"]),
    evidence: "official-option-calculator",
  }),
  Object.freeze({
    assetId: "kitchen-wall-countertop-radianz-golden-shore",
    label: "주방 벽/상판 · 엔지니어드 스톤(라디언스 골든쇼어)",
    groupId: "kitchen-design-upgrades",
    visualMode: "kitchen-surface",
    prices: Object.freeze({ "51A": 4080000, "55A": 3780000, "55B": 3070000, "59A": 3930000 }),
    evidence: "official-option-calculator-and-showroom-photo",
  }),
  Object.freeze({
    assetId: "refrigerator-cabinet-pet-basic",
    label: "냉장고장 기본형(PET) · ALT.1",
    groupId: "kitchen-design-upgrades",
    visualMode: "refrigerator-cabinet",
    prices: commonPrice(1200000),
    evidence: "official-option-calculator-and-showroom-photo",
  }),
  Object.freeze({
    assetId: "refrigerator-cabinet-bespoke-alt2",
    label: "삼성 비스포크 냉장고 패키지 · ALT.2",
    groupId: "built-in-appliance-upgrades",
    visualMode: "refrigerator-cabinet",
    prices: commonPrice(6430000),
    requires: "refrigerator-cabinet-pet-basic",
    exclusiveGroup: "built-in-refrigerator-package",
    evidence: "official-option-calculator-and-showroom-photo",
  }),
  Object.freeze({
    assetId: "refrigerator-cabinet-lg-built-in",
    label: "LG 빌트인 냉장고 패키지 · ALT.3",
    groupId: "built-in-appliance-upgrades",
    visualMode: "refrigerator-cabinet",
    prices: commonPrice(7550000),
    requires: "refrigerator-cabinet-pet-basic",
    exclusiveGroup: "built-in-refrigerator-package",
    evidence: "official-option-calculator",
  }),
]);

export const BUNDANG_OPTION_ROWS = Object.freeze([...BUNDANG_PAID_OPTIONS, ...BUNDANG_DESIGN_OPTIONS]);

const BY_ASSET_ID = new Map(BUNDANG_OPTION_ROWS.map((option) => [option.assetId, option]));

export const BUNDANG_OPTION_CAUTIONS = Object.freeze([
  "타입·평면·설치 위치에 따라 적용 형태가 달라질 수 있습니다.",
  "제품 모델·색상·설치 위치는 개별 변경할 수 없습니다.",
  "복합환풍기 선택 시 기본 환풍기, 비데일체형 양변기 선택 시 기본 비데 구성은 설치되지 않습니다.",
  "계약한 추가 선택품목은 이후 변경·취소할 수 없습니다.",
]);

export function bundangInspectionUnitType(worldId = "") {
  return String(worldId || "").match(/^bundang-first-village-(51a|55a|55b|59a)(?:-plan-b)?-prototype$/i)?.[1]?.toUpperCase?.() || "";
}

export function bundangOptionDefinition(assetId = "") {
  return BY_ASSET_ID.get(String(assetId || "")) || null;
}

export function bundangSystemAcPackage(assetId = "") {
  const option = bundangOptionDefinition(assetId);
  if (!option?.systemAcTier || !Number(option?.systemAcCount)) return null;
  return Object.freeze({
    assetId: option.assetId,
    tier: String(option.systemAcTier),
    count: Number(option.systemAcCount),
    paletteAssetId: `system-ac-2-${option.systemAcTier}`,
  });
}

export function bundangSystemAcPackageAssetId(tier = "", count = 0, unitTypeId = "") {
  const assetId = `system-ac-${Number(count) || 0}-${String(tier || "").toLowerCase()}`;
  return bundangOptionAvailableForUnit(assetId, unitTypeId) ? assetId : "";
}

export function bundangSelectedSystemAcPackage(selectedIds = []) {
  for (const assetId of selectedIds || []) {
    const packageRow = bundangSystemAcPackage(assetId);
    if (packageRow) return packageRow;
  }
  return null;
}

export function bundangOptionAvailableForUnit(optionOrAssetId = "", unitTypeId = "") {
  const option = typeof optionOrAssetId === "string"
    ? bundangOptionDefinition(optionOrAssetId)
    : optionOrAssetId;
  const available = Array.isArray(option?.availableUnitTypes)
    ? option.availableUnitTypes
    : Object.keys(option?.prices || {});
  return available.includes(String(unitTypeId || "").toUpperCase());
}

export function bundangOptionPrice(assetId = "", unitTypeId = "", selectedIds = []) {
  const option = bundangOptionDefinition(assetId);
  const unitType = String(unitTypeId || "").toUpperCase();
  const selected = new Set([...selectedIds].map(String));
  const variant = (Array.isArray(option?.priceVariants) ? option.priceVariants : [])
    .find((row) => Array.isArray(row?.whenSelectedAny) && row.whenSelectedAny.some((id) => selected.has(String(id))));
  return Number(variant?.prices?.[unitType] ?? option?.prices?.[unitType] ?? 0);
}

function bundangOptionRequirementIds(option = {}) {
  const required = Array.isArray(option?.requires) ? option.requires : option?.requires ? [option.requires] : [];
  return [...required, ...(Array.isArray(option?.requiresAll) ? option.requiresAll : [])].map(String);
}

function bundangOptionRequirementsSatisfied(option = {}, selected = new Set()) {
  if (!bundangOptionRequirementIds(option).every((id) => selected.has(id))) return false;
  const any = Array.isArray(option?.requiresAny) ? option.requiresAny.map(String) : [];
  return !any.length || any.some((id) => selected.has(id));
}

function cascadeInvalidDependents(selected = new Set(), removed = []) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of BUNDANG_OPTION_ROWS) {
      if (selected.has(row.assetId) && !bundangOptionRequirementsSatisfied(row, selected)) {
        selected.delete(row.assetId);
        removed.push(row.assetId);
        changed = true;
      }
    }
  }
  return removed;
}

export function bundangOptionSelectionIntent(selectedIds = [], assetId = "") {
  const option = bundangOptionDefinition(assetId);
  const selected = new Set([...selectedIds].map(String));
  if (!option) return Object.freeze({ kind: "invalid", nextSelection: selected, requiresToAdd: [], dependentsToRemove: [], exclusivesToRemove: [] });
  if (selected.has(option.assetId)) {
    selected.delete(option.assetId);
    const dependentsToRemove = cascadeInvalidDependents(selected, []);
    return Object.freeze({ kind: "deselect", option, nextSelection: selected, requiresToAdd: [], dependentsToRemove, exclusivesToRemove: [] });
  }
  const exclusivesToRemove = [];
  if (option.exclusiveGroup) {
    for (const other of BUNDANG_OPTION_ROWS) {
      if (other.exclusiveGroup === option.exclusiveGroup && other.assetId !== option.requires && selected.delete(other.assetId)) {
        exclusivesToRemove.push(other.assetId);
      }
    }
  }
  const requiresToAdd = bundangOptionRequirementIds(option).filter((id) => !selected.has(id));
  const requiresAny = Array.isArray(option.requiresAny) ? option.requiresAny.map(String) : [];
  if (requiresAny.length && !requiresAny.some((id) => selected.has(id))) requiresToAdd.push(requiresAny[0]);
  requiresToAdd.forEach((id) => selected.add(id));
  selected.add(option.assetId);
  return Object.freeze({ kind: "select", option, nextSelection: selected, requiresToAdd, dependentsToRemove: [], exclusivesToRemove });
}

export function toggleBundangOptionSelection(selectedIds = [], assetId = "") {
  return bundangOptionSelectionIntent(selectedIds, assetId).nextSelection;
}

export function bundangOptionQuote(selectedIds = [], unitTypeId = "") {
  const unitType = String(unitTypeId || "").toUpperCase();
  const selected = new Set([...selectedIds].map(String));
  const lines = BUNDANG_OPTION_ROWS
    .filter((option) => selected.has(option.assetId))
    .map((option) => ({ ...option, price: bundangOptionPrice(option.assetId, unitType, selected) }))
    .filter((option) => option.price > 0 || option.priceStatus === "pending");
  return Object.freeze({ unitTypeId: unitType, lines, total: lines.reduce((sum, option) => sum + option.price, 0) });
}

export const BUNDANG_VIRTUAL_OPTION_ASSETS = Object.freeze([
  Object.freeze({
    assetId: "island-counter-dining-integrated", revision: "2", displayNameKo: "식탁결합형 아일랜드장(PET)", descriptionKo: "1.26m 아일랜드장과 더 짧은 1.20m 단차형 PET 식탁을 연결한 선택형 구성", roomCategoryIds: ["kitchen"], allowedRoomKinds: ["kitchen-dining"], rendererKind: "procedural", collisionDefault: "solid", placeable: true, option: true, badges: ["option"], defaultDimensionsMeters: { width: 2.46, depth: 0.8, height: 0.9 }, defaultMaterialVariantId: "pet-warm-ivory",
  }),
  Object.freeze({
    assetId: "kitchen-wall-countertop-default", revision: "1", displayNameKo: "기본 주방 벽/상판", descriptionKo: "패널형 주방 벽과 MMA 샌디드 구스 기본 상판", roomCategoryIds: ["kitchen"], allowedRoomKinds: ["kitchen-dining"], rendererKind: "procedural", collisionDefault: "visual-only", placeable: false, defaultDimensionsMeters: { width: 2.2, depth: 0.65, height: 1.45 }, defaultMaterialVariantId: "mma-sanded-goose-panel",
  }),
  Object.freeze({
    assetId: "kitchen-wall-countertop-radianz-golden-shore", revision: "1", displayNameKo: "엔지니어드 스톤 주방 벽/상판", descriptionKo: "라디언스 골든쇼어 질감의 밝은 웜그레이 주방 벽·상판 오버레이", roomCategoryIds: ["kitchen"], allowedRoomKinds: ["kitchen-dining"], rendererKind: "procedural", collisionDefault: "visual-only", placeable: true, option: true, badges: ["option"], defaultDimensionsMeters: { width: 2.2, depth: 0.65, height: 1.45 }, defaultMaterialVariantId: "golden-shore-engineered-stone",
  }),
  Object.freeze({
    assetId: "refrigerator-cabinet-pet-basic", revision: "1", displayNameKo: "냉장고장 기본형(PET)", descriptionKo: "냉장고 설치 빈자리를 감싸는 PET 냉장고장 ALT.1", roomCategoryIds: ["kitchen"], allowedRoomKinds: ["kitchen-dining"], rendererKind: "procedural", collisionDefault: "solid", placeable: true, option: true, badges: ["option"], defaultDimensionsMeters: { width: 1.35, depth: 0.72, height: 2.2 }, defaultMaterialVariantId: "pet-warm-ivory",
  }),
  Object.freeze({
    assetId: "refrigerator-cabinet-bespoke-alt2", revision: "1", displayNameKo: "비스포크 맞춤 냉장고장(PET)", descriptionKo: "변온·김치·키큰 수납장과 가전 맞춤장을 결합한 ALT.2", roomCategoryIds: ["kitchen"], allowedRoomKinds: ["kitchen-dining"], rendererKind: "procedural", collisionDefault: "solid", placeable: true, option: true, badges: ["option"], defaultDimensionsMeters: { width: 2.45, depth: 0.72, height: 2.2 }, defaultMaterialVariantId: "pet-warm-ivory",
  }),
  Object.freeze({
    assetId: "refrigerator-cabinet-lg-built-in", revision: "1", displayNameKo: "LG 오브제 맞춤 냉장고장(PET)", descriptionKo: "4도어 냉장고·3도어 김치냉장고와 키큰 수납장을 결합한 ALT.3", roomCategoryIds: ["kitchen"], allowedRoomKinds: ["kitchen-dining"], rendererKind: "procedural", collisionDefault: "solid", placeable: true, option: true, badges: ["option"], defaultDimensionsMeters: { width: 2.45, depth: 0.72, height: 2.2 }, defaultMaterialVariantId: "pet-warm-ivory",
  }),
  Object.freeze({
    assetId: "shower-column-compact", revision: "1", displayNameKo: "욕실 샤워 수전", descriptionKo: "설비벽에 부착하는 소형 샤워기", roomCategoryIds: ["bathroom"], allowedRoomKinds: ["bathroom-1", "bathroom-2"], rendererKind: "procedural", collisionDefault: "visual-only", placeable: false, defaultDimensionsMeters: { width: 0.24, depth: 0.18, height: 1.45 }, defaultMaterialVariantId: "brushed-chrome",
  }),
  ...[
    ["kitchen-countertop-default-run", "기본 주방 상판", "mma-sanded-goose"],
    ["kitchen-backsplash-default-run", "기본 주방 벽 마감", "mma-sanded-goose-panel"],
    ["kitchen-countertop-radianz-run", "골든쇼어 주방 상판", "golden-shore-engineered-stone"],
    ["kitchen-backsplash-radianz-run", "골든쇼어 주방 벽 마감", "golden-shore-engineered-stone"],
  ].map(([assetId, displayNameKo, defaultMaterialVariantId]) => Object.freeze({
    assetId, revision: "1", displayNameKo, descriptionKo: "평면 원형의 주방 하부장 앵커에만 사용하는 내부 구조물", roomCategoryIds: ["kitchen"], allowedRoomKinds: ["kitchen-dining"], rendererKind: "procedural", collisionDefault: "visual-only", placeable: false, defaultDimensionsMeters: { width: 1, depth: 0.6, height: 0.06 }, defaultMaterialVariantId,
  })),
]);

const rounded = (value) => Number(Number(value || 0).toFixed(3));

function roomBounds(room = {}) {
  if (!room || typeof room !== "object") return null;
  const values = Array.isArray(room.boundsMeters) ? room.boundsMeters : room.bounds;
  if (!Array.isArray(values) || values.length < 4) return null;
  const [x1, y1, x2, y2] = values.map(Number);
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

function roomsOf(geometry = {}) {
  return Array.isArray(geometry?.roomZones) ? geometry.roomZones : [];
}

function roomById(geometry = {}, roomId = "") {
  return roomsOf(geometry).find((room) => String(room.id || room.roomId || "") === roomId) || null;
}

function prop({ id, assetId, roomZoneId, position, dimensions, yawDeg = 0, mirrored = false, materialVariantId = "", mountHeightMeters, anchorId = "", installationRole = "" }) {
  return {
    schemaVersion: "bundang-interior-prop-v2",
    id,
    assetId,
    assetRevision: "1",
    roomZoneId,
    positionMeters: position.map(rounded),
    yawDeg,
    mirrored: mirrored === true,
    materialVariantId,
    dimensionsMeters: dimensions.map(rounded),
    ...(Number.isFinite(Number(mountHeightMeters)) ? { mountHeightMeters: rounded(mountHeightMeters) } : {}),
    ...(anchorId ? { anchorId } : {}),
    ...(installationRole ? { installationRole } : {}),
  };
}

function bathroomFixtureProps(geometry = {}, unitTypeId = "", useIntegratedBidet = false) {
  const unit = String(unitTypeId || "").toUpperCase();
  const bathroomAnchors = geometry?.optionAnchors?.bathrooms || {};
  const result = [];
  for (const [id, anchors] of Object.entries(bathroomAnchors)) {
    const wetFixture = anchors?.wetFixture || anchors?.shower;
    if (!anchors?.toilet || !anchors?.basin || !wetFixture) continue;
    const wetAssetId = String(wetFixture.assetId || "shower-column-compact");
    const wetDimensions = Array.isArray(wetFixture.dimensionsMeters)
      ? wetFixture.dimensionsMeters
      : (wetAssetId === "bathtub-built-in" ? [1.7, 0.75, 0.55] : [0.24, 0.18, 1.45]);
    result.push(
      prop({
        id: `inspection-${unit}-${id}-toilet`,
        assetId: useIntegratedBidet ? "toilet-integrated-bidet" : "toilet-floor-mounted",
        roomZoneId: id,
        position: anchors.toilet.positionMeters,
        dimensions: useIntegratedBidet ? [0.42, 0.72, 0.72] : [0.4, 0.7, 0.75],
        yawDeg: anchors.toilet.yawDeg,
        materialVariantId: useIntegratedBidet ? "integrated-bidet-white" : "ceramic-white",
        anchorId: `${id}.toilet`,
        installationRole: "bathroom-base-fixture",
      }),
      prop({
        id: `inspection-${unit}-${id}-basin`,
        assetId: "vanity-basin-compact",
        roomZoneId: id,
        position: anchors.basin.positionMeters,
        dimensions: Array.isArray(anchors.basin.dimensionsMeters) ? anchors.basin.dimensionsMeters : [0.8, 0.5, 0.85],
        yawDeg: anchors.basin.yawDeg,
        materialVariantId: "ceramic-white",
        anchorId: `${id}.basin`,
        installationRole: "bathroom-base-fixture",
      }),
      prop({
        id: `inspection-${unit}-${id}-wet-fixture`,
        assetId: wetAssetId,
        roomZoneId: id,
        position: wetFixture.positionMeters,
        dimensions: wetDimensions,
        yawDeg: wetFixture.yawDeg,
        mirrored: wetFixture.mirrored === true,
        materialVariantId: wetAssetId === "bathtub-built-in" ? "ceramic-white" : "clear-glass-chrome",
        anchorId: `${id}.wetFixture`,
        installationRole: "bathroom-base-fixture",
      }),
    );
  }
  return result;
}

function pointInsidePolygon(point = [0, 0], polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [x1, y1] = polygon[index].map(Number);
    const [x2, y2] = polygon[previous].map(Number);
    const crosses = ((y1 > point[1]) !== (y2 > point[1]))
      && point[0] < ((x2 - x1) * (point[1] - y1)) / ((y2 - y1) || Number.EPSILON) + x1;
    if (crosses) inside = !inside;
  }
  return inside;
}

function rectanglePolygon(bounds = []) {
  if (!Array.isArray(bounds) || bounds.length < 4) return [];
  const [x1, y1, x2, y2] = bounds.map(Number);
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

function continuousWoodFloorRectangles(geometry = {}) {
  const floorPolygon = Array.isArray(geometry?.floorPolygon) ? geometry.floorPolygon : [];
  if (floorPolygon.length < 3) return [];
  const exclusions = [
    ...roomsOf(geometry)
      .filter((room) => String(room.material || "").toLowerCase() !== "wood")
      .map((room) => rectanglePolygon(roomBounds(room))),
    ...(Array.isArray(geometry?.solidBlocks) ? geometry.solidBlocks : [])
      .map((block) => Array.isArray(block?.footprintPolygonMeters)
        ? block.footprintPolygonMeters
        : rectanglePolygon(block?.boundsMeters || block?.bounds)),
  ].filter((polygon) => polygon.length >= 3);
  const xBreaks = new Set(floorPolygon.map(([x]) => Number(x)));
  const yBreaks = new Set(floorPolygon.map(([, y]) => Number(y)));
  exclusions.forEach((polygon) => polygon.forEach(([x, y]) => {
    xBreaks.add(Number(x));
    yBreaks.add(Number(y));
  }));
  const xs = [...xBreaks].sort((left, right) => left - right);
  const ys = [...yBreaks].sort((left, right) => left - right);
  const completed = [];
  let active = new Map();
  for (let row = 0; row < ys.length - 1; row += 1) {
    const y1 = ys[row];
    const y2 = ys[row + 1];
    const spans = [];
    let open = null;
    for (let column = 0; column < xs.length - 1; column += 1) {
      const x1 = xs[column];
      const x2 = xs[column + 1];
      const midpoint = [(x1 + x2) / 2, (y1 + y2) / 2];
      const covered = pointInsidePolygon(midpoint, floorPolygon)
        && !exclusions.some((polygon) => pointInsidePolygon(midpoint, polygon));
      if (covered && open) open[2] = x2;
      else if (covered) open = [x1, y1, x2, y2];
      else if (open) {
        spans.push(open);
        open = null;
      }
    }
    if (open) spans.push(open);
    const next = new Map();
    spans.forEach(([x1, , x2]) => {
      const key = `${rounded(x1)}:${rounded(x2)}`;
      const previous = active.get(key);
      if (previous && Math.abs(previous[3] - y1) < 0.0001) {
        previous[3] = y2;
        next.set(key, previous);
      } else {
        next.set(key, [x1, y1, x2, y2]);
      }
    });
    active.forEach((bounds, key) => {
      if (!next.has(key)) completed.push(bounds);
    });
    active = next;
  }
  active.forEach((bounds) => completed.push(bounds));
  return completed.filter(([x1, y1, x2, y2]) => x2 - x1 >= 0.05 && y2 - y1 >= 0.05);
}

function roomFinishProps(geometry = {}, unitTypeId = "") {
  const unit = String(unitTypeId || "").toUpperCase();
  return continuousWoodFloorRectangles(geometry).map(([x1, y1, x2, y2], index) => prop({
    id: `inspection-${unit}-continuous-wide-plank-floor-${index + 1}`,
    assetId: "wide-plank-floor-finish",
    roomZoneId: "wood-floor-continuous",
    position: [(x1 + x2) / 2, (y1 + y2) / 2],
    dimensions: [x2 - x1, y2 - y1, 0.012],
    materialVariantId: "e-pyeonhansesang-wide-greige-oak",
    anchorId: `floorPolygon.wood.${index}`,
    installationRole: "continuous-wood-floor-finish",
  }));
}

function entryDoorProp(geometry = {}, unitTypeId = "") {
  const anchor = geometry?.optionAnchors?.entryPartition;
  if (!Array.isArray(anchor?.startMeters) || !Array.isArray(anchor?.endMeters)) return [];
  const unit = String(unitTypeId || "").toUpperCase();
  const [x1, y1] = anchor.startMeters.map(Number);
  const [x2, y2] = anchor.endMeters.map(Number);
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (!Number.isFinite(length) || length <= 0.24) return [];
  const tangentX = (x2 - x1) / length;
  const tangentY = (y2 - y1) / length;
  const normalX = -tangentY;
  const normalY = tangentX;
  const entryBounds = roomBounds(roomById(geometry, String(anchor?.roomZoneId || "entry")));
  const entryCenter = entryBounds
    ? [(entryBounds[0] + entryBounds[2]) / 2, (entryBounds[1] + entryBounds[3]) / 2]
    : [(x1 + x2) / 2, (y1 + y2) / 2];
  const wallSegments = Array.isArray(geometry?.wallSegments) ? geometry.wallSegments : [];
  const pointDistance = (a = [], b = []) => Math.hypot(Number(a[0]) - Number(b[0]), Number(a[1]) - Number(b[1]));
  const endpointTolerance = 0.025;
  let usableStart = 0;
  let usableEnd = length;
  let adjacentWallThicknessMeters = 0.12;

  for (const wall of wallSegments) {
    if (!Array.isArray(wall?.a) || !Array.isArray(wall?.b)) continue;
    const a = wall.a.map(Number);
    const b = wall.b.map(Number);
    const thickness = Math.max(0, Number(wall?.thicknessMeters || 0));
    const touchesOpeningEnd = [a, b].some((point) => (
      pointDistance(point, [x1, y1]) <= endpointTolerance
      || pointDistance(point, [x2, y2]) <= endpointTolerance
    ));
    if (touchesOpeningEnd) adjacentWallThicknessMeters = Math.max(adjacentWallThicknessMeters, thickness);

    const aNormal = (a[0] - x1) * normalX + (a[1] - y1) * normalY;
    const bNormal = (b[0] - x1) * normalX + (b[1] - y1) * normalY;
    if (Math.max(Math.abs(aNormal), Math.abs(bNormal)) > endpointTolerance) continue;
    const interval = [
      (a[0] - x1) * tangentX + (a[1] - y1) * tangentY,
      (b[0] - x1) * tangentX + (b[1] - y1) * tangentY,
    ].sort((left, right) => left - right);
    // Clip authored wall segments that accidentally occupy either end of the
    // nominal partition anchor. 51A used to retain 0.25 m of its short return.
    if (interval[0] > endpointTolerance && interval[0] < usableEnd && interval[1] >= length - endpointTolerance) {
      usableEnd = Math.min(usableEnd, interval[0]);
    }
    if (interval[1] < length - endpointTolerance && interval[1] > usableStart && interval[0] <= endpointTolerance) {
      usableStart = Math.max(usableStart, interval[1]);
    }
  }

  const usableLength = Math.max(0, usableEnd - usableStart);
  if (usableLength <= 0.24) return [];
  const usableMidpointDistance = (usableStart + usableEnd) / 2;
  const midpoint = [
    x1 + tangentX * usableMidpointDistance,
    y1 + tangentY * usableMidpointDistance,
  ];
  const entryNormalProjection = (entryCenter[0] - midpoint[0]) * normalX
    + (entryCenter[1] - midpoint[1]) * normalY;
  // The rail belongs on the corridor face, not inside either wing wall. Keep
  // the source anchor as the opening contract, then inset the frame at both
  // jambs and offset it to the side opposite the entry floor.
  const corridorNormalSign = entryNormalProjection >= 0 ? -1 : 1;
  const wallClearanceMeters = Math.min(0.08, Math.max(0.04, usableLength * 0.06));
  const doorDepthMeters = 0.14;
  // Put the entire rail outside the thickest adjacent wall face, rather than
  // merely moving its centre line. This prevents the 55A/59A pantry overlap.
  const corridorTrackOffsetMeters = rounded(adjacentWallThicknessMeters / 2 + doorDepthMeters / 2 + 0.01);
  const unclampedFrameWidth = usableLength - wallClearanceMeters * 2;
  // The 55B source anchor was authored as 2.25 m. Scaling against the marked
  // floor-plan dimensions yields a roughly 1.5 m class entry partition.
  const frameWidthMeters = unit === "55B" ? Math.min(1.55, unclampedFrameWidth) : unclampedFrameWidth;
  const position = [
    midpoint[0] + normalX * corridorNormalSign * corridorTrackOffsetMeters,
    midpoint[1] + normalY * corridorNormalSign * corridorTrackOffsetMeters,
  ];
  const door = prop({
    id: `inspection-${unit}-entry-sliding-partition-door`,
    assetId: "entry-sliding-partition-door",
    roomZoneId: "entry",
    position,
    dimensions: [frameWidthMeters, doorDepthMeters, 2.2],
    yawDeg: rounded(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI),
    mirrored: unit === "51A",
    materialVariantId: "new-apartment-warm-white-glass",
    anchorId: "entryPartition",
    installationRole: "entry-partition",
  });
  return [{
    ...door,
    displayState: "half-open",
    openRatio: 0.5,
    trackSide: "corridor",
    wallClearanceMeters: rounded(wallClearanceMeters),
    trackOffsetMeters: corridorTrackOffsetMeters,
    sourceOpeningLengthMeters: rounded(length),
    usableOpeningLengthMeters: rounded(usableLength),
    adjacentWallThicknessMeters: rounded(adjacentWallThicknessMeters),
    panelParkingSide: unit === "51A" ? "end-away-from-bathroom" : "start",
  }];
}

function roomPlacement(geometry = {}, roomId = "", { inset = 0.3, edge = "north" } = {}) {
  const room = roomById(geometry, roomId);
  const bounds = roomBounds(room);
  if (!bounds) return null;
  const [x1, y1, x2, y2] = bounds;
  if (edge === "south") return { room, bounds, position: [(x1 + x2) / 2, y2 - inset], yawDeg: 180 };
  if (edge === "east") return { room, bounds, position: [x2 - inset, (y1 + y2) / 2], yawDeg: 270 };
  if (edge === "west") return { room, bounds, position: [x1 + inset, (y1 + y2) / 2], yawDeg: 90 };
  return { room, bounds, position: [(x1 + x2) / 2, y1 + inset], yawDeg: 0 };
}

function systemAirConditionerProps(geometry = {}, unitTypeId = "", selected = new Set()) {
  const selectedId = [...selected].find((assetId) => /^system-ac-[234]-(?:general|premium)$/.test(assetId));
  if (!selectedId) return [];
  const count = Number(selectedId.match(/^system-ac-(\d)-/)?.[1] || 0);
  const premium = selectedId.endsWith("-premium");
  const roomIds = ["living", "bedroom-1", "bedroom-2", "bedroom-3", "alpha-room"];
  const unit = String(unitTypeId || "").toUpperCase();
  return roomIds
    .map((roomId) => ({ roomId, room: roomById(geometry, roomId) }))
    .filter(({ room }) => roomBounds(room))
    .slice(0, count)
    .map(({ roomId, room }, index) => {
      const [x1, y1, x2, y2] = roomBounds(room);
      return prop({
        id: `inspection-${unit}-system-ac-${index + 1}`,
        assetId: "ceiling-cassette-air-conditioner",
        roomZoneId: roomId,
        position: [(x1 + x2) / 2, (y1 + y2) / 2],
        dimensions: [0.84, 0.84, 0.24],
        mountHeightMeters: 2.06,
        materialVariantId: premium ? "system-ac-premium-light-gray" : "system-ac-light-gray",
        anchorId: `options.systemAirConditioner.${roomId}`,
        installationRole: "ceiling-appliance",
      });
    });
}

function entryLivingOptionProps(geometry = {}, unitTypeId = "", selected = new Set()) {
  const unit = String(unitTypeId || "").toUpperCase();
  const result = [];
  const entry = roomPlacement(geometry, "entry", { edge: "east", inset: 0.24 });
  if (selected.has("entry-open-premium-shoe-cabinet") && entry) {
    const [, y1, x2, y2] = entry.bounds;
    const partition = geometry?.optionAnchors?.entryPartition || {};
    const partitionPoints = [partition?.startMeters, partition?.endMeters]
      .filter((point) => Array.isArray(point) && point.length >= 2);
    const partitionY = partitionPoints.length
      ? partitionPoints.reduce((sum, point) => sum + Number(point[1] || 0), 0) / partitionPoints.length
      : y2;
    const cabinetEndY = Math.max(y1 + 0.8, Math.min(y2, partitionY));
    const cabinetWidth = cabinetEndY - y1;
    result.push(prop({
      id: `inspection-${unit}-premium-shoe-cabinet`,
      assetId: "entry-shoe-cabinet-tall",
      roomZoneId: "entry",
      position: [x2 - 0.175, (y1 + cabinetEndY) / 2],
      dimensions: [cabinetWidth, 0.35, 2.2],
      yawDeg: entry.yawDeg,
      materialVariantId: "pet-warm-ivory",
      anchorId: "options.entryShoeCabinet",
      installationRole: "entry-storage",
    }));
  }
  const pantry = roomPlacement(geometry, "entry-pantry", { edge: "north", inset: 0.32 });
  if (selected.has("entry-pantry-system-shelf") && pantry) {
    const [x1, , x2] = pantry.bounds;
    result.push(prop({
      id: `inspection-${unit}-entry-pantry-system-shelf`,
      assetId: "entry-pantry-rounded-system-cabinet",
      roomZoneId: "entry-pantry",
      position: pantry.position,
      dimensions: [Math.min(1.6, Math.max(0.8, x2 - x1 - 0.18)), 0.48, 2.15],
      materialVariantId: "pet-warm-ivory",
      anchorId: "options.entryPantrySystemShelf",
      installationRole: "entry-storage",
    }));
  }
  const living = roomPlacement(geometry, "living", { edge: "north", inset: 0.08 });
  if (selected.has("living-design-wall-panel") && living) {
    const [x1, , x2] = living.bounds;
    result.push(prop({
      id: `inspection-${unit}-living-design-wall`,
      assetId: "living-art-wall-greige-stone",
      roomZoneId: "living",
      position: living.position,
      dimensions: [Math.min(3.2, Math.max(1.8, x2 - x1 - 0.3)), 0.055, 2.2],
      materialVariantId: "golden-shore-engineered-stone",
      anchorId: "options.livingDesignWall",
      installationRole: "wall-finish",
    }));
  }
  const infinityRoomIds = selected.has("infinity-door-all-bedrooms")
    ? ["bedroom-1", "bedroom-2", "bedroom-3", "alpha-room"]
    : selected.has("infinity-door-bedroom-1") ? ["bedroom-1"] : [];
  infinityRoomIds.forEach((roomId, index) => {
    const placement = roomPlacement(geometry, roomId, { edge: "east", inset: 0.045 });
    if (!placement) return;
    result.push(prop({
      id: `inspection-${unit}-infinity-door-${index + 1}`,
      assetId: "interior-infinity-door-panel",
      roomZoneId: roomId,
      position: placement.position,
      dimensions: [0.9, 0.08, 2.2],
      yawDeg: placement.yawDeg,
      materialVariantId: "wall-matched-warm-white",
      anchorId: `options.infinityDoor.${roomId}`,
      installationRole: "wall-door-finish",
    }));
  });
  return result;
}

function bedroomStorageOptionProps(geometry = {}, unitTypeId = "", selected = new Set()) {
  const unit = String(unitTypeId || "").toUpperCase();
  const result = [];
  const addWardrobe = (roomId, suffix, withDesk = false, clothingCare = false) => {
    const placement = roomPlacement(geometry, roomId, { edge: "north", inset: 0.31 });
    if (!placement) return;
    const [x1, , x2] = placement.bounds;
    const width = Math.min(withDesk ? 2.25 : 1.8, Math.max(1.0, x2 - x1 - 0.25));
    result.push(prop({
      id: `inspection-${unit}-${suffix}-wardrobe`,
      assetId: clothingCare ? "system-hanger-modular" : "wardrobe-two-door",
      roomZoneId: roomId,
      position: placement.position,
      dimensions: [width, 0.58, 2.2],
      materialVariantId: "pet-warm-ivory",
      anchorId: `options.storage.${roomId}`,
      installationRole: "bedroom-storage",
    }));
    if (withDesk) result.push(prop({
      id: `inspection-${unit}-${suffix}-desk`,
      assetId: "work-desk",
      roomZoneId: roomId,
      position: [Math.min(x2 - 0.55, placement.position[0] + width / 2 + 0.55), placement.position[1] + 0.03],
      dimensions: [0.9, 0.5, 0.74],
      materialVariantId: "pet-warm-ivory",
      anchorId: `options.storage.${roomId}.desk`,
      installationRole: "bedroom-storage",
    }));
  };
  if (selected.has("bedroom-1-built-in-closet-pet")) addWardrobe("bedroom-1", "bedroom-1", false, false);
  if (selected.has("bedroom-1-clothing-care-closet")) addWardrobe("bedroom-1", "bedroom-1-clothing-care", false, true);
  if (selected.has("bedroom-2-built-in-closet-pet")) addWardrobe("bedroom-2", "bedroom-2", false, false);
  if (selected.has("bedroom-2-closet-desk-set")) addWardrobe("bedroom-2", "bedroom-2-desk", true, false);
  if (selected.has("bedroom-3-built-in-closet-pet")) addWardrobe("bedroom-3", "bedroom-3", false, false);
  if (selected.has("bedroom-3-closet-desk-set")) addWardrobe("bedroom-3", "bedroom-3-desk", true, false);
  if (selected.has("dress-room-powder-storage")) {
    const placement = roomPlacement(geometry, "dress-room", { edge: "north", inset: 0.28 })
      || roomPlacement(geometry, "dress", { edge: "north", inset: 0.28 });
    if (placement) result.push(prop({
      id: `inspection-${unit}-dress-room-powder-storage`,
      assetId: "vanity-dressing-table",
      roomZoneId: String(placement.room?.id || placement.room?.roomId || "dress-room"),
      position: placement.position,
      dimensions: [Math.min(1.3, Math.max(0.85, placement.bounds[2] - placement.bounds[0] - 0.25)), 0.48, 1.4],
      materialVariantId: "pet-warm-ivory",
      anchorId: "options.dressRoomPowderStorage",
      installationRole: "bedroom-storage",
    }));
  }
  if (selected.has("lg-styler-sc5mbr53")) {
    const placement = roomPlacement(geometry, "bedroom-1", { edge: "north", inset: 0.31 });
    if (placement) result.push(prop({
      id: `inspection-${unit}-lg-styler`,
      assetId: "clothes-styler-tall",
      roomZoneId: "bedroom-1",
      position: [Math.min(placement.bounds[2] - 0.34, placement.position[0] + 0.7), placement.position[1]],
      dimensions: [0.6, 0.6, 1.96],
      materialVariantId: "mirror-taupe",
      anchorId: "options.lgStyler",
      installationRole: "bedroom-appliance",
    }));
  }
  return result;
}

function lightingOptionProps(geometry = {}, unitTypeId = "", selected = new Set()) {
  if (!selected.has("smart-lighting-package")) return [];
  const unit = String(unitTypeId || "").toUpperCase();
  return ["living", "kitchen-dining", "bedroom-1", "bedroom-2", "bedroom-3", "alpha-room"]
    .map((roomId) => ({ roomId, room: roomById(geometry, roomId) }))
    .filter(({ room }) => roomBounds(room))
    .map(({ roomId, room }, index) => {
      const [x1, y1, x2, y2] = roomBounds(room);
      return prop({
        id: `inspection-${unit}-smart-downlight-${index + 1}`,
        assetId: "ceiling-smart-downlight",
        roomZoneId: roomId,
        position: [(x1 + x2) / 2, (y1 + y2) / 2],
        dimensions: [0.16, 0.16, 0.06],
        mountHeightMeters: 2.22,
        materialVariantId: "warm-led-white",
        anchorId: `options.smartLighting.${roomId}`,
        installationRole: "ceiling-light",
      });
    });
}

function bathroomCeilingOptionProps(geometry = {}, unitTypeId = "", selected = new Set()) {
  if (!selected.has("bathroom-combination-ventilator")) return [];
  const unit = String(unitTypeId || "").toUpperCase();
  return ["bathroom-1", "bathroom-2"]
    .map((roomId) => ({ roomId, room: roomById(geometry, roomId) }))
    .filter(({ room }) => roomBounds(room))
    .map(({ roomId, room }, index) => {
      const [x1, y1, x2, y2] = roomBounds(room);
      return prop({
        id: `inspection-${unit}-bathroom-combination-ventilator-${index + 1}`,
        assetId: "bathroom-combination-ventilator",
        roomZoneId: roomId,
        position: [(x1 + x2) / 2, (y1 + y2) / 2],
        dimensions: [0.43, 0.43, 0.2],
        mountHeightMeters: 2.08,
        materialVariantId: "warm-white",
        anchorId: `options.bathroomVentilator.${roomId}`,
        installationRole: "ceiling-appliance",
      });
    });
}

function kitchenOptionProps(geometry = {}, unitTypeId = "", selected = new Set()) {
  const kitchen = geometry?.optionAnchors?.kitchen;
  if (!kitchen || !Array.isArray(kitchen.countertopRuns)) return [];
  const unit = String(unitTypeId || "").toUpperCase();
  const result = [];
  const engineeredStone = selected.has("kitchen-wall-countertop-radianz-golden-shore");
  kitchen.countertopRuns.forEach((run, index) => {
    const [x1, y1, x2, y2] = run.boundsMeters.map(Number);
    const materialVariantId = engineeredStone ? "golden-shore-engineered-stone" : "mma-sanded-goose";
    result.push(prop({
      id: `inspection-${unit}-kitchen-countertop-${index + 1}`,
      assetId: engineeredStone ? "kitchen-countertop-radianz-run" : "kitchen-countertop-default-run",
      roomZoneId: "kitchen-dining",
      position: [(x1 + x2) / 2, (y1 + y2) / 2],
      dimensions: [x2 - x1, y2 - y1, 0.06],
      mountHeightMeters: 0.9,
      materialVariantId,
      anchorId: `kitchen.countertopRuns.${index}`,
      installationRole: "kitchen-countertop",
    }));
    const vertical = ["east", "west"].includes(run.backsplashEdge);
    const wallPosition = vertical
      ? [run.backsplashEdge === "east" ? x2 : x1, (y1 + y2) / 2]
      : [(x1 + x2) / 2, run.backsplashEdge === "south" ? y2 : y1];
    result.push(prop({
      id: `inspection-${unit}-kitchen-backsplash-${index + 1}`,
      assetId: engineeredStone ? "kitchen-backsplash-radianz-run" : "kitchen-backsplash-default-run",
      roomZoneId: "kitchen-dining",
      position: wallPosition,
      dimensions: [vertical ? y2 - y1 : x2 - x1, 0.035, 0.55],
      yawDeg: vertical ? 90 : 0,
      mountHeightMeters: 0.9,
      materialVariantId: engineeredStone ? "golden-shore-engineered-stone" : "mma-sanded-goose-panel",
      anchorId: `kitchen.countertopRuns.${index}.backsplash`,
      installationRole: "kitchen-backsplash",
    }));
  });
  const refrigeratorAssetId = selected.has("refrigerator-cabinet-lg-built-in")
    ? "refrigerator-cabinet-lg-built-in"
    : selected.has("refrigerator-cabinet-bespoke-alt2")
      ? "refrigerator-cabinet-bespoke-alt2"
    : selected.has("refrigerator-cabinet-pet-basic")
      ? "refrigerator-cabinet-pet-basic"
      : "";
  if (refrigeratorAssetId) {
    const bounds = kitchen.refrigeratorCabinet?.boundsMeters;
    if (!Array.isArray(bounds) || bounds.length < 4) return result;
    const [x1, y1, x2, y2] = bounds.map(Number);
    const vertical = (y2 - y1) >= (x2 - x1);
    result.push(prop({
      id: `inspection-${unit}-refrigerator-cabinet`,
      assetId: refrigeratorAssetId,
      roomZoneId: "kitchen-dining",
      position: [(x1 + x2) / 2, (y1 + y2) / 2],
      dimensions: [vertical ? y2 - y1 : x2 - x1, vertical ? x2 - x1 : y2 - y1, 2.2],
      yawDeg: vertical ? 90 : 0,
      materialVariantId: "pet-warm-ivory",
      anchorId: "kitchen.refrigeratorCabinet",
      installationRole: "refrigerator-cabinet",
    }));
  }
  const islandSelected = selected.has("island-counter-modern")
    || selected.has("island-counter-dining-integrated");
  const island = kitchen.island;
  if (islandSelected && Array.isArray(island?.baseBoundsMeters)) {
    const [x1, y1, x2, y2] = island.baseBoundsMeters.map(Number);
    const yawDeg = Number(island.yawDeg || 0);
    const vertical = Math.abs(y2 - y1) >= Math.abs(x2 - x1);
    const materialVariantId = engineeredStone ? "golden-shore-engineered-stone" : "pet-warm-ivory";
    result.push(prop({
      id: `inspection-${unit}-kitchen-island`,
      assetId: "island-counter-modern",
      roomZoneId: "kitchen-dining",
      position: [(x1 + x2) / 2, (y1 + y2) / 2],
      dimensions: [vertical ? y2 - y1 : x2 - x1, vertical ? x2 - x1 : y2 - y1, 0.9],
      yawDeg,
      materialVariantId,
      anchorId: "kitchen.island.baseBoundsMeters",
      installationRole: "kitchen-island",
    }));
    const integrated = selected.has("island-counter-dining-integrated")
      && island.supportsDiningExtension === true
      && Array.isArray(island.diningExtensionBoundsMeters);
    if (integrated) {
      const [dx1, dy1, dx2, dy2] = island.diningExtensionBoundsMeters.map(Number);
      const diningVertical = Math.abs(dy2 - dy1) >= Math.abs(dx2 - dx1);
      result.push(prop({
        id: `inspection-${unit}-kitchen-island-dining-table`,
        assetId: "dining-table-four-seat",
        roomZoneId: "kitchen-dining",
        position: [(dx1 + dx2) / 2, (dy1 + dy2) / 2],
        dimensions: [diningVertical ? dy2 - dy1 : dx2 - dx1, diningVertical ? dx2 - dx1 : dy2 - dy1, 0.74],
        yawDeg,
        materialVariantId,
        anchorId: "kitchen.island.diningExtensionBoundsMeters",
        installationRole: "kitchen-island-dining-extension",
      }));
      // Two seats enter from each long side.  Put each seat centre just
      // inside the tabletop edge so the cushion (not merely the chair front)
      // tucks beneath the table, then face every chair toward the tabletop.
      const chairPlacements = diningVertical
        ? [
          { position: [dx1 + 0.08, dy1 + (dy2 - dy1) / 3], yawDeg: 270 },
          { position: [dx1 + 0.08, dy1 + (dy2 - dy1) * 2 / 3], yawDeg: 270 },
          { position: [dx2 - 0.08, dy1 + (dy2 - dy1) / 3], yawDeg: 90 },
          { position: [dx2 - 0.08, dy1 + (dy2 - dy1) * 2 / 3], yawDeg: 90 },
        ]
        : [
          { position: [dx1 + (dx2 - dx1) / 3, dy1 + 0.08], yawDeg: 180 },
          { position: [dx1 + (dx2 - dx1) * 2 / 3, dy1 + 0.08], yawDeg: 180 },
          { position: [dx1 + (dx2 - dx1) / 3, dy2 - 0.08], yawDeg: 0 },
          { position: [dx1 + (dx2 - dx1) * 2 / 3, dy2 - 0.08], yawDeg: 0 },
        ];
      const diningChairYawOffsetDeg = Number(island.diningChairYawOffsetDeg || 0);
      chairPlacements.forEach(({ position, yawDeg: chairYawDeg }, index) => result.push(prop({
        id: `inspection-${unit}-kitchen-island-dining-chair-${index + 1}`,
        assetId: "dining-chair",
        roomZoneId: "kitchen-dining",
        position,
        dimensions: [0.48, 0.48, 0.82],
        yawDeg: (chairYawDeg + diningChairYawOffsetDeg + 360) % 360,
        materialVariantId: "warm-taupe-upholstery",
        anchorId: `kitchen.island.diningChairs.${index}`,
        installationRole: "kitchen-island-dining-chair",
      })));
    }
  }
  const cooktopAssetId = [
    "electric-cooktop-erh-3903",
    "induction-cooktop-nz63b5056ak",
    "induction-cooktop-bei3asb4bi",
  ].find((assetId) => selected.has(assetId));
  if (cooktopAssetId && Array.isArray(kitchen.cooktop?.positionMeters)) {
    const dimensions = cooktopAssetId === "electric-cooktop-erh-3903"
      ? [0.59, 0.52, 0.06]
      : cooktopAssetId === "induction-cooktop-bei3asb4bi"
        ? [0.58, 0.52, 0.059]
        : [0.6, 0.52, 0.048];
    result.push(prop({
      id: `inspection-${unit}-kitchen-cooktop`,
      assetId: cooktopAssetId,
      roomZoneId: "kitchen-dining",
      position: kitchen.cooktop.positionMeters,
      dimensions,
      yawDeg: kitchen.cooktop.yawDeg,
      mountHeightMeters: 0.93,
      materialVariantId: "black-ceramic-glass",
      anchorId: "kitchen.cooktop",
      installationRole: "kitchen-cooktop",
    }));
  }
  if (selected.has("silent-range-hood") && Array.isArray(kitchen.hood?.positionMeters)) {
    result.push(prop({
      id: `inspection-${unit}-kitchen-range-hood`,
      assetId: "silent-range-hood",
      roomZoneId: "kitchen-dining",
      position: kitchen.hood.positionMeters,
      dimensions: [0.9, 0.5, 0.7],
      yawDeg: kitchen.hood.yawDeg,
      mountHeightMeters: 1.45,
      materialVariantId: "pet-warm-ivory",
      anchorId: "kitchen.hood",
      installationRole: "kitchen-range-hood",
    }));
  }
  if (selected.has("dishwasher-built-in-die6pt") && Array.isArray(kitchen.dishwasher?.positionMeters)) {
    result.push(prop({
      id: `inspection-${unit}-kitchen-dishwasher`,
      assetId: "dishwasher-built-in-die6pt",
      roomZoneId: "kitchen-dining",
      position: kitchen.dishwasher.positionMeters,
      dimensions: [0.598, 0.567, 0.815],
      yawDeg: kitchen.dishwasher.yawDeg,
      materialVariantId: "pet-warm-ivory",
      anchorId: "kitchen.dishwasher",
      installationRole: "kitchen-dishwasher",
    }));
  }
  const ovenAssetId = ["built-in-oven-navien", "built-in-oven-samsung", "built-in-oven-lg"]
    .find((assetId) => selected.has(assetId));
  if (ovenAssetId && Array.isArray(kitchen.island?.baseBoundsMeters)) {
    const [x1, y1, x2, y2] = kitchen.island.baseBoundsMeters.map(Number);
    result.push(prop({
      id: `inspection-${unit}-kitchen-built-in-oven`,
      assetId: ovenAssetId,
      roomZoneId: "kitchen-dining",
      position: [(x1 + x2) / 2, (y1 + y2) / 2],
      dimensions: [0.6, 0.55, 0.6],
      yawDeg: Number(kitchen.island.yawDeg || 0),
      mountHeightMeters: 0.12,
      materialVariantId: ovenAssetId === "built-in-oven-samsung" ? "black-glass" : "graphite-glass",
      anchorId: "kitchen.island.builtInOven",
      installationRole: "kitchen-built-in-appliance",
    }));
  }
  return result;
}

function anchoredApplianceProps(geometry = {}, unitTypeId = "", selected = new Set()) {
  const unit = String(unitTypeId || "").toUpperCase();
  const anchors = geometry?.optionAnchors?.appliances || {};
  const result = [];
  if (selected.has("air-planner-ceiling-vent") && Array.isArray(anchors.airPlanner?.positionMeters)) {
    result.push(prop({
      id: `inspection-${unit}-air-planner`,
      assetId: "air-planner-ceiling-vent",
      roomZoneId: anchors.airPlanner.roomZoneId || "living",
      position: anchors.airPlanner.positionMeters,
      dimensions: [0.35, 0.35, 0.08],
      yawDeg: anchors.airPlanner.yawDeg,
      mountHeightMeters: anchors.airPlanner.mountHeightMeters ?? 2.18,
      materialVariantId: "warm-white",
      anchorId: "appliances.airPlanner",
      installationRole: "ceiling-appliance",
    }));
    ["bedroom-1", "bedroom-2", "bedroom-3", "alpha-room"].forEach((roomId, index) => {
      const placement = roomPlacement(geometry, roomId, { edge: "east", inset: 0.035 });
      if (!placement) return;
      result.push(prop({
        id: `inspection-${unit}-air-planner-display-${index + 1}`,
        assetId: "bedroom-smart-display-switch",
        roomZoneId: roomId,
        position: placement.position,
        dimensions: [0.12, 0.03, 0.18],
        yawDeg: placement.yawDeg,
        mountHeightMeters: 1.15,
        materialVariantId: "warm-white",
        anchorId: `options.airPlannerDisplay.${roomId}`,
        installationRole: "wall-appliance",
      }));
    });
  }
  if (selected.has("closet-breeze-dehumidifier") && Array.isArray(anchors.closetBreeze?.positionMeters)) {
    result.push(prop({
      id: `inspection-${unit}-closet-breeze`,
      assetId: "closet-breeze-dehumidifier",
      roomZoneId: anchors.closetBreeze.roomZoneId || "dress-room",
      position: anchors.closetBreeze.positionMeters,
      dimensions: [0.4, 0.22, 0.6],
      yawDeg: anchors.closetBreeze.yawDeg,
      materialVariantId: "warm-white",
      anchorId: "appliances.closetBreeze",
      installationRole: "closet-appliance",
    }));
  }
  return result;
}

export function bundangPrototypeOptionProps(geometry = {}, unitTypeId = "", selectedIds = []) {
  const selected = new Set([...selectedIds].map(String));
  const generatedFixtures = bathroomFixtureProps(geometry, unitTypeId, selected.has("toilet-integrated-bidet"));
  const fixtureIds = new Set(generatedFixtures.map((row) => row.id));
  const authored = (Array.isArray(geometry?.interiorProps) ? geometry.interiorProps : [])
    .filter((row) => !fixtureIds.has(String(row?.id || "")))
    .map((row) => ({ ...row }));
  return [
    ...authored,
    ...generatedFixtures,
    ...(selected.has("wide-plank-floor-finish") ? roomFinishProps(geometry, unitTypeId) : []),
    ...(selected.has("entry-sliding-partition-door") ? entryDoorProp(geometry, unitTypeId) : []),
    ...systemAirConditionerProps(geometry, unitTypeId, selected),
    ...entryLivingOptionProps(geometry, unitTypeId, selected),
    ...bedroomStorageOptionProps(geometry, unitTypeId, selected),
    ...lightingOptionProps(geometry, unitTypeId, selected),
    ...bathroomCeilingOptionProps(geometry, unitTypeId, selected),
    ...kitchenOptionProps(geometry, unitTypeId, selected),
    ...anchoredApplianceProps(geometry, unitTypeId, selected),
  ];
}

export function formatBundangOptionPrice(price = 0) {
  return `${Math.max(0, Number(price || 0)).toLocaleString("ko-KR")} 원`;
}
