export const REVIEW_SCHEMA_VERSION = 1 as const;

export const REVIEW_STATUSES = ["unreviewed", "pass", "needs-work"] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface StaticMapEntryV1 {
  id: string;
  label: string;
  unitType: string;
  revision: string;
  width: number;
  height: number;
  chunkCount: number;
  assetBytes: number;
  renderer: "three-pbr" | "canvas2d";
  manifestUrl: string;
  minimapUrl: string;
  spawn: {
    x: number;
    y: number;
  };
}

export interface BOptionV1 {
  id: string;
  label: string;
  category: string;
  price: number;
  prices: Record<string, number>;
  description: string;
  compatibleUnitTypes: string[];
  requires: string[];
  requiresAny: string[];
  excludes: string[];
  previewUrl?: string;
}

export interface ShowcaseCatalogV1 {
  schemaVersion: 1;
  exportId: string;
  generatedAt: string;
  maps: StaticMapEntryV1[];
  characters: unknown[];
  skills: unknown[];
  defaultHotbar: unknown[];
  bOptions: BOptionV1[];
}

export interface LocalReviewV1 {
  mapId: string;
  status: ReviewStatus;
  notes: string;
  selectedOptionIds: string[];
  updatedAt: string;
}

export interface LocalReviewBundleV1 {
  schemaVersion: 1;
  exportedAt: string;
  reviews: LocalReviewV1[];
}

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export interface ValidationFailure {
  ok: false;
  errors: string[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;
