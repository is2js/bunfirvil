import { defaultReview, validateReview } from "./review-model";
import type { LocalReviewV1, ShowcaseCatalogV1 } from "./types";

const STORAGE_KEY_PREFIX = "bunfirvil:review:v1:";

export function reviewStorageKey(mapId: string): string {
  return `${STORAGE_KEY_PREFIX}${mapId}`;
}

export interface LoadedReview {
  review: LocalReviewV1;
  warning?: string;
}

export function migrateLegacyReviewFields(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const matchesLegacyShape =
    typeof record.mapId === "string" &&
    Array.isArray(record.selectedOptionIds) &&
    typeof record.updatedAt === "string";
  if (!matchesLegacyShape) {
    return value;
  }

  const migrated = { ...record };
  if (!Object.prototype.hasOwnProperty.call(record, "status")) {
    migrated.status = "unreviewed";
  }
  if (!Object.prototype.hasOwnProperty.call(record, "notes")) {
    migrated.notes = "";
  }
  return migrated;
}

export function loadReview(mapId: string, catalog: ShowcaseCatalogV1): LoadedReview {
  const fallback = defaultReview(mapId);
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(reviewStorageKey(mapId));
  } catch {
    return {
      review: fallback,
      warning: "브라우저 저장소를 읽을 수 없어 이번 탭에서만 검수정보가 유지됩니다.",
    };
  }

  if (raw === null) {
    return { review: fallback };
  }

  try {
    const stored = migrateLegacyReviewFields(JSON.parse(raw) as unknown);
    const result = validateReview(stored, catalog, `저장된 ${mapId} 검수정보`);
    if (result.ok) {
      return {
        review: {
          ...result.value,
          selectedOptionIds: [...result.value.selectedOptionIds],
        },
      };
    }
    return {
      review: fallback,
      warning: `${mapId}의 저장값을 무시했습니다. ${result.errors.join(" ")}`,
    };
  } catch {
    return {
      review: fallback,
      warning: `${mapId}의 저장값이 올바른 JSON이 아니어서 무시했습니다.`,
    };
  }
}

export function saveReview(review: LocalReviewV1): void {
  window.localStorage.setItem(reviewStorageKey(review.mapId), JSON.stringify(review));
}

export function removeReview(mapId: string): void {
  window.localStorage.removeItem(reviewStorageKey(mapId));
}
