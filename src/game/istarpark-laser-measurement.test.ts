import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ISTARPARK_LASER_HEIGHT_METERS,
  istarparkLaserAxisTowardPointer,
  istarparkLaserObstacles,
  measureIstarparkLaserDirectionalGap,
  measureIstarparkLaserGap,
  snapIstarparkLaserPoint,
} from './istarpark-laser-measurement';

const room = {
  floorPolygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
  wallSegments: [
    { id: 'west', a: [0, 0], b: [0, 3], thicknessMeters: .2 },
    { id: 'east', a: [4, 0], b: [4, 3], thicknessMeters: .2 },
    { id: 'north', a: [0, 0], b: [4, 0], thicknessMeters: .2 },
    { id: 'south', a: [0, 3], b: [4, 3], thicknessMeters: .2 },
  ],
};

const finishCalibratedRoom = {
  ...room,
  dimensionAnnotations: [{
    id: 'finished-room-width',
    valueMeters: 3.6,
    a: [.2, 1.5],
    b: [3.8, 1.5],
  }],
};

const roughRoomCappedByFloorLabel = {
  ...room,
  floorAnnotationMode: 'explicit-wall-span-dimensions-v3',
  roomZones: [{ id: 'living', boundsMeters: [0, 0, 4, 3] }],
  dimensionAnnotations: [{
    id: 'living-width',
    roomId: 'living',
    valueMeters: 3.6,
    a: [.2, 1.5],
    b: [3.8, 1.5],
  }],
};

