// @ts-nocheck
// PVP RPG 검수맵과 동일한 130 mm 자동·2점 방향 레이저 실측 계산 계약.
export type InspectionLaserAxis = "x" | "y";
export type InspectionLaserPhase = "hover" | "pick-start" | "await-second" | "complete";
export interface InspectionLaserSurfaceHit {
  valid: boolean;
  reason?: string;
  point?: [number, number];
  sourcePlanPoint?: [number, number];
  constrainedPlanPoint?: [number, number];
  snapped?: boolean;
  snapDistanceMeters?: number;
  obstacleId?: string;
  kind?: string;
  label?: string;
  directionalSurface?: boolean;
  clearFinishCalibrated?: boolean;
  [key: string]: any;
}
export interface InspectionLaserMeasurement {
  valid: boolean;
  reason?: string;
  axis?: InspectionLaserAxis | "free";
  measurementMode?: "point-ray" | "point-pair" | string;
  anchorPlanPoint?: [number, number];
  sourceAnchorPlanPoint?: [number, number];
  anchorSnapped?: boolean;
  snappedFromObstacle?: { id?: string; kind?: string; label?: string } | null;
  laserHeightMeters?: number;
  distanceMeters?: number;
  distanceMm?: number;
  rawDistanceMeters?: number;
  rawDistanceMm?: number;
  finishCalibrationApplied?: boolean;
  finishCalibrationMm?: number;
  authoredRoomMaximumApplied?: boolean;
  authoredRoomMaximumMeters?: number;
  authoredRoomMaximumMm?: number;
  authoredRoomDimensionId?: string;
  dimensionAnnotationId?: string;
  dimensionAnnotationMm?: number | null;
  dimensionLimitMm?: number | null;
  label?: string;
  negativeHit?: InspectionLaserSurfaceHit;
  positiveHit?: InspectionLaserSurfaceHit;
  startHit?: InspectionLaserSurfaceHit;
  endHit?: InspectionLaserSurfaceHit;
  rayDirection?: [number, number];
  obstacle?: { id?: string; kind?: string; label?: string };
  [key: string]: any;
}
export interface InspectionLaserInput {
  anchorPlanPoint?: [number, number] | { x?: number; y?: number };
  axis?: InspectionLaserAxis;
  geometry?: any;
  props?: any[] | null;
  assets?: any[];
  laserHeightMeters?: number;
  [key: string]: any;
}

const EPSILON = 0.00001;
export const ISTARPARK_LASER_HEIGHT_METERS = 0.13;
const FINISH_CALIBRATION_MAX_SHRINK_METERS = 0.2;
const FINISH_CALIBRATION_MAX_FACE_SHIFT_METERS = 0.15;
const FINISH_CALIBRATION_ENDPOINT_TOLERANCE_METERS = 0.02;
const finishCalibrationCache = new WeakMap();
const KNOWN_PROP_DIMENSIONS = Object.freeze({
  "toilet-floor-mounted": [0.40, 0.70, 0.75],
  "vanity-basin-compact": [0.80, 0.50, 0.85],
  "entry-pantry-cabinet": [1.20, 0.45, 2.20],
  "entry-shoe-cabinet-tall": [1.20, 0.35, 2.20],
  "istarpark-owned-wall-tv": [1.45, 0.045, 0.825],
  "istarpark-owned-computer-desk-1200": [1.20, 0.80, 0.745],
  "istarpark-owned-computer-desk-800": [0.80, 0.80, 0.745],
  "istarpark-owned-dining-table": [1.40, 0.80, 0.745],
  "istarpark-owned-bed": [1.70, 2.11, 1.15],
  "istarpark-owned-side-storage": [0.45, 0.46, 0.48],
  "istarpark-owned-refrigerator": [0.90, 0.87, 1.79],
  "istarpark-owned-underwear-dresser": [0.60, 0.40, 1.10],
  "istarpark-owned-open-bookshelf-5x3": [1.20, 0.285, 1.94],
  "istarpark-owned-open-bookshelf-3x3": [1.20, 0.285, 1.17],
  "istarpark-owned-sofa-three-seat": [2.25, 0.96, 0.90],
  "istarpark-owned-tower-air-conditioner": [0.42, 0.41, 1.85],
});

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function point(value = []) {
  if (Array.isArray(value)) return [finite(value?.[0]), finite(value?.[1])];
  return [finite(value?.x), finite(value?.y)];
}

