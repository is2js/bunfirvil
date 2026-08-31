import type { ApartmentGeometry, ApartmentInteriorProp, BOptionEntry } from './types';

type UnitTypeId = '51A' | '55A' | '55B' | '59A';
type Point = [number, number];
type StorageWallEdge = 'north' | 'east' | 'south' | 'west';

interface StorageWallAnchorV1 {
  roomId: 'bedroom-1' | 'dress-room';
  edge: StorageWallEdge;
  featureNearestRoomId: 'dress-room' | 'bedroom-2';
}

interface DesignWallRunV1 {
  id: string;
  roomZoneId: 'living' | 'entry';
  segmentIds: string[];
  interiorNormal: Point;
}

interface InfinityDoorAnchorV1 {
  roomId: 'bedroom-1' | 'bedroom-2' | 'bedroom-3' | 'alpha-room';
  openingId?: string;
  gap?: [Point, Point];
  interiorNormal: Point;
}

export interface BundangOptionLayoutV1 {
  unitType: UnitTypeId;
  designWallRuns: DesignWallRunV1[];
  infinityDoors: InfinityDoorAnchorV1[];
  bedroomOneStorage: StorageWallAnchorV1;
  dressRoomPowderStorage: StorageWallAnchorV1;
}

export const BUNDANG_DESIGN_WALL_OPTION_ID = 'living-design-wall-panel';
const BEDROOM_ONE_DOOR_OPTION_ID = 'infinity-door-bedroom-1';
const ALL_DOORS_OPTION_ID = 'infinity-door-all-bedrooms';
const DESIGN_WALL_DEPTH_METERS = 0.02;
const FINISH_CLEARANCE_METERS = 0.002;
const DEFAULT_INTERIOR_WALL_THICKNESS_METERS = 0.12;
const INTEGRATED_BIDET_OPTION_ID = 'toilet-integrated-bidet';
const OPEN_PREMIUM_SHOE_CABINET_OPTION_ID = 'entry-open-premium-shoe-cabinet';
const WIDE_PLANK_FLOOR_OPTION_ID = 'wide-plank-floor-finish';
const BEDROOM_ONE_PET_CLOSET_OPTION_ID = 'bedroom-1-built-in-closet-pet';
const BEDROOM_ONE_CLOTHING_CARE_CLOSET_OPTION_ID = 'bedroom-1-clothing-care-closet';
const DRESS_ROOM_POWDER_STORAGE_OPTION_ID = 'dress-room-powder-storage';
const BATHROOM_COMBINATION_VENTILATOR_OPTION_ID = 'bathroom-combination-ventilator';
const BEDROOM_STORAGE_DEPTH_METERS = 0.58;
const BEDROOM_STORAGE_HEIGHT_METERS = 2.2;
const STORAGE_EDGE_CLEARANCE_METERS = 0.02;
const OPEN_PREMIUM_SHOE_CABINET_A_FACING_FIX = new Set<UnitTypeId>(['55A', '55B', '59A']);
const INFINITY_DOOR_ALLOWED_ROOM_IDS = new Set<string>([
  'bedroom-1',
  'bedroom-2',
  'bedroom-3',
  'alpha-room',
]);

export const BUNDANG_OPTION_DISPLAY_OVERRIDES: Readonly<Record<string, Partial<Pick<BOptionEntry, 'label' | 'description' | 'previewUrl'>>>> = Object.freeze({
  [OPEN_PREMIUM_SHOE_CABINET_OPTION_ID]: Object.freeze({
    label: '오픈형 프리미엄 신발장',
    description: '오픈형 신발장(PET)과 신발살균기·에어브러시·가구 조명·엔지니어드 스톤 구성입니다.',
  }),
  [BUNDANG_DESIGN_WALL_OPTION_ID]: Object.freeze({
    label: '디자인 월(거실/복도면)',
    description: '거실 3면과 현관에서 거실까지 이어지는 복도 벽면 전체를 동일한 디자인 월 마감으로 감쌉니다.',
  }),
  [BEDROOM_ONE_PET_CLOSET_OPTION_ID]: Object.freeze({
    previewUrl: 'assets/options/previews/bedroom-1-built-in-closet-pet-v2.png',
  }),
  [BEDROOM_ONE_CLOTHING_CARE_CLOSET_OPTION_ID]: Object.freeze({
    previewUrl: 'assets/options/previews/bedroom-1-clothing-care-closet-v2.png',
  }),
  [DRESS_ROOM_POWDER_STORAGE_OPTION_ID]: Object.freeze({
    previewUrl: 'assets/options/previews/dress-room-powder-storage-v2.png',
  }),
  [BATHROOM_COMBINATION_VENTILATOR_OPTION_ID]: Object.freeze({
    previewUrl: 'assets/options/previews/bathroom-combination-ventilator-v2.png',
  }),
});