describe('이스타파크 레이저 실측 계약', () => {
  it('130mm 높이에서 양쪽 벽의 순수 폭을 mm로 측정한다', () => {
    const result = measureIstarparkLaserGap({ anchorPlanPoint: [2, 1.5], axis: 'x', geometry: room });
    expect(result).toMatchObject({
      valid: true,
      distanceMm: 3800,
      label: '3800mm · 벽 ↔ 벽',
      laserHeightMeters: ISTARPARK_LASER_HEIGHT_METERS,
    });
  });

  it('가구 위 포인터는 가장 가까운 측정 가능 간격으로 자동 맞춘다', () => {
    const result = measureIstarparkLaserGap({
      anchorPlanPoint: [2, 1.5],
      axis: 'x',
      geometry: room,
      props: [{ id: 'sofa', assetId: 'sofa', positionMeters: [2, 1.5], dimensionsMeters: [2, 1, .8] }],
    });
    expect(result).toMatchObject({ valid: true, anchorSnapped: true, distanceMm: 900 });
  });

  it('디자인 월과 통과형 도어처럼 measurementObstacle=false인 마감 두께는 실측에서 제외한다', () => {
    const baseline = measureIstarparkLaserGap({ anchorPlanPoint: [2, 1.5], axis: 'x', geometry: room });
    const withFinish = measureIstarparkLaserGap({
      anchorPlanPoint: [2, 1.5],
      axis: 'x',
      geometry: room,
      props: [{
        id: 'design-wall-finish', assetId: 'living-art-wall-greige-stone',
        positionMeters: [2, 1.5], dimensionsMeters: [1, 1, 2.2],
        collisionMode: 'visual-only', measurementObstacle: false,
      }],
    });
    expect(withFinish.distanceMm).toBe(baseline.distanceMm);
    expect(withFinish.anchorSnapped).toBe(false);
  });

  it('평면도 마감 치수보다 크게 표시하지 않고 가구가 막은 나머지 순수 폭만 계산한다', () => {
    const result = measureIstarparkLaserGap({
      anchorPlanPoint: [2.5, 1.5],
      axis: 'x',
      geometry: finishCalibratedRoom,
      props: [{ id: 'desk', assetId: 'desk', positionMeters: [1, 1.5], dimensionsMeters: [1, .8, .75] }],
    });
    expect(result).toMatchObject({
      valid: true,
      rawDistanceMm: 2400,
      distanceMm: 2300,
      finishCalibrationMm: 100,
      negativeHit: { kind: 'furniture' },
      positiveHit: { kind: 'wall' },
    });
    expect(result.distanceMm).toBeLessThanOrEqual(3600);
  });

  it('회전된 가구의 너비·깊이를 레이저 축에 투영해 가구 사이 남은 폭을 계산한다', () => {
    const result = measureIstarparkLaserGap({
      anchorPlanPoint: [2, 1.5],
      axis: 'x',
      geometry: finishCalibratedRoom,
      props: [
        { id: 'left', assetId: 'desk', positionMeters: [.8, 1.5], dimensionsMeters: [.6, 1, .75], yawDeg: 90 },
        { id: 'right', assetId: 'desk', positionMeters: [3.2, 1.5], dimensionsMeters: [.6, 1, .75], yawDeg: 90 },
      ],
    });
    expect(result).toMatchObject({ valid: true, distanceMm: 1400, label: '1400mm · 가구 ↔ 가구' });
    expect(result.distanceMm).toBeLessThanOrEqual(3600);
  });

  it('같은 공간·축에서 가장 가까운 마루 실측표기를 레이저 최대값으로 제한한다', () => {
    const result = measureIstarparkLaserGap({
      anchorPlanPoint: [2, 1.5],
      axis: 'x',
      geometry: roughRoomCappedByFloorLabel,
    });
    expect(result).toMatchObject({
      valid: true,
      rawDistanceMm: 3600,
      distanceMm: 3600,
      dimensionAnnotationId: 'living-width',
      dimensionLimitMm: 3600,
    });
  });

  it('2점 실측은 마우스 좌표가 아니라 가리킨 방향에서 처음 만난 면까지 잰다', () => {
    const props = [{
      id: 'center-cabinet',
      assetId: 'cabinet',
      positionMeters: [2, 1.5],
      dimensionsMeters: [1, 1, 1],
    }];
    const startHit = snapIstarparkLaserPoint({
      candidatePlanPoint: [0, 1.5],
      geometry: room,
      props,
      maxSnapDistanceMeters: null,
      requireSurface: true,
    });
    const result = measureIstarparkLaserDirectionalGap({
      startHit,
      pointerPlanPoint: [3.2, 1.5],
      geometry: room,
      props,
    });
    expect(result).toMatchObject({
      valid: true,
      measurementMode: 'point-ray',
      distanceMm: 1400,
      startHit: { obstacleId: 'west' },
      endHit: { obstacleId: 'center-cabinet', point: [1.5, 1.5] },
    });
  });

  it('내부벽 시작점은 커서가 향한 공간 쪽 벽 두께를 제외한다', () => {
    const splitRoom = {
      floorPolygon: [[0, 0], [6, 0], [6, 4], [0, 4]],
      wallSegments: [
        { id: 'west', a: [0, 0], b: [0, 4], thicknessMeters: .2 },
        { id: 'east', a: [6, 0], b: [6, 4], thicknessMeters: .2 },
        { id: 'north', a: [0, 0], b: [6, 0], thicknessMeters: .2 },
        { id: 'south', a: [0, 4], b: [6, 4], thicknessMeters: .2 },
        { id: 'bedroom-living-wall', a: [3, 0], b: [3, 4], thicknessMeters: .2 },
      ],
    };
    const startHit = snapIstarparkLaserPoint({
      candidatePlanPoint: [3, 2],
      geometry: splitRoom,
      maxSnapDistanceMeters: null,
      requireSurface: true,
    });
    const left = measureIstarparkLaserDirectionalGap({
      startHit,
      pointerPlanPoint: [1, 2],
      axisLock: 'x',
      geometry: splitRoom,
    });
    const right = measureIstarparkLaserDirectionalGap({
      startHit,
      pointerPlanPoint: [5, 2],
      axisLock: 'x',
      geometry: splitRoom,
    });
    expect(left).toMatchObject({
      valid: true,
      distanceMm: 2800,
      startHit: { point: [2.9, 2], directionalSurface: true },
      endHit: { point: [.1, 2] },
    });
    expect(right).toMatchObject({
      valid: true,
      distanceMm: 2800,
      startHit: { point: [3.1, 2], directionalSurface: true },
      endHit: { point: [5.9, 2] },
    });
  });

  it('51A B형 욕실1 벽에서 L은 침실과 욕실 방향 모두 Y축에 자동으로 붙는다', () => {
    const generatedRoot = fileURLToPath(new URL('../../public/generated/', import.meta.url));
    const current = JSON.parse(readFileSync(join(generatedRoot, 'current.json'), 'utf8'));
    const chunksRoot = join(
      generatedRoot,
      current.basePath,
      'maps',
      'bundang-first-village-51a-prototype',
      'chunks',
    );
    const apartment = readdirSync(chunksRoot)
      .filter((name) => name.endsWith('.json'))
      .map((name) => JSON.parse(readFileSync(join(chunksRoot, name), 'utf8')))
      .flatMap((chunk) => chunk.objects || [])
      .find((object) => object.type === 'enterable-apartment-unit-v1' && object.geometry);
    const geometry = apartment.geometry;
    const props = geometry.interiorProps || [];
    const startHit = snapIstarparkLaserPoint({
      candidatePlanPoint: [7.4, 4.8],
      geometry,
      props,
      maxSnapDistanceMeters: null,
      requireSurface: true,
    });
    expect(startHit.obstacleId).toBe('bathroom-1-south');

    for (const expected of [
      { pointerPlanPoint: [7.4, 7], distanceMm: 3000 },
      { pointerPlanPoint: [7.4, 3], distanceMm: 1240 },
    ]) {
      const axisLock = istarparkLaserAxisTowardPointer({
        startPlanPoint: startHit.sourcePlanPoint,
        pointerPlanPoint: expected.pointerPlanPoint,
        fallbackAxis: 'x',
      });
      expect(axisLock).toBe('y');
      expect(measureIstarparkLaserDirectionalGap({
        startHit,
        pointerPlanPoint: expected.pointerPlanPoint,
        axisLock,
        geometry,
        props,
      })).toMatchObject({ valid: true, axis: 'y', distanceMm: expected.distanceMm });
    }
  });

  it('축 정렬 2점 실측도 자동 실측의 마감 보정값을 재사용한다', () => {
    const startHit = snapIstarparkLaserPoint({
      candidatePlanPoint: [0, 1.5],
      geometry: finishCalibratedRoom,
      maxSnapDistanceMeters: null,
      requireSurface: true,
    });
    const result = measureIstarparkLaserDirectionalGap({
      startHit,
      pointerPlanPoint: [3, 1.5],
      axisLock: 'x',
      geometry: finishCalibratedRoom,
    });
    expect(result).toMatchObject({
      valid: true,
      rawDistanceMm: 3800,
      finishCalibrationMm: 200,
      distanceMm: 3600,
      startHit: { point: [.2, 1.5] },
      endHit: { point: [3.8, 1.5] },
    });
  });

  it('바닥 마감과 130mm보다 높은 벽부착 가전은 장애물에서 제외한다', () => {
    const props = [
      { id: 'floor', assetId: 'floor-finish', positionMeters: [2, 1.5], dimensionsMeters: [4, 3, .01] },
      { id: 'display', assetId: 'display', positionMeters: [2, 1.5], dimensionsMeters: [2, .2, .6], mountHeightMeters: .8 },
    ];
    const assets = [
      { assetId: 'floor-finish', mountingKind: 'room-finish' },
      { assetId: 'display', mountingKind: 'wall' },
    ];
    expect(istarparkLaserObstacles({ geometry: room, props, assets }).filter((row: { kind: string }) => row.kind === 'furniture')).toHaveLength(0);
  });

  it('공개 snapshot의 51A·55A·55B·59A에서도 자동 실측과 축 정렬 2점 실측이 같은 내부 치수를 쓴다', () => {
    const generatedRoot = fileURLToPath(new URL('../../public/generated/', import.meta.url));
    const current = JSON.parse(readFileSync(join(generatedRoot, 'current.json'), 'utf8'));
    for (const slug of ['51a', '55a', '55b', '59a']) {
      const chunksRoot = join(
        generatedRoot,
        current.basePath,
        'maps',
        `bundang-first-village-${slug}-prototype`,
        'chunks',
      );
      const apartment = readdirSync(chunksRoot)
        .filter((name) => name.endsWith('.json'))
        .map((name) => JSON.parse(readFileSync(join(chunksRoot, name), 'utf8')))
        .flatMap((chunk) => chunk.objects || [])
        .find((object) => object.type === 'enterable-apartment-unit-v1' && object.geometry);
      expect(apartment, slug).toBeTruthy();
      const geometry = apartment.geometry;
      let matched = false;
      for (const zone of geometry.roomZones || []) {
        const bounds = zone.boundsMeters || zone.bounds;
        if (!Array.isArray(bounds) || bounds.length < 4) continue;
        const anchorPlanPoint: [number, number] = [
          (Number(bounds[0]) + Number(bounds[2])) / 2,
          (Number(bounds[1]) + Number(bounds[3])) / 2,
        ];
        for (const axis of ['x', 'y'] as const) {
          const automatic = measureIstarparkLaserGap({
            anchorPlanPoint,
            axis,
            geometry,
            props: geometry.interiorProps || [],
          });
          if (!automatic.valid || !automatic.negativeHit?.point) continue;
          const startHit = snapIstarparkLaserPoint({
            candidatePlanPoint: automatic.negativeHit.point,
            geometry,
            props: geometry.interiorProps || [],
            maxSnapDistanceMeters: null,
            requireSurface: true,
          });
          const directional = measureIstarparkLaserDirectionalGap({
            startHit,
            pointerPlanPoint: anchorPlanPoint,
            axisLock: axis,
            geometry,
            props: geometry.interiorProps || [],
          });
          if (!directional.valid || directional.distanceMm !== automatic.distanceMm) continue;
          expect(directional.distanceMm, slug).toBeLessThanOrEqual(directional.rawDistanceMm || 0);
          matched = true;
          break;
        }
        if (matched) break;
      }
      expect(matched, slug).toBe(true);
    }
  });
});