function boundsPolygon(row = {}) {
  const bounds = row.boundsMeters || row.bounds;
  if (!Array.isArray(bounds) || bounds.length < 4) return [];
  const [x1, y1, x2, y2] = bounds.map((value) => finite(value));
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

function rowPolygon(row = {}) {
  const polygon = row.footprintPolygonMeters || row.polygon;
  return Array.isArray(polygon) && polygon.length >= 3
    ? polygon.map(point)
    : boundsPolygon(row);
}

function pointOnSegment(target, start, end) {
  const cross = (end[0] - start[0]) * (target[1] - start[1])
    - (end[1] - start[1]) * (target[0] - start[0]);
  if (Math.abs(cross) > EPSILON) return false;
  const dot = (target[0] - start[0]) * (end[0] - start[0])
    + (target[1] - start[1]) * (end[1] - start[1]);
  const lengthSquared = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  return dot >= -EPSILON && dot <= lengthSquared + EPSILON;
}

export function istarparkLaserPointInPolygon(target: any = [], polygon: any = []): boolean {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const candidate = point(target);
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = point(polygon[index]);
    const previousPoint = point(polygon[previous]);
    if (pointOnSegment(candidate, previousPoint, currentPoint)) return true;
    const crosses = (currentPoint[1] > candidate[1]) !== (previousPoint[1] > candidate[1])
      && candidate[0] < (previousPoint[0] - currentPoint[0])
        * (candidate[1] - currentPoint[1])
        / ((previousPoint[1] - currentPoint[1]) || Number.EPSILON)
        + currentPoint[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function wallPolygon(segment = {}) {
  if (!Array.isArray(segment.a) || !Array.isArray(segment.b)) return [];
  // Lintels and headers are overhead-only and must not close a clear doorway.
  if (finite(segment.baseMeters) > 0.35) return [];
  const start = point(segment.a);
  const end = point(segment.b);
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) return [];
  const half = Math.max(0.001, finite(segment.thicknessMeters, 0.12) / 2);
  const normal = [-dy / length * half, dx / length * half];
  return [
    [start[0] + normal[0], start[1] + normal[1]],
    [end[0] + normal[0], end[1] + normal[1]],
    [end[0] - normal[0], end[1] - normal[1]],
    [start[0] - normal[0], start[1] - normal[1]],
  ];
}

function propAsset(prop = {}, assets = []) {
  return (Array.isArray(assets) ? assets : [])
    .find((candidate) => String(candidate?.assetId || candidate?.id || "") === String(prop.assetId || ""));
}

function propDimensions(prop = {}, assets = []) {
  const asset = propAsset(prop, assets);
  const source = prop.renderDimensionsMeters
    || prop.dimensionsMeters
    || asset?.defaultDimensionsMeters
    || asset?.dimensionsMeters
    || KNOWN_PROP_DIMENSIONS[String(prop.assetId || "")];
  if (Array.isArray(source)) return [finite(source[0]), finite(source[1]), finite(source[2])];
  return [
    finite(source?.width),
    finite(source?.depth),
    finite(source?.height),
  ];
}

function propPolygon(prop = {}, assets = []) {
  const [width, depth] = propDimensions(prop, assets);
  if (width <= EPSILON || depth <= EPSILON) return [];
  const center = point(prop.positionMeters);
  const radians = finite(prop.yawDeg) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    [-width / 2, -depth / 2], [width / 2, -depth / 2],
    [width / 2, depth / 2], [-width / 2, depth / 2],
  ].map(([x, y]) => [
    center[0] + x * cosine - y * sine,
    center[1] + x * sine + y * cosine,
  ]);
}

function rowCrossesLaserHeight(row = {}, laserHeightMeters = ISTARPARK_LASER_HEIGHT_METERS, fallbackHeight = Number.POSITIVE_INFINITY) {
  const baseMeters = finite(
    row.baseMeters
      ?? row.elevationMeters
      ?? row.mountHeightMeters
      ?? (Array.isArray(row.positionMeters) ? row.positionMeters[2] : null),
    0,
  );
  const explicitHeight = row.heightMeters
    ?? row.renderDimensionsMeters?.[2]
    ?? row.dimensionsMeters?.[2];
  const heightMeters = explicitHeight == null ? fallbackHeight : Math.max(0, finite(explicitHeight));
  return laserHeightMeters >= baseMeters - EPSILON
    && laserHeightMeters <= baseMeters + heightMeters + EPSILON;
}

function propIsMeasurable(prop = {}, assets = [], laserHeightMeters = ISTARPARK_LASER_HEIGHT_METERS) {
  const asset = propAsset(prop, assets);
  const mountKind = String(prop.mountKind || prop.mountingKind || asset?.mountKind || asset?.mounting?.kind || "").toLowerCase();
  const role = `${prop.installationRole || ""} ${prop.fixtureRole || ""}`.toLowerCase();
  const explicitCollision = prop.collision ?? prop.collisionMode ?? asset?.collisionMode ?? asset?.collisionDefault;
  const identity = [
    prop.assetId,
    prop.id,
    prop.metadata?.placeableKind,
    asset?.assetId,
    asset?.metadata?.placeableKind,
    mountKind,
    role,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (prop.measurementObstacle === false) return false;
  if (
    ["room-finish", "ceiling"].includes(mountKind)
    || role.includes("floor-finish")
    || /floor[-_ ]?finish|finish[-_ ]?floor|wide[-_ ]?plank[-_ ]?floor|porcelain[-_ ]?tile[-_ ]?floor/.test(identity)
  ) return false;
  if (String(explicitCollision || "").toLowerCase() === "visual-only") return false;
  const dimensions = propDimensions(prop, assets);
  const verticalRow = {
    ...prop,
    renderDimensionsMeters: Array.isArray(prop.renderDimensionsMeters) ? prop.renderDimensionsMeters : dimensions,
  };
  return rowCrossesLaserHeight(verticalRow, laserHeightMeters);
}

function obstacleLabel(kind = "") {
  if (kind === "wall") return "벽";
  if (kind === "furniture") return "가구";
  if (kind === "fixture") return "고정 설비";
  if (kind === "service-wall") return "설비벽";
  return "구조물";
}

export function istarparkLaserObstacles({
  geometry = {},
  props = null,
  assets = [],
  laserHeightMeters = ISTARPARK_LASER_HEIGHT_METERS,
}: InspectionLaserInput = {}): any[] {
  const measurementHeight = Math.max(0, finite(laserHeightMeters, ISTARPARK_LASER_HEIGHT_METERS));
  const rows = [];
  for (const wall of Array.isArray(geometry.wallSegments) ? geometry.wallSegments : []) {
    const polygon = wallPolygon(wall);
    if (polygon.length >= 3) rows.push({
      id: String(wall.id || "wall"),
      kind: "wall",
      label: "벽",
      polygon,
      centerLine: [point(wall.a), point(wall.b)],
    });
  }
  for (const block of Array.isArray(geometry.solidBlocks) ? geometry.solidBlocks : []) {
    if (!rowCrossesLaserHeight(block, measurementHeight, finite(geometry.clearHeightMeters, 2.3))) continue;
    const polygon = rowPolygon(block);
    if (polygon.length < 3) continue;
    const role = `${block.structuralRole || ""} ${block.role || ""}`.toLowerCase();
    const kind = role.includes("service") ? "service-wall" : "structure";
    rows.push({ id: String(block.id || "solid-block"), kind, label: obstacleLabel(kind), polygon });
  }
  for (const fixture of Array.isArray(geometry.kitchenFixtures) ? geometry.kitchenFixtures : []) {
    if (!rowCrossesLaserHeight(fixture, measurementHeight)) continue;
    const polygon = rowPolygon(fixture);
    if (polygon.length >= 3) rows.push({ id: String(fixture.id || "fixture"), kind: "fixture", label: "고정 설비", polygon });
  }
  const effectiveProps = Array.isArray(props) ? props : (Array.isArray(geometry.interiorProps) ? geometry.interiorProps : []);
  for (const prop of effectiveProps) {
    if (!propIsMeasurable(prop, assets, measurementHeight)) continue;
    const polygon = propPolygon(prop, assets);
    if (polygon.length >= 3) rows.push({ id: String(prop.id || prop.assetId || "prop"), kind: "furniture", label: "가구", polygon });
  }
  return rows;
}

function uniqueSorted(values = []) {
  return values
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .filter((value, index, rows) => index === 0 || Math.abs(value - rows[index - 1]) > EPSILON);
}

function polygonIntervalsAtAxis(polygon = [], axis = "x", crossCoordinate = 0) {
  const alongIndex = axis === "y" ? 1 : 0;
  const crossIndex = alongIndex === 0 ? 1 : 0;
  const crossings = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = point(polygon[index]);
    const end = point(polygon[(index + 1) % polygon.length]);
    const low = Math.min(start[crossIndex], end[crossIndex]);
    const high = Math.max(start[crossIndex], end[crossIndex]);
    if (crossCoordinate < low - EPSILON || crossCoordinate > high + EPSILON) continue;
    const delta = end[crossIndex] - start[crossIndex];
    if (Math.abs(delta) <= EPSILON) {
      if (Math.abs(crossCoordinate - start[crossIndex]) <= EPSILON) {
        crossings.push(start[alongIndex], end[alongIndex]);
      }
      continue;
    }
    const ratio = (crossCoordinate - start[crossIndex]) / delta;
    if (ratio >= -EPSILON && ratio <= 1 + EPSILON) {
      crossings.push(start[alongIndex] + (end[alongIndex] - start[alongIndex]) * ratio);
    }
  }
  const coordinates = uniqueSorted(crossings);
  const intervals = [];
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    if (end - start <= EPSILON) continue;
    const sample = (start + end) / 2;
    const samplePoint = axis === "y" ? [crossCoordinate, sample] : [sample, crossCoordinate];
    if (istarparkLaserPointInPolygon(samplePoint, polygon)) intervals.push([start, end]);
  }
  return intervals;
}

