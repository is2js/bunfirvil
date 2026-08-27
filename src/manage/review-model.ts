import {
  REVIEW_SCHEMA_VERSION,
  REVIEW_STATUSES,
  type BOptionV1,
  type LocalReviewBundleV1,
  type LocalReviewV1,
  type ReviewStatus,
  type ShowcaseCatalogV1,
  type ValidationResult,
} from "./types";

const MAX_NOTES_LENGTH = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === "string" && REVIEW_STATUSES.includes(value as ReviewStatus);
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function defaultReview(mapId: string, now = new Date()): LocalReviewV1 {
  return {
    mapId,
    status: "unreviewed",
    notes: "",
    selectedOptionIds: [],
    updatedAt: now.toISOString(),
  };
}

export function compatibleOptions(options: BOptionV1[], unitType: string): BOptionV1[] {
  return options.filter(
    (option) =>
      option.compatibleUnitTypes.length === 0 || option.compatibleUnitTypes.includes(unitType),
  );
}

function validateOptionSelection(
  selectedOptionIds: unknown,
  unitType: string,
  options: BOptionV1[],
  prefix: string,
): string[] {
  if (!Array.isArray(selectedOptionIds) || selectedOptionIds.some((id) => typeof id !== "string")) {
    return [`${prefix}.selectedOptionIds는 문자열 배열이어야 합니다.`];
  }

  const errors: string[] = [];
  const ids = selectedOptionIds as string[];
  const selected = new Set(ids);
  const optionById = new Map(options.map((option) => [option.id, option]));

  if (selected.size !== ids.length) {
    errors.push(`${prefix}.selectedOptionIds에 중복값이 있습니다.`);
  }

  for (const id of selected) {
    const option = optionById.get(id);
    if (!option) {
      errors.push(`${prefix}에 허용되지 않은 옵션 ${id}가 있습니다.`);
      continue;
    }
    if (
      option.compatibleUnitTypes.length > 0 &&
      !option.compatibleUnitTypes.includes(unitType)
    ) {
      errors.push(`${prefix}의 옵션 ${id}는 ${unitType} 세대형과 호환되지 않습니다.`);
    }
    for (const required of option.requires) {
      if (!selected.has(required)) {
        errors.push(`${prefix}의 옵션 ${id}에 필수 옵션 ${required}가 없습니다.`);
      }
    }
    if (
      option.requiresAny.length > 0 &&
      !option.requiresAny.some((alternative) => selected.has(alternative))
    ) {
      errors.push(
        `${prefix}의 옵션 ${id}에 대안 필수 옵션(${option.requiresAny.join(", ")}) 중 하나가 필요합니다.`,
      );
    }
    for (const excluded of option.excludes) {
      if (selected.has(excluded)) {
        errors.push(`${prefix}에 함께 선택할 수 없는 ${id}, ${excluded}가 있습니다.`);
      }
    }
  }

  return [...new Set(errors)];
}

