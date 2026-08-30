import { describe, expect, it } from 'vitest';
import {
  ISTARPARK_LASER_HEIGHT_METERS,
  istarparkLaserObstacles,
  measureIstarparkLaserGap,
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
});