function contactPoint(axis, coordinate, crossCoordinate) {
  return axis === "y" ? [crossCoordinate, coordinate] : [coordinate, crossCoordinate];
}

function mergedObstacleIntervals(intervals = []) {
  const sorted = [...intervals].sort((left, right) => (
    left.start - right.start || left.end - right.end
  ));
  const merged = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end + EPSILON) {
      merged.push({
        start: interval.start,
        end: interval.end,
        startObstacle: interval.obstacle,
        endObstacle: interval.obstacle,
      });
      continue;
    }
    if (interval.start < previous.start - EPSILON) {
      previous.start = interval.start;
      previous.startObstacle = interval.obstacle;
    }
    if (interval.end > previous.end + EPSILON) {
      previous.end = interval.end;
      previous.endObstacle = interval.obstacle;
    }
  }
  return merged;
}

function laserRoomAtPoint(anchor = [], geometry = {}) {
  return (Array.isArray(geometry.roomZones) ? geometry.roomZones : [])
    .find((room) => istarparkLaserPointInPolygon(anchor, rowPolygon(room))) || null;
}

function dimensionAnnotationAxis(annotation = {}) {
  if (!Array.isArray(annotation.a) || !Array.isArray(annotation.b)) return "";
  const start = point(annotation.a);
  const end = point(annotation.b);
  return Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]) ? "x" : "y";
}

function laserDimensionLimit({ geometry = {}, anchor = [], axis = "x" } = {}) {
  if (
    String(geometry.floorAnnotationMode || "") !== "explicit-wall-span-dimensions-v3"
    || String(geometry.dimensionPolicy || "") === "interior-clear-only-no-wall-thickness"
  ) return null;
  const annotations = (Array.isArray(geometry.dimensionAnnotations) ? geometry.dimensionAnnotations : [])
    .filter((annotation) => dimensionAnnotationAxis(annotation) === axis);
  if (!annotations.length) return null;
  const room = laserRoomAtPoint(anchor, geometry);
  const roomId = String(room?.id || room?.roomId || "");
  if (!roomId) return null;
  const roomAnnotations = annotations
    .filter((annotation) => String(annotation.roomId || annotation.roomZoneId || "") === roomId);
  if (!roomAnnotations.length) return null;
  const alongIndex = axis === "y" ? 1 : 0;
  const crossIndex = alongIndex === 0 ? 1 : 0;
  const along = finite(anchor[alongIndex]);
  const cross = finite(anchor[crossIndex]);
  return roomAnnotations
    .map((annotation) => {
      const start = point(annotation.a);
      const end = point(annotation.b);
      const authoredSpan = Math.abs(end[alongIndex] - start[alongIndex]);
      const annotationSpan = Math.max(EPSILON, finite(annotation.valueMeters, authoredSpan));
      const centerAlong = (start[alongIndex] + end[alongIndex]) / 2;
      const crossCoordinate = (start[crossIndex] + end[crossIndex]) / 2;
      const authoredMinimum = Math.min(start[alongIndex], end[alongIndex]);
      const authoredMaximum = Math.max(start[alongIndex], end[alongIndex]);
      const minimum = centerAlong - annotationSpan / 2;
      const maximum = centerAlong + annotationSpan / 2;
      const span = annotationSpan;
      const alongDistance = along < minimum
        ? minimum - along
        : along > maximum ? along - maximum : 0;
      return {
        id: String(annotation.id || `${roomId || "room"}-${axis}-dimension`),
        roomId,
        axis,
        minimum,
        maximum,
        authoredMinimum,
        authoredMaximum,
        span,
        annotationSpan,
        crossCoordinate,
        score: Math.abs(cross - crossCoordinate) + alongDistance * 4,
      };
    })
    .filter((candidate) => (
      along >= candidate.authoredMinimum - EPSILON
      && along <= candidate.authoredMaximum + EPSILON
    ))
    .sort((left, right) => left.score - right.score || left.span - right.span)[0] || null;
}

function dimensionBoundaryObstacle(limit = {}, side = "negative") {
  return {
    id: `dimension-boundary:${String(limit.id || "room")}:${side}`,
    kind: "wall",
    label: "벽",
    dimensionBoundary: true,
    dimensionAnnotationId: String(limit.id || ""),
  };
}
function clearanceAroundOccupiedAnchor(groups = [], containingIndex = -1, along = 0) {
  const containing = groups[containingIndex];
  if (!containing) return null;
  const candidates = [];
  const previous = groups[containingIndex - 1];
  if (previous && containing.start - previous.end > EPSILON) {
    candidates.push({
      negative: previous,
      positive: {
        ...containing,
        startObstacle: containing.startObstacle,
      },
      edgeDistance: Math.max(0, along - containing.start),
      distance: containing.start - previous.end,
    });
  }
  const next = groups[containingIndex + 1];
  if (next && next.start - containing.end > EPSILON) {
    candidates.push({
      negative: {
        ...containing,
        endObstacle: containing.endObstacle,
      },
      positive: next,
      edgeDistance: Math.max(0, containing.end - along),
      distance: next.start - containing.end,
    });
  }
  return candidates.sort((left, right) => (
    left.edgeDistance - right.edgeDistance || right.distance - left.distance
  ))[0] || null;
}

