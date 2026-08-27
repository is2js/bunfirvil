import type {
  BOptionV1,
  ShowcaseCatalogV1,
  StaticMapEntryV1,
  ValidationResult,
} from "./types";

export const EXPECTED_MAP_IDS = [
  "bundang-first-village-51a-prototype",
  "bundang-first-village-55a-prototype",
  "bundang-first-village-55b-prototype",
  "bundang-first-village-59a-prototype",
] as const;

const RENDERERS = new Set(["three-pbr", "canvas2d"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isPriceRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([unitType, price]) => isNonEmptyString(unitType) && isFiniteNonNegativeNumber(price),
    )
  );
}

function isProjectRelativeUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const path = value.trim();
  return (
    !path.startsWith("/") &&
    !path.startsWith("\\") &&
    !path.includes("..") &&
    !/^[a-z][a-z\d+.-]*:/i.test(path)
  );
}

function validateMap(value: unknown, index: number, errors: string[]): value is StaticMapEntryV1 {
  const prefix = `maps[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${prefix}가 객체가 아닙니다.`);
    return false;
  }

  const requiredStrings = ["id", "label", "unitType", "revision"] as const;
  requiredStrings.forEach((key) => {
    if (!isNonEmptyString(value[key])) {
      errors.push(`${prefix}.${key}가 비어 있습니다.`);
    }
  });

  for (const key of ["width", "height", "chunkCount", "assetBytes"] as const) {
    if (!isFiniteNonNegativeNumber(value[key])) {
      errors.push(`${prefix}.${key}는 0 이상의 숫자여야 합니다.`);
    }
  }

  if (!RENDERERS.has(String(value.renderer))) {
    errors.push(`${prefix}.renderer가 지원되지 않습니다.`);
  }

  for (const key of ["manifestUrl", "minimapUrl"] as const) {
    if (!isProjectRelativeUrl(value[key])) {
      errors.push(`${prefix}.${key}는 프로젝트 기준 상대경로여야 합니다.`);
    }
  }

  if (!isRecord(value.spawn) || !Number.isFinite(value.spawn.x) || !Number.isFinite(value.spawn.y)) {
    errors.push(`${prefix}.spawn 좌표가 올바르지 않습니다.`);
  }

  return errors.every((error) => !error.startsWith(prefix));
}

function validateOption(value: unknown, index: number, errors: string[]): value is BOptionV1 {
  const prefix = `bOptions[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${prefix}가 객체가 아닙니다.`);
    return false;
  }

  for (const key of ["id", "label", "category", "description"] as const) {
    if (!isNonEmptyString(value[key])) {
      errors.push(`${prefix}.${key}가 비어 있습니다.`);
    }
  }

  if (!isFiniteNonNegativeNumber(value.price)) {
    errors.push(`${prefix}.price는 0 이상의 숫자여야 합니다.`);
  }
  if (!isPriceRecord(value.prices)) {
    errors.push(`${prefix}.prices는 세대형별 0 이상의 가격 객체여야 합니다.`);
  }

  for (const key of ["compatibleUnitTypes", "requires", "requiresAny", "excludes"] as const) {
    if (!isStringArray(value[key])) {
      errors.push(`${prefix}.${key}는 문자열 배열이어야 합니다.`);
    } else if (new Set(value[key]).size !== value[key].length) {
      errors.push(`${prefix}.${key}에 중복값이 있습니다.`);
    }
  }

  if (value.previewUrl !== undefined && !isProjectRelativeUrl(value.previewUrl)) {
    errors.push(`${prefix}.previewUrl은 프로젝트 기준 상대경로여야 합니다.`);
  }

  return errors.every((error) => !error.startsWith(prefix));
}