export function validateReview(
  value: unknown,
  catalog: ShowcaseCatalogV1,
  prefix = "review",
): ValidationResult<LocalReviewV1> {
  if (!isRecord(value)) {
    return { ok: false, errors: [`${prefix}가 객체가 아닙니다.`] };
  }

  const errors: string[] = [];
  const mapId = value.mapId;
  const map = typeof mapId === "string" ? catalog.maps.find((entry) => entry.id === mapId) : undefined;
  if (!map) {
    errors.push(`${prefix}.mapId가 현재 catalog에 없는 맵입니다.`);
  }
  if (!isReviewStatus(value.status)) {
    errors.push(`${prefix}.status가 지원되지 않습니다.`);
  }
  if (typeof value.notes !== "string") {
    errors.push(`${prefix}.notes는 문자열이어야 합니다.`);
  } else if (value.notes.length > MAX_NOTES_LENGTH) {
    errors.push(`${prefix}.notes는 ${MAX_NOTES_LENGTH.toLocaleString()}자 이하여야 합니다.`);
  }
  if (!isValidTimestamp(value.updatedAt)) {
    errors.push(`${prefix}.updatedAt이 올바른 날짜가 아닙니다.`);
  }
  if (map) {
    errors.push(
      ...validateOptionSelection(
        value.selectedOptionIds,
        map.unitType,
        catalog.bOptions,
        prefix,
      ),
    );
  } else if (!Array.isArray(value.selectedOptionIds)) {
    errors.push(`${prefix}.selectedOptionIds가 배열이 아닙니다.`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: value as unknown as LocalReviewV1 };
}

export function validateReviewBundle(
  value: unknown,
  catalog: ShowcaseCatalogV1,
): ValidationResult<LocalReviewBundleV1> {
  if (!isRecord(value)) {
    return { ok: false, errors: ["가져올 JSON이 객체가 아닙니다."] };
  }

  const errors: string[] = [];
  if (value.schemaVersion !== REVIEW_SCHEMA_VERSION) {
    errors.push("지원하지 않는 review schemaVersion입니다.");
  }
  if (!isValidTimestamp(value.exportedAt)) {
    errors.push("exportedAt이 올바른 날짜가 아닙니다.");
  }
  if (!Array.isArray(value.reviews)) {
    errors.push("reviews가 배열이 아닙니다.");
  } else {
    value.reviews.forEach((review, index) => {
      const result = validateReview(review, catalog, `reviews[${index}]`);
      if (!result.ok) {
        errors.push(...result.errors);
      }
    });

    const mapIds = value.reviews
      .filter(isRecord)
      .map((review) => review.mapId)
      .filter((mapId): mapId is string => typeof mapId === "string");
    if (new Set(mapIds).size !== mapIds.length) {
      errors.push("reviews에 같은 mapId가 중복되어 있습니다.");
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors: [...new Set(errors)] };
  }
  return { ok: true, value: value as unknown as LocalReviewBundleV1 };
}

export interface SelectionChange {
  selectedOptionIds: string[];
  addedOptionIds: string[];
  removedOptionIds: string[];
}

export function changeOptionSelection(
  currentIds: string[],
  optionId: string,
  checked: boolean,
  unitType: string,
  options: BOptionV1[],
): SelectionChange {
  const before = new Set(currentIds);
  const selected = new Set(currentIds);
  const optionById = new Map(options.map((option) => [option.id, option]));
  const target = optionById.get(optionId);

  if (!target) {
    throw new Error(`알 수 없는 B옵션입니다: ${optionId}`);
  }
  if (
    target.compatibleUnitTypes.length > 0 &&
    !target.compatibleUnitTypes.includes(unitType)
  ) {
    throw new Error(`${target.label} 옵션은 ${unitType} 세대형과 호환되지 않습니다.`);
  }

  if (checked) {
    const adding = new Set<string>();
    const visiting = new Set<string>();
    const addWithRequirements = (id: string): void => {
      if (adding.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`B옵션 필수 조건이 순환합니다: ${id}`);
      }
      const option = optionById.get(id);
      if (!option) {
        throw new Error(`${id} 필수 옵션을 catalog에서 찾을 수 없습니다.`);
      }
      if (
        option.compatibleUnitTypes.length > 0 &&
        !option.compatibleUnitTypes.includes(unitType)
      ) {
        throw new Error(`${option.label} 필수 옵션은 ${unitType} 세대형과 호환되지 않습니다.`);
      }
      visiting.add(id);
      option.requires.forEach(addWithRequirements);
      if (
        option.requiresAny.length > 0 &&
        !option.requiresAny.some((alternative) => selected.has(alternative) || adding.has(alternative))
      ) {
        addWithRequirements(option.requiresAny[0]);
      }
      visiting.delete(id);
      adding.add(id);
    };
    addWithRequirements(optionId);

    for (const id of adding) {
      const option = optionById.get(id)!;
      for (const existingId of [...selected]) {
        const existing = optionById.get(existingId);
        if (
          option.excludes.includes(existingId) ||
          existing?.excludes.includes(id)
        ) {
          selected.delete(existingId);
        }
      }
      selected.add(id);
    }
  } else {
    selected.delete(optionId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...selected]) {
        const option = optionById.get(id);
        if (!option) {
          selected.delete(id);
          changed = true;
          continue;
        }
        if (
          option.requires.some((required) => !selected.has(required)) ||
          (option.requiresAny.length > 0 &&
            !option.requiresAny.some((alternative) => selected.has(alternative)))
        ) {
          selected.delete(id);
          changed = true;
        }
      }
    }
  }

  const selectedOptionIds = options
    .map((option) => option.id)
    .filter((id) => selected.has(id));
  return {
    selectedOptionIds,
    addedOptionIds: selectedOptionIds.filter((id) => !before.has(id)),
    removedOptionIds: [...before].filter((id) => !selected.has(id)),
  };
}

export function optionUnitPrice(option: BOptionV1, unitType?: string): number {
  if (unitType) {
    const unitPrice = option.prices[unitType];
    if (typeof unitPrice === "number" && Number.isFinite(unitPrice) && unitPrice >= 0) {
      return unitPrice;
    }
  }
  return option.price;
}

export function optionQuote(
  selectedOptionIds: string[],
  options: BOptionV1[],
  unitType?: string,
): number {
  const selected = new Set(selectedOptionIds);
  return options.reduce(
    (total, option) => total + (selected.has(option.id) ? optionUnitPrice(option, unitType) : 0),
    0,
  );
}

export function makeReviewBundle(reviews: LocalReviewV1[], now = new Date()): LocalReviewBundleV1 {
  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    reviews: reviews.map((review) => ({
      ...review,
      selectedOptionIds: [...review.selectedOptionIds],
    })),
  };
}