function obstacleGroupsAtAxis(obstacles = [], axis = "x", crossCoordinate = 0, dimensionLimit = null) {
  const intervals = obstacles.flatMap((obstacle) => (
    polygonIntervalsAtAxis(obstacle.polygon, axis, crossCoordinate)
      .map(([start, end]) => ({ start, end, obstacle }))
  ));
  const groups = mergedObstacleIntervals(intervals);
  if (!dimensionLimit) return groups;
  const negativeObstacle = dimensionBoundaryObstacle(dimensionLimit, "negative");
  const positiveObstacle = dimensionBoundaryObstacle(dimensionLimit, "positive");
  return [
    ...groups,
    {
      start: dimensionLimit.minimum,
      end: dimensionLimit.minimum,
      startObstacle: negativeObstacle,
      endObstacle: negativeObstacle,
    },
    {
      start: dimensionLimit.maximum,
      end: dimensionLimit.maximum,
      startObstacle: positiveObstacle,
      endObstacle: positiveObstacle,
    },
  ].sort((left, right) => left.start - right.start || left.end - right.end);
}

function intervalContainsMeasurementAnchor(interval = {}, along = 0) {
  if (interval.startObstacle?.dimensionBoundary || interval.endObstacle?.dimensionBoundary) return false;
  return along >= interval.start - EPSILON && along <= interval.end + EPSILON;
}

function intervalIsNegativeContact(interval = {}, along = 0) {
  return interval.end < along - EPSILON || (
    interval.endObstacle?.dimensionBoundary
    && String(interval.endObstacle.id || "").endsWith(":negative")
    && Math.abs(interval.end - along) <= EPSILON
  );
}

function intervalIsPositiveContact(interval = {}, along = 0) {
  return interval.start > along + EPSILON || (
    interval.startObstacle?.dimensionBoundary
    && String(interval.startObstacle.id || "").endsWith(":positive")
    && Math.abs(interval.start - along) <= EPSILON
  );
}

function nearestRawClearance(groups = [], along = 0) {
  const containingIndex = groups.findIndex((interval) => intervalContainsMeasurementAnchor(interval, along));
  if (containingIndex >= 0) return null;
  const negative = groups
    .filter((interval) => intervalIsNegativeContact(interval, along))
    .sort((left, right) => right.end - left.end)[0];
  const positive = groups
    .filter((interval) => intervalIsPositiveContact(interval, along))
    .sort((left, right) => left.start - right.start)[0];
  return negative && positive ? { negative, positive } : null;
}

function finishCalibrationKey(axis = "x", obstacleId = "", side = "negative") {
  return `${axis}:${String(obstacleId || "")}:${side}`;
}

function median(values = []) {
  const rows = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!rows.length) return 0;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
}

function istarparkFinishCalibration(geometry = {}, laserHeightMeters = ISTARPARK_LASER_HEIGHT_METERS) {
  if (!geometry || typeof geometry !== "object") return new Map();
  const cacheKey = finite(laserHeightMeters, ISTARPARK_LASER_HEIGHT_METERS).toFixed(4);
  let geometryCache = finishCalibrationCache.get(geometry);
  if (!geometryCache) {
    geometryCache = new Map();
    finishCalibrationCache.set(geometry, geometryCache);
  }
  if (geometryCache.has(cacheKey)) return geometryCache.get(cacheKey);

  const samples = new Map();
  const structuralObstacles = istarparkLaserObstacles({
    geometry,
    props: [],
    laserHeightMeters,
  });
  for (const annotation of Array.isArray(geometry.dimensionAnnotations) ? geometry.dimensionAnnotations : []) {
    if (!Array.isArray(annotation?.a) || !Array.isArray(annotation?.b)) continue;
    const start = point(annotation.a);
    const end = point(annotation.b);
    const axis = Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]) ? "x" : "y";
    const alongIndex = axis === "y" ? 1 : 0;
    const crossIndex = alongIndex === 0 ? 1 : 0;
    const authoredMinimum = Math.min(start[alongIndex], end[alongIndex]);
    const authoredMaximum = Math.max(start[alongIndex], end[alongIndex]);
    const authoredSpan = authoredMaximum - authoredMinimum;
    const expectedSpan = finite(annotation.valueMeters, authoredSpan);
    if (
      expectedSpan <= EPSILON
      || Math.abs(authoredSpan - expectedSpan) > 0.025
    ) continue;
    const anchor = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
    ];
    const along = anchor[alongIndex];
    const cross = anchor[crossIndex];
    const clearance = nearestRawClearance(
      obstacleGroupsAtAxis(structuralObstacles, axis, cross),
      along,
    );
    if (!clearance) continue;
    const negativeObstacle = clearance.negative.endObstacle;
    const positiveObstacle = clearance.positive.startObstacle;
    if (!negativeObstacle || !positiveObstacle) continue;
    const rawMinimum = clearance.negative.end;
    const rawMaximum = clearance.positive.start;
    const rawSpan = rawMaximum - rawMinimum;
    const totalShrink = rawSpan - expectedSpan;
    const negativeShift = authoredMinimum - rawMinimum;
    const positiveShift = rawMaximum - authoredMaximum;
    if (
      totalShrink <= EPSILON
      || totalShrink > FINISH_CALIBRATION_MAX_SHRINK_METERS
      || Math.abs(negativeShift) > FINISH_CALIBRATION_MAX_FACE_SHIFT_METERS
      || Math.abs(positiveShift) > FINISH_CALIBRATION_MAX_FACE_SHIFT_METERS
      || Math.abs((negativeShift + positiveShift) - totalShrink)
        > FINISH_CALIBRATION_ENDPOINT_TOLERANCE_METERS
    ) continue;
    for (const [key, value] of [
      [finishCalibrationKey(axis, negativeObstacle.id, "negative"), negativeShift],
      [finishCalibrationKey(axis, positiveObstacle.id, "positive"), positiveShift],
    ]) {
      const values = samples.get(key) || [];
      values.push(value);
      samples.set(key, values);
    }
  }
  const calibration = new Map(
    [...samples.entries()].map(([key, values]) => [key, median(values)]),
  );
  geometryCache.set(cacheKey, calibration);
  return calibration;
}