export const BUNDANG_OPTION_PRICE_VARIANT_OVERRIDES: Readonly<Record<string, NonNullable<BOptionEntry['priceVariants']>>> = {
  'island-counter-modern': [{
    whenSelectedAny: ['kitchen-wall-countertop-radianz-golden-shore'],
    prices: { '51A': 1_410_000, '55A': 1_410_000, '55B': 1_430_000, '59A': 1_410_000 },
    label: '마감재 업글',
  }],
  'island-counter-dining-integrated': [{
    whenSelectedAny: ['kitchen-wall-countertop-radianz-golden-shore'],
    prices: { '55B': 2_490_000 },
    label: '마감재 업글',
  }],
  [BUNDANG_DESIGN_WALL_OPTION_ID]: [{
    whenSelectedAny: ['island-counter-modern', 'island-counter-dining-integrated'],
    prices: { '55B': 1_600_000 },
    label: '아일랜드 연동',
  }],
};

export const BUNDANG_OPTION_LAYOUTS: Readonly<Record<UnitTypeId, BundangOptionLayoutV1>> = Object.freeze({
  '51A': {
    unitType: '51A',
    bedroomOneStorage: { roomId: 'bedroom-1', edge: 'east', featureNearestRoomId: 'dress-room' },
    dressRoomPowderStorage: { roomId: 'dress-room', edge: 'east', featureNearestRoomId: 'bedroom-2' },
    designWallRuns: [
      { id: 'living-south', roomZoneId: 'living', segmentIds: ['outer-south-living-before', 'outer-south-living-sill', 'outer-south-living-lintel', 'outer-south-living-after'], interiorNormal: [0, -1] },
      { id: 'living-east', roomZoneId: 'living', segmentIds: ['bedroom-1-west-before', 'bedroom-1-west-lintel', 'bedroom-1-west-after'], interiorNormal: [-1, 0] },
      { id: 'living-west', roomZoneId: 'living', segmentIds: ['bedroom-2-east'], interiorNormal: [1, 0] },
      { id: 'corridor-west', roomZoneId: 'entry', segmentIds: ['bathroom-2-east-before', 'bathroom-2-east-lintel'], interiorNormal: [1, 0] },
      { id: 'corridor-east', roomZoneId: 'entry', segmentIds: ['entry-kitchen-divider'], interiorNormal: [-1, 0] },
    ],
    infinityDoors: [
      { roomId: 'bedroom-1', openingId: 'bedroom-1-west-opening', interiorNormal: [-1, 0] },
      { roomId: 'bedroom-2', openingId: 'bedroom-2-north-opening', interiorNormal: [0, -1] },
    ],
  },
  '55A': {
    unitType: '55A',
    bedroomOneStorage: { roomId: 'bedroom-1', edge: 'west', featureNearestRoomId: 'dress-room' },
    dressRoomPowderStorage: { roomId: 'dress-room', edge: 'west', featureNearestRoomId: 'bedroom-2' },
    designWallRuns: [
      { id: 'living-south', roomZoneId: 'living', segmentIds: ['outer-south-living-before', 'outer-south-living-sill', 'outer-south-living-lintel', 'outer-south-living-after'], interiorNormal: [0, -1] },
      { id: 'living-west', roomZoneId: 'living', segmentIds: ['bedroom-1-east-before', 'bedroom-1-east-after'], interiorNormal: [1, 0] },
      { id: 'living-east', roomZoneId: 'living', segmentIds: ['alpha-west'], interiorNormal: [-1, 0] },
      { id: 'corridor-north', roomZoneId: 'entry', segmentIds: ['pantry-kitchen-short-return', 'pantry-south', 'bathroom-2-entry-return'], interiorNormal: [0, 1] },
      { id: 'corridor-south', roomZoneId: 'entry', segmentIds: ['alpha-north-before', 'alpha-north-lintel', 'alpha-north-after', 'bedroom-2-north-before', 'bedroom-2-north-lintel', 'bedroom-2-north-after'], interiorNormal: [0, -1] },
    ],
    infinityDoors: [
      { roomId: 'bedroom-1', gap: [[3.4, 4.95], [3.4, 5.85]], interiorNormal: [1, 0] },
      { roomId: 'bedroom-2', openingId: 'bedroom-2-north-opening', interiorNormal: [0, -1] },
      { roomId: 'alpha-room', openingId: 'alpha-north-opening', interiorNormal: [0, -1] },
    ],
  },
  '55B': {
    unitType: '55B',
    bedroomOneStorage: { roomId: 'bedroom-1', edge: 'north', featureNearestRoomId: 'dress-room' },
    dressRoomPowderStorage: { roomId: 'dress-room', edge: 'north', featureNearestRoomId: 'bedroom-2' },
    designWallRuns: [
      { id: 'living-west', roomZoneId: 'living', segmentIds: ['outer-west-living-before', 'outer-west-living-sill', 'outer-west-living-lintel', 'outer-west-living-after'], interiorNormal: [1, 0] },
      { id: 'living-north', roomZoneId: 'living', segmentIds: ['bedroom-1-south'], interiorNormal: [0, 1] },
      { id: 'living-south', roomZoneId: 'living', segmentIds: ['outdoor-unit-north', 'utility-north'], interiorNormal: [0, -1] },
      { id: 'corridor-north', roomZoneId: 'entry', segmentIds: ['bathroom-1-south', 'pantry-south', 'bathroom-2-entry-return'], interiorNormal: [0, 1] },
      { id: 'corridor-south', roomZoneId: 'entry', segmentIds: ['kitchen-alpha-north-return', 'alpha-north-door-before', 'alpha-north-door-lintel', 'alpha-north-door-after', 'alpha-north-after-door', 'bedroom-2-north-before', 'bedroom-2-north-lintel', 'bedroom-2-north-after'], interiorNormal: [0, -1] },
    ],
    infinityDoors: [
      { roomId: 'bedroom-1', gap: [[2.5, 4.1], [3.55, 4.1]], interiorNormal: [0, 1] },
      { roomId: 'bedroom-2', openingId: 'bedroom-2-north-opening', interiorNormal: [0, -1] },
      { roomId: 'alpha-room', openingId: 'alpha-north-door-opening', interiorNormal: [0, -1] },
    ],
  },
  '59A': {
    unitType: '59A',
    bedroomOneStorage: { roomId: 'bedroom-1', edge: 'west', featureNearestRoomId: 'dress-room' },
    dressRoomPowderStorage: { roomId: 'dress-room', edge: 'west', featureNearestRoomId: 'bedroom-2' },
    designWallRuns: [
      { id: 'living-south', roomZoneId: 'living', segmentIds: ['outer-south-living-before', 'outer-south-living-sill', 'outer-south-living-lintel', 'outer-south-living-after'], interiorNormal: [0, -1] },
      { id: 'living-west', roomZoneId: 'living', segmentIds: ['bedroom-1-east-before', 'bedroom-1-east-after'], interiorNormal: [1, 0] },
      { id: 'living-east', roomZoneId: 'living', segmentIds: ['bedroom-2-west'], interiorNormal: [-1, 0] },
      { id: 'corridor-north', roomZoneId: 'entry', segmentIds: ['pantry-kitchen-short-return', 'pantry-south', 'bathroom-2-entry-short-return'], interiorNormal: [0, 1] },
      { id: 'corridor-south', roomZoneId: 'entry', segmentIds: ['bedroom-2-north-before', 'bedroom-2-north-lintel', 'bedroom-2-north-after', 'bedroom-3-north-before', 'bedroom-3-north-lintel', 'bedroom-3-north-after'], interiorNormal: [0, -1] },
    ],
    infinityDoors: [
      { roomId: 'bedroom-1', gap: [[3.4, 5.15], [3.4, 6.05]], interiorNormal: [1, 0] },
      { roomId: 'bedroom-2', openingId: 'bedroom-2-north-opening', interiorNormal: [0, -1] },
      { roomId: 'bedroom-3', openingId: 'bedroom-3-north-opening', interiorNormal: [0, -1] },
    ],
  },
});

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function point(value: unknown): Point | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function roomBounds(geometry: ApartmentGeometry, roomId: string): [number, number, number, number] | null {
  const room = (geometry.roomZones || []).map(record).find((candidate) => String(candidate?.id || candidate?.roomId || '') === roomId);
  const values = room?.boundsMeters ?? room?.bounds;
  if (!Array.isArray(values) || values.length < 4) return null;
  const [sourceX1, sourceY1, sourceX2, sourceY2] = values.map(Number);
  if (![sourceX1, sourceY1, sourceX2, sourceY2].every(Number.isFinite)) return null;
  return [
    Math.min(sourceX1, sourceX2),
    Math.min(sourceY1, sourceY2),
    Math.max(sourceX1, sourceX2),
    Math.max(sourceY1, sourceY2),
  ];
}