export function validateCatalog(value: unknown): ValidationResult<ShowcaseCatalogV1> {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["catalog가 객체가 아닙니다."] };
  }

  if (value.schemaVersion !== 1) {
    errors.push("지원하지 않는 catalog schemaVersion입니다.");
  }
  if (!isNonEmptyString(value.exportId)) {
    errors.push("catalog.exportId가 비어 있습니다.");
  }
  if (!isNonEmptyString(value.generatedAt) || !Number.isFinite(Date.parse(value.generatedAt))) {
    errors.push("catalog.generatedAt이 올바른 날짜가 아닙니다.");
  }

  if (!Array.isArray(value.maps)) {
    errors.push("catalog.maps가 배열이 아닙니다.");
  } else {
    value.maps.forEach((map, index) => validateMap(map, index, errors));
    const ids = value.maps
      .filter(isRecord)
      .map((map) => map.id)
      .filter(isNonEmptyString);
    if (new Set(ids).size !== ids.length) {
      errors.push("catalog.maps에 중복 map id가 있습니다.");
    }
    const actual = new Set(ids);
    for (const expectedId of EXPECTED_MAP_IDS) {
      if (!actual.has(expectedId)) {
        errors.push(`필수 검수맵 ${expectedId}가 없습니다.`);
      }
    }
    if (
      actual.size !== EXPECTED_MAP_IDS.length ||
      [...actual].some((id) => !EXPECTED_MAP_IDS.includes(id as (typeof EXPECTED_MAP_IDS)[number]))
    ) {
      errors.push("1차 공개 범위를 벗어난 맵이 catalog에 포함되어 있습니다.");
    }
  }

  for (const key of ["characters", "skills", "defaultHotbar", "bOptions"] as const) {
    if (!Array.isArray(value[key])) {
      errors.push(`catalog.${key}가 배열이 아닙니다.`);
    }
  }

  if (!isRecord(value.renderAssets)) {
    errors.push("catalog.renderAssets가 객체가 아닙니다.");
  } else {
    for (const key of ["interiorCatalogUrl", "recipeCatalogUrl", "optionModuleUrl", "materialManifestUrl"] as const) {
      if (!isProjectRelativeUrl(value.renderAssets[key])) {
        errors.push(`catalog.renderAssets.${key}는 프로젝트 기준 상대경로여야 합니다.`);
      }
    }
  }

  if (Array.isArray(value.bOptions)) {
    value.bOptions.forEach((option, index) => validateOption(option, index, errors));
    const validOptions = value.bOptions.filter(isRecord);
    const ids = validOptions.map((option) => option.id).filter(isNonEmptyString);
    const knownIds = new Set(ids);
    const knownUnitTypes = new Set(
      Array.isArray(value.maps)
        ? value.maps.filter(isRecord).map((map) => map.unitType).filter(isNonEmptyString)
        : [],
    );
    if (knownIds.size !== ids.length) {
      errors.push("catalog.bOptions에 중복 option id가 있습니다.");
    }

    validOptions.forEach((option, index) => {
      const optionId = isNonEmptyString(option.id) ? option.id : `#${index}`;
      for (const dependency of isStringArray(option.requires) ? option.requires : []) {
        if (!knownIds.has(dependency)) {
          errors.push(`${optionId}의 필수 옵션 ${dependency}를 찾을 수 없습니다.`);
        }
      }
      for (const dependency of isStringArray(option.requiresAny) ? option.requiresAny : []) {
        if (!knownIds.has(dependency)) {
          errors.push(`${optionId}의 대안 필수 옵션 ${dependency}를 찾을 수 없습니다.`);
        }
      }
      for (const excluded of isStringArray(option.excludes) ? option.excludes : []) {
        if (!knownIds.has(excluded)) {
          errors.push(`${optionId}의 배타 옵션 ${excluded}를 찾을 수 없습니다.`);
        }
      }
      if (isPriceRecord(option.prices)) {
        for (const unitType of Object.keys(option.prices)) {
          if (!knownUnitTypes.has(unitType)) {
            errors.push(`${optionId}.prices에 알 수 없는 세대형 ${unitType}이 있습니다.`);
          }
          if (
            isStringArray(option.compatibleUnitTypes) &&
            option.compatibleUnitTypes.length > 0 &&
            !option.compatibleUnitTypes.includes(unitType)
          ) {
            errors.push(`${optionId}.prices의 ${unitType}은 호환 세대형에 없습니다.`);
          }
        }
      }
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: value as unknown as ShowcaseCatalogV1 };
}

export function appBaseUrl(): URL {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  const configuredBase = env?.BASE_URL;

  if (configuredBase && configuredBase !== "./") {
    return new URL(configuredBase, window.location.origin);
  }

  const manageIndex = window.location.pathname.indexOf("/manage/");
  if (manageIndex >= 0) {
    return new URL(`${window.location.pathname.slice(0, manageIndex + 1)}`, window.location.origin);
  }

  return new URL("./", window.location.href);
}

export function resolveAppUrl(path = ""): string {
  return new URL(path.replace(/^\.\//, ""), appBaseUrl()).href;
}

export async function loadCatalog(): Promise<ShowcaseCatalogV1> {
  const response = await fetch(resolveAppUrl("generated/catalog.v1.json"), {
    cache: "no-cache",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`catalog를 불러오지 못했습니다. (HTTP ${response.status})`);
  }

  const result = validateCatalog((await response.json()) as unknown);
  if (!result.ok) {
    throw new Error(`catalog 검증 실패: ${result.errors.join(" ")}`);
  }
  return result.value;
}