export function measureIstarparkLaserGap({
  anchorPlanPoint = [],
  axis = "x",
  geometry = {},
  props = null,
  assets = [],
  laserHeightMeters = ISTARPARK_LASER_HEIGHT_METERS,
}: InspectionLaserInput = {}): InspectionLaserMeasurement {
  const normalizedAxis = axis === "y" ? "y" : "x";
  const measurementHeight = Math.max(0, finite(laserHeightMeters, ISTARPARK_LASER_HEIGHT_METERS));
  const anchor = point(anchorPlanPoint);
  const floor = Array.isArray(geometry.floorPolygon) ? geometry.floorPolygon.map(point) : [];
  if (floor.length >= 3 && !istarparkLaserPointInPolygon(anchor, floor)) {
    return { valid: false, reason: "outside-floor", axis: normalizedAxis, anchorPlanPoint: anchor, laserHeightMeters: measurementHeight };
  }
  const alongIndex = normalizedAxis === "y" ? 1 : 0;
  const crossIndex = alongIndex === 0 ? 1 : 0;
  const along = anchor[alongIndex];
  const cross = anchor[crossIndex];
  const dimensionLimit = laserDimensionLimit({
    geometry,
    anchor,
    axis: normalizedAxis,
  });
  const groups = obstacleGroupsAtAxis(
    istarparkLaserObstacles({ geometry, props, assets, laserHeightMeters: measurementHeight }),
    normalizedAxis,
    cross,
    dimensionLimit,
  );
  const containingIndex = groups.findIndex((interval) => intervalContainsMeasurementAnchor(interval, along));
  const containing = groups[containingIndex];
  const snappedClearance = containing
    ? clearanceAroundOccupiedAnchor(groups, containingIndex, along)
    : null;
  if (containing && !snappedClearance) {
    return {
      valid: false,
      reason: "anchor-inside-obstacle",
      axis: normalizedAxis,
      anchorPlanPoint: anchor,
      laserHeightMeters: measurementHeight,
      obstacle: containing.startObstacle,
    };
  }
  const negative = snappedClearance?.negative || groups
    .filter((interval) => intervalIsNegativeContact(interval, along))
    .sort((left, right) => right.end - left.end)[0];
  const positive = snappedClearance?.positive || groups
    .filter((interval) => intervalIsPositiveContact(interval, along))
    .sort((left, right) => left.start - right.start)[0];
  if (!negative || !positive) {
    return { valid: false, reason: "incomplete-contact", axis: normalizedAxis, anchorPlanPoint: anchor, laserHeightMeters: measurementHeight };
  }
  const negativeObstacle = negative.endObstacle;
  const positiveObstacle = positive.startObstacle;
  const calibration = istarparkFinishCalibration(geometry, measurementHeight);
  const negativeShift = finite(calibration.get(
    finishCalibrationKey(normalizedAxis, negativeObstacle.id, "negative"),
  ));
  const positiveShift = finite(calibration.get(
    finishCalibrationKey(normalizedAxis, positiveObstacle.id, "positive"),
  ));
  const rawNegativeCoordinate = negative.end;
  const rawPositiveCoordinate = positive.start;
  const calibratedNegativeCoordinate = rawNegativeCoordinate + negativeShift;
  const calibratedPositiveCoordinate = rawPositiveCoordinate - positiveShift;
  const calibrationValid = calibratedPositiveCoordinate > calibratedNegativeCoordinate + EPSILON;
  const negativeCoordinate = calibrationValid ? calibratedNegativeCoordinate : rawNegativeCoordinate;
  const positiveCoordinate = calibrationValid ? calibratedPositiveCoordinate : rawPositiveCoordinate;
  const rawDistanceMeters = Math.max(0, rawPositiveCoordinate - rawNegativeCoordinate);
  const distanceMeters = Math.max(0, positiveCoordinate - negativeCoordinate);
  const displayAlong = snappedClearance ? (negativeCoordinate + positiveCoordinate) / 2 : along;
  const displayAnchor = contactPoint(normalizedAxis, displayAlong, cross);
  const distanceMm = Math.round(distanceMeters * 1000);
  return {
    valid: true,
    axis: normalizedAxis,
    anchorPlanPoint: displayAnchor,
    sourceAnchorPlanPoint: anchor,
    anchorSnapped: Boolean(snappedClearance),
    snappedFromObstacle: snappedClearance ? containing.startObstacle : null,
    dimensionAnnotationId: String(dimensionLimit?.id || ""),
    dimensionAnnotationMm: dimensionLimit ? Math.round(dimensionLimit.annotationSpan * 1000) : null,
    dimensionLimitMm: dimensionLimit ? Math.round(dimensionLimit.span * 1000) : null,
    laserHeightMeters: measurementHeight,
    negativeHit: {
      point: contactPoint(normalizedAxis, negativeCoordinate, cross),
      obstacleId: negativeObstacle.id,
      kind: negativeObstacle.kind,
      label: negativeObstacle.label,
    },
    positiveHit: {
      point: contactPoint(normalizedAxis, positiveCoordinate, cross),
      obstacleId: positiveObstacle.id,
      kind: positiveObstacle.kind,
      label: positiveObstacle.label,
    },
    rawDistanceMeters: Number(rawDistanceMeters.toFixed(6)),
    rawDistanceMm: Math.round(rawDistanceMeters * 1000),
    finishCalibrationApplied: calibrationValid
      && (Math.abs(negativeShift) > EPSILON || Math.abs(positiveShift) > EPSILON),
    finishCalibrationMm: calibrationValid
      ? Math.round((rawDistanceMeters - distanceMeters) * 1000)
      : 0,
    distanceMeters: Number(distanceMeters.toFixed(6)),
    distanceMm,
    label: `${distanceMm}mm · ${negativeObstacle.label} ↔ ${positiveObstacle.label}`,
  };
}