function boundsCenter(bounds: [number, number, number, number]): Point {
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

function storageWallPlacement(
  geometry: ApartmentGeometry,
  anchor: StorageWallAnchorV1,
  depth: number,
): { position: Point; width: number; yawDeg: number; featureAtPositiveEnd: boolean } | null {
  const bounds = roomBounds(geometry, anchor.roomId);
  if (!bounds) return null;
  const [x1, y1, x2, y2] = bounds;
  const vertical = anchor.edge === 'east' || anchor.edge === 'west';
  const width = Math.max(0.2, (vertical ? y2 - y1 : x2 - x1) - STORAGE_EDGE_CLEARANCE_METERS * 2);
  const position: Point = vertical
    ? [anchor.edge === 'west' ? x1 + depth / 2 : x2 - depth / 2, (y1 + y2) / 2]
    : [(x1 + x2) / 2, anchor.edge === 'north' ? y1 + depth / 2 : y2 - depth / 2];
  const targetBounds = roomBounds(geometry, anchor.featureNearestRoomId);
  const target = targetBounds ? boundsCenter(targetBounds) : boundsCenter(bounds);
  const negativeEnd: Point = vertical ? [position[0], y1] : [x1, position[1]];
  const positiveEnd: Point = vertical ? [position[0], y2] : [x2, position[1]];
  const distanceTo = (candidate: Point) => Math.hypot(candidate[0] - target[0], candidate[1] - target[1]);
  return {
    position,
    width,
    yawDeg: vertical ? 90 : 0,
    featureAtPositiveEnd: distanceTo(positiveEnd) <= distanceTo(negativeEnd),
  };
}

function wallSpan(segment: Record<string, unknown>): { base: number; height: number } {
  const base = Number(segment.baseMeters);
  const height = Number(segment.heightMeters);
  return {
    base: Number.isFinite(base) ? base : 0,
    height: Number.isFinite(height) ? height : 2.3,
  };
}

function offsetFinish(a: Point, b: Point, normal: Point, wallThickness: number): { position: Point; yawDeg: number; length: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const offset = wallThickness / 2 + DESIGN_WALL_DEPTH_METERS / 2 + FINISH_CLEARANCE_METERS;
  return {
    position: [(a[0] + b[0]) / 2 + normal[0] * offset, (a[1] + b[1]) / 2 + normal[1] * offset],
    yawDeg: Math.atan2(dy, dx) * 180 / Math.PI,
    length,
  };
}

function designWallProps(geometry: ApartmentGeometry, layout: BundangOptionLayoutV1): ApartmentInteriorProp[] {
  const segments = new Map((geometry.wallSegments || []).flatMap((value) => {
    const segment = record(value);
    const id = String(segment?.id || '');
    return segment && id ? [[id, segment] as const] : [];
  }));
  const props: ApartmentInteriorProp[] = [];
  for (const run of layout.designWallRuns) {
    for (const segmentId of run.segmentIds) {
      const segment = segments.get(segmentId);
      const a = point(segment?.a);
      const b = point(segment?.b);
      if (!segment || !a || !b) continue;
      const thickness = Number(segment.thicknessMeters);
      const placement = offsetFinish(a, b, run.interiorNormal, Number.isFinite(thickness) ? thickness : DEFAULT_INTERIOR_WALL_THICKNESS_METERS);
      const span = wallSpan(segment);
      if (placement.length < 0.005 || span.height < 0.005) continue;
      props.push({
        id: `bunfirvil-${layout.unitType.toLowerCase()}-design-wall-${run.id}-${segmentId}`,
        assetId: 'living-art-wall-greige-stone',
        roomZoneId: run.roomZoneId,
        positionMeters: placement.position,
        dimensionsMeters: [placement.length, DESIGN_WALL_DEPTH_METERS, span.height],
        yawDeg: placement.yawDeg,
        mountHeightMeters: span.base,
        materialVariantId: 'golden-shore-engineered-stone',
        sourceOptionId: BUNDANG_DESIGN_WALL_OPTION_ID,
        anchorId: `bunfirvil.options.designWall.${run.id}.${segmentId}`,
        anchorWallSegmentId: segmentId,
        installationRole: 'wall-skin-finish',
        collisionMode: 'visual-only',
        collisionDefault: 'visual-only',
        measurementObstacle: false,
        occlusionGroupId: `wall:${segmentId}`,
        occlusionSegmentsMeters: [[a, b]],
      });
    }
  }
  return props;
}

function openingEndpoints(geometry: ApartmentGeometry, anchor: InfinityDoorAnchorV1): [Point, Point] | null {
  if (anchor.openingId) {
    const opening = (geometry.openings || []).map(record).find((candidate) => candidate?.id === anchor.openingId);
    const a = point(opening?.a);
    const b = point(opening?.b);
    if (a && b) return [a, b];
  }
  return anchor.gap || null;
}

function infinityDoorProps(
  geometry: ApartmentGeometry,
  layout: BundangOptionLayoutV1,
  allBedrooms: boolean,
): ApartmentInteriorProp[] {
  const allowedAnchors = layout.infinityDoors.filter((anchor) => INFINITY_DOOR_ALLOWED_ROOM_IDS.has(anchor.roomId));
  const anchors = allBedrooms
    ? allowedAnchors
    : allowedAnchors.filter((anchor) => anchor.roomId === 'bedroom-1').slice(0, 1);
  return anchors.flatMap((anchor): ApartmentInteriorProp[] => {
    const ends = openingEndpoints(geometry, anchor);
    if (!ends) return [];
    const [a, b] = ends;
    const placement = offsetFinish(a, b, anchor.interiorNormal, DEFAULT_INTERIOR_WALL_THICKNESS_METERS);
    if (placement.length < 0.2) return [];
    return [{
      id: `bunfirvil-${layout.unitType.toLowerCase()}-infinity-door-${anchor.roomId}`,
      assetId: 'interior-infinity-door-panel',
      roomZoneId: anchor.roomId,
      positionMeters: placement.position,
      dimensionsMeters: [placement.length, DESIGN_WALL_DEPTH_METERS, 2.2],
      yawDeg: placement.yawDeg,
      mountHeightMeters: 0,
      materialVariantId: 'golden-shore-engineered-stone',
      sourceOptionId: allBedrooms ? ALL_DOORS_OPTION_ID : BEDROOM_ONE_DOOR_OPTION_ID,
      anchorId: `bunfirvil.options.infinityDoor.${anchor.roomId}`,
      replacesOpeningId: anchor.openingId,
      installationRole: 'wall-door-finish',
      collisionMode: 'visual-only',
      collisionDefault: 'visual-only',
      measurementObstacle: false,
      occlusionGroupId: `door:${anchor.roomId}`,
      occlusionSegmentsMeters: [[a, b]],
    }];
  });
}

function bedroomOneStorageProps(
  geometry: ApartmentGeometry,
  layout: BundangOptionLayoutV1,
  optionId: typeof BEDROOM_ONE_PET_CLOSET_OPTION_ID | typeof BEDROOM_ONE_CLOTHING_CARE_CLOSET_OPTION_ID,
): ApartmentInteriorProp[] {
  const placement = storageWallPlacement(geometry, layout.bedroomOneStorage, BEDROOM_STORAGE_DEPTH_METERS);
  if (!placement) return [];
  const clothingCare = optionId === BEDROOM_ONE_CLOTHING_CARE_CLOSET_OPTION_ID;
  return [{
    id: `bunfirvil-${layout.unitType.toLowerCase()}-${optionId}-full-wall`,
    assetId: clothingCare
      ? 'bunfirvil-bedroom-1-clothing-care-full-wall'
      : 'bunfirvil-bedroom-1-pet-full-wall',
    roomZoneId: 'bedroom-1',
    positionMeters: placement.position,
    dimensionsMeters: [placement.width, BEDROOM_STORAGE_DEPTH_METERS, BEDROOM_STORAGE_HEIGHT_METERS],
    yawDeg: placement.yawDeg,
    mirrored: clothingCare && !placement.featureAtPositiveEnd,
    materialVariantId: 'pet-warm-ivory',
    sourceOptionId: optionId,
    anchorId: 'bunfirvil.options.storage.bedroom-1.fullWall',
    installationRole: 'bedroom-storage-full-wall',
    collisionMode: 'solid',
    measurementObstacle: true,
  }];
}

function dressRoomPowderStorageProps(
  geometry: ApartmentGeometry,
  layout: BundangOptionLayoutV1,
): ApartmentInteriorProp[] {
  const placement = storageWallPlacement(geometry, layout.dressRoomPowderStorage, BEDROOM_STORAGE_DEPTH_METERS);
  if (!placement) return [];
  return [{
    id: `bunfirvil-${layout.unitType.toLowerCase()}-dress-room-powder-storage-full-wall`,
    assetId: 'bunfirvil-dress-room-powder-storage-full-wall',
    roomZoneId: 'dress-room',
    positionMeters: placement.position,
    dimensionsMeters: [placement.width, BEDROOM_STORAGE_DEPTH_METERS, BEDROOM_STORAGE_HEIGHT_METERS],
    yawDeg: placement.yawDeg,
    mirrored: !placement.featureAtPositiveEnd,
    materialVariantId: 'pet-warm-ivory',
    sourceOptionId: DRESS_ROOM_POWDER_STORAGE_OPTION_ID,
    anchorId: 'bunfirvil.options.dressRoomPowderStorage.fullWall',
    installationRole: 'dress-room-storage-full-wall',
    collisionMode: 'solid',
    measurementObstacle: true,
  }];
}

function isLegacyPrecisionStorageProp(prop: ApartmentInteriorProp): boolean {
  const id = String(prop.id || '');
  const anchorId = String(prop.anchorId || '');
  return anchorId === 'options.storage.bedroom-1'
    || anchorId === 'options.dressRoomPowderStorage'
    || /-bedroom-1(?:-clothing-care)?-wardrobe$/.test(id)
    || /-dress-room-powder-storage$/.test(id);
}

function refineWidePlankAndVentilatorProp(prop: ApartmentInteriorProp): ApartmentInteriorProp {
  if (prop.assetId === WIDE_PLANK_FLOOR_OPTION_ID) {
    return { ...prop, sourceOptionId: WIDE_PLANK_FLOOR_OPTION_ID };
  }
  if (prop.assetId === BATHROOM_COMBINATION_VENTILATOR_OPTION_ID) {
    return {
      ...prop,
      assetId: 'bunfirvil-bathroom-combination-ventilator-rounded',
      dimensionsMeters: [.52, .34, .12],
      sourceOptionId: BATHROOM_COMBINATION_VENTILATOR_OPTION_ID,
    };
  }
  return prop;
}

function isLegacyEntryLivingOptionProp(prop: ApartmentInteriorProp): boolean {
  const id = String(prop.id || '');
  const anchorId = String(prop.anchorId || '');
  return anchorId === 'options.livingDesignWall'
    || anchorId.startsWith('options.infinityDoor.')
    || /-living-design-wall(?:$|-)/.test(id)
    || /-infinity-door-/.test(id);
}

function alignIntegratedBidetToDefaultFacing(prop: ApartmentInteriorProp): ApartmentInteriorProp {
  if (prop.assetId !== INTEGRATED_BIDET_OPTION_ID || prop.sourceOptionId === INTEGRATED_BIDET_OPTION_ID) return prop;
  const yawDeg = Number(prop.yawDeg);
  return {
    ...prop,
    yawDeg: Number.isFinite(yawDeg) ? ((yawDeg + 180) % 360 + 360) % 360 : 180,
    sourceOptionId: INTEGRATED_BIDET_OPTION_ID,
  };
}

function alignOpenPremiumShoeCabinetToEntry(
  prop: ApartmentInteriorProp,
  unitType: UnitTypeId,
  planVariant: string | undefined,
): ApartmentInteriorProp {
  const isPremiumShoeCabinet = prop.sourceOptionId === OPEN_PREMIUM_SHOE_CABINET_OPTION_ID
    || prop.anchorId === 'options.entryShoeCabinet'
    || (prop.assetId === 'entry-shoe-cabinet-tall' && /premium-shoe-cabinet/.test(String(prop.id || '')));
  if (!isPremiumShoeCabinet || planVariant !== 'A' || !OPEN_PREMIUM_SHOE_CABINET_A_FACING_FIX.has(unitType)) return prop;
  const yawDeg = Number(prop.yawDeg);
  return {
    ...prop,
    yawDeg: Number.isFinite(yawDeg) ? ((yawDeg + 180) % 360 + 360) % 360 : 180,
    sourceOptionId: OPEN_PREMIUM_SHOE_CABINET_OPTION_ID,
  };
}

export function refineBundangOptionProps(
  geometry: ApartmentGeometry,
  unitTypeId: string,
  selectedIds: Iterable<string>,
  baseProps: ApartmentInteriorProp[],
  planVariant?: string,
): ApartmentInteriorProp[] {
  const unitType = String(unitTypeId || '').toUpperCase() as UnitTypeId;
  const layout = BUNDANG_OPTION_LAYOUTS[unitType];
  if (!layout) return baseProps;
  const selected = new Set(selectedIds);
  const props = baseProps
    .filter((prop) => !isLegacyEntryLivingOptionProp(prop) && !isLegacyPrecisionStorageProp(prop))
    .map(refineWidePlankAndVentilatorProp)
    .map(alignIntegratedBidetToDefaultFacing)
    .map((prop) => alignOpenPremiumShoeCabinetToEntry(prop, unitType, planVariant));
  if (selected.has(BUNDANG_DESIGN_WALL_OPTION_ID)) props.push(...designWallProps(geometry, layout));
  if (selected.has(ALL_DOORS_OPTION_ID)) props.push(...infinityDoorProps(geometry, layout, true));
  else if (selected.has(BEDROOM_ONE_DOOR_OPTION_ID)) props.push(...infinityDoorProps(geometry, layout, false));
  if (selected.has(BEDROOM_ONE_CLOTHING_CARE_CLOSET_OPTION_ID)) {
    props.push(...bedroomOneStorageProps(geometry, layout, BEDROOM_ONE_CLOTHING_CARE_CLOSET_OPTION_ID));
  } else if (selected.has(BEDROOM_ONE_PET_CLOSET_OPTION_ID)) {
    props.push(...bedroomOneStorageProps(geometry, layout, BEDROOM_ONE_PET_CLOSET_OPTION_ID));
  }
  if (selected.has(DRESS_ROOM_POWDER_STORAGE_OPTION_ID)) props.push(...dressRoomPowderStorageProps(geometry, layout));
  return props;
}

export function replacedBundangOpeningIds(unitTypeId: string, selectedIds: Iterable<string>): Set<string> {
  const unitType = String(unitTypeId || '').toUpperCase() as UnitTypeId;
  const layout = BUNDANG_OPTION_LAYOUTS[unitType];
  if (!layout) return new Set();
  const selected = new Set(selectedIds);
  const allowedAnchors = layout.infinityDoors.filter((anchor) => INFINITY_DOOR_ALLOWED_ROOM_IDS.has(anchor.roomId));
  const anchors = selected.has(ALL_DOORS_OPTION_ID)
    ? allowedAnchors
    : selected.has(BEDROOM_ONE_DOOR_OPTION_ID)
      ? allowedAnchors.filter((anchor) => anchor.roomId === 'bedroom-1').slice(0, 1)
      : [];
  return new Set(anchors.map((anchor) => anchor.openingId).filter((id): id is string => Boolean(id)));
}

export function bundangEditorSelectionPropIds(
  props: ApartmentInteriorProp[],
  selectedPropId: string,
): string[] {
  const selectedId = String(selectedPropId || '');
  const selected = props.find((prop) => String(prop.id || '') === selectedId);
  if (!selected) return [];
  if (![BUNDANG_DESIGN_WALL_OPTION_ID, WIDE_PLANK_FLOOR_OPTION_ID].includes(String(selected.sourceOptionId || ''))) return [selectedId];
  return props
    .filter((prop) => prop.sourceOptionId === selected.sourceOptionId)
    .map((prop) => String(prop.id || ''))
    .filter(Boolean);
}
