export type CharacterKey = '100' | '200';
export type Direction = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export type MotionName = 'idle' | 'walk' | 'attack' | 'cast';
export type HotbarValue = string | null;

export interface StaticMapEntry {
  id: string;
  label: string;
  unitType: string;
  revision: string;
  width: number;
  height: number;
  chunkCount: number;
  assetBytes: number;
  renderer: 'three-pbr' | 'canvas2d';
  manifestUrl: string;
  minimapUrl: string;
  spawn: { x: number; y: number };
}

export interface StaticCharacterEntry {
  key: CharacterKey;
  label: string;
  manifestUrl: string;
}

export interface StaticSkillEntry {
  id: 'warrior-shock-stun' | 'common-double-arrow' | 'common-teleport' | string;
  label: string;
  description: string;
  iconUrl: string;
  effectUrls: string[];
  cooldownMs: number;
  manaCost: number;
}

export interface BOptionEntry {
  id: string;
  label: string;
  category: string;
  price: number;
  description: string;
  compatibleUnitTypes: string[];
  requires: string[];
  requiresAny?: string[];
  excludes: string[];
  previewUrl?: string;
  prices?: Record<string, number>;
}

export interface ShowcaseCatalog {
  schemaVersion: 1;
  exportId: string;
  generatedAt: string;
  maps: StaticMapEntry[];
  characters: StaticCharacterEntry[];
  skills: StaticSkillEntry[];
  defaultHotbar: HotbarValue[];
  bOptions: BOptionEntry[];
}

export interface PaletteEntry {
  id: string;
  color: string;
}

export interface WorldManifest {
  schemaVersion?: string;
  worldId?: string;
  displayName?: string;
  bundleRevision?: string;
  revision?: string;
  bounds?: { width?: number; height?: number };
  chunk?: { width?: number; height?: number };
  projection?: { type?: string; tileWidth?: number; tileHeight?: number };
  spawn?: { x?: number; y?: number; facing?: string };
  palette?: PaletteEntry[];
  chunkUrlTemplate?: string;
  chunkUrls?: string[] | Record<string, string>;
  minimapUrl?: string;
  rendering?: { engine?: string; fallback?: string };
}

export interface WorldObject {
  id?: string;
  type?: string;
  displayName?: string;
  x?: number;
  y?: number;
  width?: number;
  depth?: number;
  bounds?: { x1?: number; y1?: number; x2?: number; y2?: number };
  floorCells?: Array<{ x: number; y: number }>;
  footprintCells?: Array<{ x: number; y: number }>;
}

export interface WorldChunk {
  chunkX?: number;
  chunkY?: number;
  origin?: { x?: number; y?: number };
  size?: { width?: number; height?: number };
  tileRuns?: Array<{ tileId?: string; count?: number }>;
  blockedCellIndices?: number[];
  visibleBlockerCellIndices?: number[];
  objects?: WorldObject[];
}

export interface WorldData {
  entry: StaticMapEntry;
  manifest: WorldManifest;
  width: number;
  height: number;
  chunkWidth: number;
  chunkHeight: number;
  palette: Map<string, string>;
  tiles: Map<string, string>;
  blocked: Set<string>;
  objects: WorldObject[];
  loadedChunkCount: number;
  requestedChunkCount: number;
  minimap: HTMLImageElement | null;
  sourceMode: 'chunks' | 'minimap' | 'procedural';
}

export interface SpriteActionDefinition {
  sheet?: string;
  frameCount?: number;
  sheetFrameWidth?: number;
  sheetFrameHeight?: number;
  sheetRows?: number;
  sheetColumns?: number;
}

export interface CharacterManifest {
  schemaVersion?: number;
  assetKey?: string;
  name?: string;
  cellSize?: number;
  footY?: number;
  displaySize?: number;
  directions?: Direction[];
  defaultActions?: Partial<Record<MotionName, string>>;
  motions?: Partial<
    Record<
      MotionName,
      {
        loop?: boolean;
        durationMs?: number;
        actions?: Record<string, SpriteActionDefinition>;
      }
    >
  >;
}

export interface ActorState {
  key: CharacterKey;
  label: string;
  x: number;
  y: number;
  direction: Direction;
  motion: MotionName;
  motionUntil: number;
  moving: boolean;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface ReviewPayload {
  schemaVersion?: number;
  mapId?: string;
  status?: string;
  notes?: string;
  selectedOptionIds?: string[];
  bOptionIds?: string[];
  updatedAt?: string;
  [key: string]: unknown;
}