function nearestPointOnSegment(target = [], start = [], end = []) {
  const candidate = point(target);
  const a = point(start);
  const b = point(end);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx ** 2 + dy ** 2;
  if (lengthSquared <= EPSILON) return a;
  const ratio = Math.max(0, Math.min(1, (
    (candidate[0] - a[0]) * dx + (candidate[1] - a[1]) * dy
  ) / lengthSquared));
  return [a[0] + dx * ratio, a[1] + dy * ratio];
}

function laserSurfaceCandidates(obstacle = {}, candidate = [], axisLock = null) {
  const polygon = Array.isArray(obstacle.polygon) ? obstacle.polygon : [];
  if (polygon.length < 3) return [];
  if (axisLock === "x" || axisLock === "y") {
    const alongIndex = axisLock === "y" ? 1 : 0;
    const crossIndex = alongIndex === 0 ? 1 : 0;
    const cross = finite(candidate[crossIndex]);
    return polygonIntervalsAtAxis(polygon, axisLock, cross)
      .flatMap(([start, end]) => [
        contactPoint(axisLock, start, cross),
        contactPoint(axisLock, end, cross),
      ]);
  }
  return polygon.map((start, index) => (
    nearestPointOnSegment(candidate, start, polygon[(index + 1) % polygon.length])
  ));
}

export function snapIstarparkLaserPoint({
  candidatePlanPoint = [],
  geometry = {},
  props = null,
  assets = [],
  axisLock = null,
  referencePlanPoint = null,
  maxSnapDistanceMeters = 0.15,
  requireSurface = false,
  laserHeightMeters = ISTARPARK_LASER_HEIGHT_METERS,
}: any = {}): InspectionLaserSurfaceHit {
  const sourcePlanPoint = point(candidatePlanPoint);
  const normalizedAxisLock = axisLock === "x" || axisLock === "y" ? axisLock : null;
  const reference = referencePlanPoint == null ? null : point(referencePlanPoint);
  const candidate = [...sourcePlanPoint];
  if (normalizedAxisLock && reference) {
    const crossIndex = normalizedAxisLock === "x" ? 1 : 0;
    candidate[crossIndex] = reference[crossIndex];
  }
  const floor = Array.isArray(geometry.floorPolygon) ? geometry.floorPolygon.map(point) : [];
  const obstacles = istarparkLaserObstacles({ geometry, props, assets, laserHeightMeters });
  const unlimitedSurfaceSearch = maxSnapDistanceMeters == null;
  const maximumSnapDistance = unlimitedSurfaceSearch
    ? Number.POSITIVE_INFINITY
    : Math.max(0, finite(maxSnapDistanceMeters, 0.15));
  const surfaceCandidates = [];
  for (const obstacle of obstacles) {
    const insideObstacle = istarparkLaserPointInPolygon(candidate, obstacle.polygon);
    for (const surfacePoint of laserSurfaceCandidates(obstacle, candidate, normalizedAxisLock)) {
      const distanceMeters = Math.hypot(
        surfacePoint[0] - candidate[0],
        surfacePoint[1] - candidate[1],
      );
      if (!insideObstacle && distanceMeters > maximumSnapDistance + EPSILON) continue;
      surfaceCandidates.push({
        point: surfacePoint,
        distanceMeters,
        floorSide: floor.length < 3 || istarparkLaserPointInPolygon(surfacePoint, floor),
        obstacle,
      });
    }
  }
  const eligibleSurfaceCandidates = requireSurface
    && floor.length >= 3
    && surfaceCandidates.some((candidate) => candidate.floorSide)
    ? surfaceCandidates.filter((candidate) => candidate.floorSide)
    : surfaceCandidates;
  const surface = eligibleSurfaceCandidates.sort((left, right) => {
    const distanceDelta = left.distanceMeters - right.distanceMeters;
    if (Math.abs(distanceDelta) > EPSILON) return distanceDelta;
    return Number(right.floorSide) - Number(left.floorSide)
      || String(left.obstacle.id || "").localeCompare(String(right.obstacle.id || ""));
  })[0] || null;
  if (surface) {
    return {
      valid: true,
      point: surface.point.map((value) => Number(value.toFixed(6))),
      sourcePlanPoint,
      constrainedPlanPoint: candidate,
      snapped: true,
      snapDistanceMeters: Number(surface.distanceMeters.toFixed(6)),
      obstacleId: String(surface.obstacle.id || ""),
      kind: String(surface.obstacle.kind || "structure"),
      label: String(surface.obstacle.label || obstacleLabel(surface.obstacle.kind)),
    };
  }
  if (requireSurface) {
    return {
      valid: false,
      reason: "surface-required",
      point: candidate,
      sourcePlanPoint,
      constrainedPlanPoint: candidate,
    };
  }
  if (floor.length >= 3 && !istarparkLaserPointInPolygon(candidate, floor)) {
    return {
      valid: false,
      reason: "outside-floor",
      point: candidate,
      sourcePlanPoint,
      constrainedPlanPoint: candidate,
    };
  }
  return {
    valid: true,
    point: candidate.map((value) => Number(value.toFixed(6))),
    sourcePlanPoint,
    constrainedPlanPoint: candidate,
    snapped: false,
    snapDistanceMeters: 0,
    obstacleId: "",
    kind: "floor-point",
    label: "마루 지점",
  };
}

function raySegmentIntersection(origin = [], direction = [], start = [], end = []) {
  const rayOrigin = point(origin);
  const rayDirection = point(direction);
  const segmentStart = point(start);
  const segmentEnd = point(end);
  const sx = segmentEnd[0] - segmentStart[0];
  const sy = segmentEnd[1] - segmentStart[1];
  const denominator = rayDirection[0] * sy - rayDirection[1] * sx;
  if (Math.abs(denominator) <= EPSILON) return null;
  const ox = segmentStart[0] - rayOrigin[0];
  const oy = segmentStart[1] - rayOrigin[1];
  const distance = (ox * sy - oy * sx) / denominator;
  const segmentRatio = (ox * rayDirection[1] - oy * rayDirection[0]) / denominator;
  if (distance < 0.01 - EPSILON || segmentRatio < -EPSILON || segmentRatio > 1 + EPSILON) return null;
  return {
    distance,
    point: [
      rayOrigin[0] + rayDirection[0] * distance,
      rayOrigin[1] + rayDirection[1] * distance,
    ],
  };
}

