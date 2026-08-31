// @ts-nocheck
// PVP RPG 이스타파크 검수맵과 동일한 130 mm 레이저 실측 계산 계약.
const EPSILON = 0.00001;
export const ISTARPARK_LASER_HEIGHT_METERS = 0.13;
export type InspectionLaserAxis = "x" | "y";
export interface InspectionLaserMeasurement {
  valid: boolean;
  reason?: "outside-floor" | "anchor-inside-obstacle" | "incomplete-contact" | string;
  axis: InspectionLaserAxis;
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
  label?: string;
  negativeHit?: { point: [number, number]; obstacleId: string; kind: string; label: string };
  positiveHit?: { point: [number, number]; obstacleId: string; kind: string; label: string };
  obstacle?: { id?: string; kind?: string; label?: string };
}
export interface InspectionLaserInput {
  anchorPlanPoint?: [number, number] | { x?: number; y?: number };
  axis?: InspectionLaserAxis;
  geometry?: any;
  props?: any[] | null;
  assets?: any[];
  laserHeightMeters?: number;
}
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

export function istarparkLaserPointInPolygon(target = [], polygon = []) {
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
  const mountKind = String(prop.mountKind || prop.mountingKind || asset?.mountKind || asset?.mountingKind || asset?.mounting?.kind || "").toLowerCase();
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
}: InspectionLaserInput = {}) {
  const measurementHeight = Math.max(0, finite(laserHeightMeters, ISTARPARK_LASER_HEIGHT_METERS));
  const rows = [];
  for (const wall of Array.isArray(geometry.wallSegments) ? geometry.wallSegments : []) {
    const polygon = wallPolygon(wall);
    if (polygon.length >= 3) rows.push({ id: String(wall.id || "wall"), kind: "wall", label: "벽", polygon });
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

function obstacleGroupsAtAxis(obstacles = [], axis = "x", crossCoordinate = 0) {
  return mergedObstacleIntervals(obstacles.flatMap((obstacle) => (
    polygonIntervalsAtAxis(obstacle.polygon, axis, crossCoordinate)
      .map(([start, end]) => ({ start, end, obstacle }))
  )));
}

function nearestRawClearance(groups = [], along = 0) {
  const containingIndex = groups.findIndex((interval) => (
    along >= interval.start - EPSILON && along <= interval.end + EPSILON
  ));
  if (containingIndex >= 0) return null;
  const negative = groups
    .filter((interval) => interval.end < along - EPSILON)
    .sort((left, right) => right.end - left.end)[0];
  const positive = groups
    .filter((interval) => interval.start > along + EPSILON)
    .sort((left, right) => left.start - right.start)[0];
  return negative && positive ? { negative, positive } : null;
}

function authoredRoomMaximum(geometry = {}, anchor = [], axis = "x") {
  const rooms = Array.isArray(geometry.roomZones) ? geometry.roomZones : [];
  const room = rooms.find((candidate) => istarparkLaserPointInPolygon(anchor, rowPolygon(candidate)));
  if (!room) return null;
  const roomId = String(room.id || room.roomId || "");
  const alongIndex = axis === "y" ? 1 : 0;
  const crossIndex = alongIndex === 0 ? 1 : 0;
  return (Array.isArray(geometry.dimensionAnnotations) ? geometry.dimensionAnnotations : [])
    .flatMap((annotation) => {
      if (!Array.isArray(annotation?.a) || !Array.isArray(annotation?.b)) return [];
      const start = point(annotation.a);
      const end = point(annotation.b);
      const annotationAxis = Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]) ? "x" : "y";
      if (annotationAxis !== axis) return [];
      const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      const annotationRoomId = String(annotation.roomZoneId || "");
      const annotationId = String(annotation.id || "");
      const sameRoom = annotationRoomId
        ? annotationRoomId === roomId
        : annotationId === roomId
          || annotationId.startsWith(`${roomId}-`)
          || istarparkLaserPointInPolygon(midpoint, rowPolygon(room));
      if (!sameRoom) return [];
      const authoredSpan = Math.abs(end[alongIndex] - start[alongIndex]);
      const valueMeters = finite(annotation.valueMeters, authoredSpan);
      if (valueMeters <= EPSILON) return [];
      return [{
        id: annotationId,
        roomId,
        valueMeters,
        crossDistance: Math.abs(anchor[crossIndex] - midpoint[crossIndex]),
      }];
    })
    .sort((left, right) => left.crossDistance - right.crossDistance || left.valueMeters - right.valueMeters)[0] || null;
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
  const groups = obstacleGroupsAtAxis(
    istarparkLaserObstacles({ geometry, props, assets, laserHeightMeters: measurementHeight }),
    normalizedAxis,
    cross,
  );
  const containingIndex = groups.findIndex((interval) => (
    along >= interval.start - EPSILON && along <= interval.end + EPSILON
  ));
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
    .filter((interval) => interval.end < along - EPSILON)
    .sort((left, right) => right.end - left.end)[0];
  const positive = snappedClearance?.positive || groups
    .filter((interval) => interval.start > along + EPSILON)
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
  let negativeCoordinate = calibrationValid ? calibratedNegativeCoordinate : rawNegativeCoordinate;
  let positiveCoordinate = calibrationValid ? calibratedPositiveCoordinate : rawPositiveCoordinate;
  const rawDistanceMeters = Math.max(0, rawPositiveCoordinate - rawNegativeCoordinate);
  const calibratedDistanceMeters = Math.max(0, positiveCoordinate - negativeCoordinate);
  const authoredMaximum = authoredRoomMaximum(geometry, anchor, normalizedAxis);
  const authoredMaximumApplied = Boolean(
    authoredMaximum
      && calibratedDistanceMeters > authoredMaximum.valueMeters + EPSILON,
  );
  if (authoredMaximumApplied) {
    const faceInset = (calibratedDistanceMeters - authoredMaximum.valueMeters) / 2;
    negativeCoordinate += faceInset;
    positiveCoordinate -= faceInset;
  }
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
      ? Math.round((rawDistanceMeters - calibratedDistanceMeters) * 1000)
      : 0,
    authoredRoomMaximumApplied: authoredMaximumApplied,
    authoredRoomMaximumMeters: authoredMaximum?.valueMeters,
    authoredRoomMaximumMm: authoredMaximum ? Math.round(authoredMaximum.valueMeters * 1000) : undefined,
    authoredRoomDimensionId: authoredMaximum?.id,
    distanceMeters: Number(distanceMeters.toFixed(6)),
    distanceMm,
    label: `${distanceMm}mm · ${negativeObstacle.label} ↔ ${positiveObstacle.label}`,
  };
}
