export const MAP_IDS = [
  "bundang-first-village-51a-prototype",
  "bundang-first-village-55a-prototype",
  "bundang-first-village-55b-prototype",
  "bundang-first-village-59a-prototype",
] as const;

export type MapId = (typeof MAP_IDS)[number];
export type ActorKey = "100" | "200";
export type SkillId =
  | "warrior-shock-stun"
  | "common-double-arrow"
  | "common-teleport";
export type ActionId = "basic-attack" | SkillId;
export type ReviewStatus = "unreviewed" | "pass" | "needs-work";

export interface StaticMapEntryV1 {
  id: MapId;
  label: string;
  unitType: "51A" | "55A" | "55B" | "59A";
  revision: string;
  width: number;
  height: number;
  chunkCount: number;
  assetBytes: number;
  renderer: "three-pbr" | "canvas2d";
  manifestUrl: string;
  minimapUrl: string;
  spawn: { x: number; y: number };
}

export interface CharacterEntryV1 {
  key: ActorKey;
  label: string;
  manifestUrl: string;
}

export interface SkillEntryV1 {
  id: SkillId;
  label: string;
  description: string;
  iconUrl: string;
  effectUrls: string[];
  cooldownMs: number;
  manaCost: number;
}

export interface BOptionEntryV1 {
  id: string;
  label: string;
  category: string;
  price: number;
  description: string;
  compatibleUnitTypes: string[];
  requires: string[];
  requiresAny?: string[];
  excludes: string[];
  prices?: Record<string, number>;
  previewUrl?: string;
}

export interface ShowcaseCatalogV1 {
  schemaVersion: 1;
  exportId: string;
  generatedAt: string;
  maps: StaticMapEntryV1[];
  characters: CharacterEntryV1[];
  skills: SkillEntryV1[];
  defaultHotbar: [
    ActionId,
    ActionId,
    ActionId,
    ActionId,
    null,
    null,
    null,
    null,
  ];
  bOptions: BOptionEntryV1[];
}

export interface SourceExportFileV1 {
  sourcePath: string;
  outputPath: string;
  transform: string;
  sourceSha256: string | null;
  outputSha256: string;
  byteLength: number;
  publicPath: string;
  sha256: string;
  bytes: number;
  rightsClass:
    | "maintainer-reviewed-project-asset"
    | "maintainer-reviewed-project-source"
    | "exporter-generated-metadata";
  publicationApprovalCategory: string;
}

export interface PublicationApprovalV1 {
  policyType: "maintainer-reviewed-publication-allowlist";
  policyVersion: string;
  policySha256: string;
  defaultDecision: "deny";
  legalRightsProof: false;
  statement: string;
}

export interface SourceExportV1 {
  schemaVersion: 1;
  exportId: string;
  generatedAt: string;
  sourceRepository: "pvp";
  sourceHead: string;
  sourceDirty: boolean;
  publicationApproval: PublicationApprovalV1;
  files: SourceExportFileV1[];
}

export interface LocalReviewV1 {
  mapId: MapId;
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

export interface HotbarStateV1 {
  schemaVersion: 1;
  actorKey: ActorKey;
  slots: Array<ActionId | null>;
}