function directionalLaserVector(start = [], pointerPlanPoint = [], axisLock = null) {
  const origin = point(start);
  const target = point(pointerPlanPoint);
  let dx = target[0] - origin[0];
  let dy = target[1] - origin[1];
  if (axisLock === "x") dy = 0;
  if (axisLock === "y") dx = 0;
  const length = Math.hypot(dx, dy);
  if (length < 0.01 - EPSILON) return null;
  return [dx / length, dy / length];
}

function directionalLaserCalibrationAxis(rayDirection = [], axisLock = null) {
  if (axisLock === "x" || axisLock === "y") return axisLock;
  const direction = point(rayDirection);
  if (Math.abs(direction[1]) <= 0.00001) return "x";
  if (Math.abs(direction[0]) <= 0.00001) return "y";
  return null;
}

function directionalCalibrationContactMatches(hit = null, obstacleId = "") {
  const hitId = String(hit?.obstacleId || "");
  return hitId === String(obstacleId || "") || hitId.startsWith("dimension-boundary:");
}

function directionalLaserStartHit({
  startHit = null,
  startObstacle = null,
  pointerPlanPoint = [],
  axisLock = null,
} = {}) {
  if (startHit?.valid !== true || !startObstacle?.polygon?.length) return startHit;
  if (!["wall", "service-wall"].includes(String(startObstacle.kind || ""))) return startHit;
  const rawSourcePlanPoint = point(startHit.sourcePlanPoint || startHit.point);
  const sourcePlanPoint = startObstacle.kind === "wall" && startObstacle.centerLine?.length === 2
    ? nearestPointOnSegment(
      rawSourcePlanPoint,
      startObstacle.centerLine[0],
      startObstacle.centerLine[1],
    )
    : rawSourcePlanPoint;
  if (
    startObstacle.kind !== "wall"
    && !istarparkLaserPointInPolygon(sourcePlanPoint, startObstacle.polygon)
  ) return startHit;
  const direction = directionalLaserVector(sourcePlanPoint, pointerPlanPoint, axisLock);
  if (!direction) return startHit;
  const exits = [];
  for (let index = 0; index < startObstacle.polygon.length; index += 1) {
    const intersection = raySegmentIntersection(
      sourcePlanPoint,
      direction,
      startObstacle.polygon[index],
      startObstacle.polygon[(index + 1) % startObstacle.polygon.length],
    );
    if (intersection) exits.push(intersection);
  }
  const exit = exits.sort((left, right) => left.distance - right.distance)[0] || null;
  if (!exit) return startHit;
  return {
    ...startHit,
    point: exit.point.map((value) => Number(value.toFixed(6))),
    directionalSurface: true,
  };
}

export function measureIstarparkLaserDirectionalGap({
  startHit = null,
  startPlanPoint = [],
  pointerPlanPoint = [],
  geometry = {},
  props = null,
  assets = [],
  axisLock = null,
  laserHeightMeters = ISTARPARK_LASER_HEIGHT_METERS,
}: any = {}): InspectionLaserMeasurement {
  const measurementHeight = Math.max(0, finite(laserHeightMeters, ISTARPARK_LASER_HEIGHT_METERS));
  const resolvedStartHit = startHit?.valid === true
    ? startHit
    : snapIstarparkLaserPoint({
      candidatePlanPoint: startPlanPoint,
      geometry,
      props,
      assets,
      maxSnapDistanceMeters: null,
      requireSurface: true,
      laserHeightMeters: measurementHeight,
    });
  if (resolvedStartHit?.valid !== true) {
    return {
      valid: false,
      reason: resolvedStartHit?.reason || "surface-required",
      measurementMode: "point-ray",
      startHit: resolvedStartHit,
    };
  }
  const normalizedAxisLock = axisLock === "x" || axisLock === "y" ? axisLock : null;
  const obstacles = istarparkLaserObstacles({
    geometry,
    props,
    assets,
    laserHeightMeters: measurementHeight,
  });
  const startObstacle = obstacles.find((obstacle) => (
    String(obstacle.id || "") === String(resolvedStartHit.obstacleId || "")
  ));
  const directionalStartHit = directionalLaserStartHit({
    startHit: resolvedStartHit,
    startObstacle,
    pointerPlanPoint,
    axisLock: normalizedAxisLock,
  });
  const rayDirection = directionalLaserVector(
    directionalStartHit.point,
    pointerPlanPoint,
    normalizedAxisLock,
  );
  if (!rayDirection) {
    return {
      valid: false,
      reason: "direction-required",
      measurementMode: "point-ray",
      startHit: directionalStartHit,
    };
  }
  const directionProbe = [
    directionalStartHit.point[0] + rayDirection[0] * 0.02,
    directionalStartHit.point[1] + rayDirection[1] * 0.02,
  ];
  const floor = Array.isArray(geometry.floorPolygon) ? geometry.floorPolygon.map(point) : [];
  if (floor.length >= 3 && !istarparkLaserPointInPolygon(directionProbe, floor)) {
    return {
      valid: false,
      reason: "outside-floor-direction",
      measurementMode: "point-ray",
      startHit: directionalStartHit,
      rayDirection,
    };
  }
  if (startObstacle && istarparkLaserPointInPolygon(directionProbe, startObstacle.polygon)) {
    return {
      valid: false,
      reason: "blocked-start-direction",
      measurementMode: "point-ray",
      startHit: directionalStartHit,
      rayDirection,
    };
  }
  const contacts = [];
  for (const obstacle of obstacles) {
    if (String(obstacle.id || "") === String(directionalStartHit.obstacleId || "")) continue;
    for (let index = 0; index < obstacle.polygon.length; index += 1) {
      const intersection = raySegmentIntersection(
        directionalStartHit.point,
        rayDirection,
        obstacle.polygon[index],
        obstacle.polygon[(index + 1) % obstacle.polygon.length],
      );
      if (!intersection) continue;
      contacts.push({ ...intersection, obstacle });
    }
  }
  const contact = contacts.sort((left, right) => (
    left.distance - right.distance
    || String(left.obstacle.id || "").localeCompare(String(right.obstacle.id || ""))
  ))[0] || null;
  if (!contact) {
    return {
      valid: false,
      reason: "incomplete-contact",
      measurementMode: "point-ray",
      startHit: directionalStartHit,
      rayDirection,
    };
  }
  const rawDistanceMeters = Math.max(0, contact.distance);
  if (rawDistanceMeters < 0.01 - EPSILON) {
    return {
      valid: false,
      reason: "too-short",
      measurementMode: "point-ray",
      startHit: directionalStartHit,
      rayDirection,
    };
  }
  let calibratedStartHit = directionalStartHit;
  let endHit = {
    valid: true,
    point: contact.point.map((value) => Number(value.toFixed(6))),
    sourcePlanPoint: point(pointerPlanPoint),
    snapped: true,
    snapDistanceMeters: 0,
    obstacleId: String(contact.obstacle.id || ""),
    kind: String(contact.obstacle.kind || "structure"),
    label: String(contact.obstacle.label || obstacleLabel(contact.obstacle.kind)),
  };
  let distanceMeters = rawDistanceMeters;
  let alignedClearance = null;
  const calibrationAxis = directionalLaserCalibrationAxis(rayDirection, normalizedAxisLock);
  if (calibrationAxis) {
    const rawMidpoint = [
      (directionalStartHit.point[0] + endHit.point[0]) / 2,
      (directionalStartHit.point[1] + endHit.point[1]) / 2,
    ];
    const automaticClearance = measureIstarparkLaserGap({
      anchorPlanPoint: rawMidpoint,
      axis: calibrationAxis,
      geometry,
      props,
      assets,
      laserHeightMeters: measurementHeight,
    });
    const alongIndex = calibrationAxis === "y" ? 1 : 0;
    const forward = rayDirection[alongIndex] > 0;
    const automaticStartHit = forward
      ? automaticClearance?.negativeHit
      : automaticClearance?.positiveHit;
    const automaticEndHit = forward
      ? automaticClearance?.positiveHit
      : automaticClearance?.negativeHit;
    if (
      automaticClearance?.valid === true
      && automaticClearance.distanceMeters >= 0.01 - EPSILON
      && automaticClearance.distanceMeters <= rawDistanceMeters + EPSILON
      && directionalCalibrationContactMatches(automaticStartHit, directionalStartHit.obstacleId)
      && directionalCalibrationContactMatches(automaticEndHit, endHit.obstacleId)
    ) {
      calibratedStartHit = {
        ...directionalStartHit,
        point: point(automaticStartHit.point).map((value) => Number(value.toFixed(6))),
        clearFinishCalibrated: true,
      };
      endHit = {
        ...endHit,
        point: point(automaticEndHit.point).map((value) => Number(value.toFixed(6))),
        clearFinishCalibrated: true,
      };
      distanceMeters = Math.max(0, finite(automaticClearance.distanceMeters));
      alignedClearance = automaticClearance;
    }
  }
  const distanceMm = Math.round(distanceMeters * 1000);
  return {
    valid: true,
    measurementMode: "point-ray",
    axis: normalizedAxisLock || "free",
    laserHeightMeters: measurementHeight,
    rayDirection,
    startHit: calibratedStartHit,
    endHit,
    negativeHit: calibratedStartHit,
    positiveHit: endHit,
    anchorPlanPoint: [
      Number(((calibratedStartHit.point[0] + endHit.point[0]) / 2).toFixed(6)),
      Number(((calibratedStartHit.point[1] + endHit.point[1]) / 2).toFixed(6)),
    ],
    sourceAnchorPlanPoint: point(pointerPlanPoint),
    rawDistanceMeters: Number(rawDistanceMeters.toFixed(6)),
    rawDistanceMm: Math.round(rawDistanceMeters * 1000),
    finishCalibrationApplied: distanceMeters < rawDistanceMeters - EPSILON,
    finishCalibrationMm: Math.max(0, Math.round((rawDistanceMeters - distanceMeters) * 1000)),
    dimensionAnnotationId: String(alignedClearance?.dimensionAnnotationId || ""),
    dimensionAnnotationMm: alignedClearance?.dimensionAnnotationMm ?? null,
    dimensionLimitMm: alignedClearance?.dimensionLimitMm ?? null,
    distanceMeters: Number(distanceMeters.toFixed(6)),
    distanceMm,
    label: `${distanceMm}mm · ${calibratedStartHit.label} ↔ ${endHit.label}`,
  };
}

export function measureIstarparkLaserPointPair({
  startPlanPoint = [],
  endPlanPoint = [],
  geometry = {},
  props = null,
  assets = [],
  axisLock = null,
  maxSnapDistanceMeters = 0.15,
  laserHeightMeters = ISTARPARK_LASER_HEIGHT_METERS,
}: any = {}): InspectionLaserMeasurement {
  const measurementHeight = Math.max(0, finite(laserHeightMeters, ISTARPARK_LASER_HEIGHT_METERS));
  const startHit = snapIstarparkLaserPoint({
    candidatePlanPoint: startPlanPoint,
    geometry,
    props,
    assets,
    maxSnapDistanceMeters,
    laserHeightMeters: measurementHeight,
  });
  if (!startHit.valid) {
    return { valid: false, reason: startHit.reason, measurementMode: "point-pair", startHit };
  }
  const endHit = snapIstarparkLaserPoint({
    candidatePlanPoint: endPlanPoint,
    geometry,
    props,
    assets,
    axisLock,
    referencePlanPoint: startHit.point,
    maxSnapDistanceMeters,
    laserHeightMeters: measurementHeight,
  });
  if (!endHit.valid) {
    return { valid: false, reason: endHit.reason, measurementMode: "point-pair", startHit, endHit };
  }
  const distanceMeters = Math.hypot(
    endHit.point[0] - startHit.point[0],
    endHit.point[1] - startHit.point[1],
  );
  if (distanceMeters < 0.01 - EPSILON) {
    return { valid: false, reason: "too-short", measurementMode: "point-pair", startHit, endHit };
  }
  const distanceMm = Math.round(distanceMeters * 1000);
  return {
    valid: true,
    measurementMode: "point-pair",
    axis: axisLock === "x" || axisLock === "y" ? axisLock : "free",
    laserHeightMeters: measurementHeight,
    startHit,
    endHit,
    negativeHit: startHit,
    positiveHit: endHit,
    anchorPlanPoint: [
      Number(((startHit.point[0] + endHit.point[0]) / 2).toFixed(6)),
      Number(((startHit.point[1] + endHit.point[1]) / 2).toFixed(6)),
    ],
    sourceAnchorPlanPoint: point(endPlanPoint),
    distanceMeters: Number(distanceMeters.toFixed(6)),
    distanceMm,
    label: `${distanceMm}mm · ${startHit.label} ↔ ${endHit.label}`,
  };
}
