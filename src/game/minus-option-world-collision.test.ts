import { describe, expect, it } from 'vitest';
import { BUNDANG_MINUS_OPTION_ID } from './minus-option';
import type { WorldData, WorldObject } from './types';
import { synchronizeBundangMinusOptionWorldCollision } from './world';

function fixtureWorld(): WorldData {
  const apartment: WorldObject = {
    id: 'test-apartment',
    type: 'enterable-apartment-unit-v1',
    originCell: { x: 10, y: 10 },
    transform: { rotationDeg: 0, mirrorX: false },
    blockedCells: [
      { x: 12, y: 11 },
      { x: 12, y: 14 },
      { x: 14, y: 11 },
      { x: 18, y: 18 },
    ],
    geometry: {
      cellSizeMeters: 0.5,
      floorPolygon: [[0, 0], [5, 0], [5, 5], [0, 5]],
      wallSegments: [{ id: 'structural-wall', a: [2, 0], b: [2, 1], thicknessMeters: 0.12 }],
      solidBlocks: [],
      kitchenFixtures: [{ id: 'base-cabinet', boundsMeters: [0.75, 0.25, 2.25, 0.75] }],
      interiorProps: [{
        id: 'bathroom-basin',
        assetId: 'vanity-basin-compact',
        positionMeters: [1, 2],
        dimensionsMeters: [0.4, 1.2, 0.85],
        yawDeg: 90,
        installationRole: 'bathroom-base-fixture',
      }],
    },
  };
  return {
    entry: {
      id: 'test-map',
      label: 'test',
      unitType: '55A',
      revision: 'test',
      width: 64,
      height: 64,
      chunkCount: 1,
      assetBytes: 0,
      manifestUrl: '',
      minimapUrl: '',
      renderer: 'three-pbr',
      spawn: { x: 12, y: 11 },
    },
    manifest: {
      schemaVersion: '1',
      worldId: 'test-map',
      bounds: { width: 64, height: 64 },
      chunk: { width: 16, height: 16 },
    },
    width: 64,
    height: 64,
    chunkWidth: 16,
    chunkHeight: 16,
    palette: new Map(),
    tiles: new Map(),
    blocked: new Set(['12,11', '12,14', '14,11', '18,18']),
    objects: [apartment],
    loadedChunkCount: 1,
    requestedChunkCount: 1,
    minimap: null,
    sourceMode: 'chunks',
  };
}

describe('마이너스 옵션 월드 충돌 파생 상태', () => {
  it('숨긴 주방·욕실 기본 설비 셀만 해제하고 벽 셀은 보존한 뒤 선택 해제 시 복원한다', () => {
    const world = fixtureWorld();

    synchronizeBundangMinusOptionWorldCollision(world, [BUNDANG_MINUS_OPTION_ID]);
    expect(world.blocked.has('12,11')).toBe(false);
    expect(world.blocked.has('12,14')).toBe(false);
    expect(world.blocked.has('14,11')).toBe(true);
    expect(world.blocked.has('18,18')).toBe(true);

    synchronizeBundangMinusOptionWorldCollision(world, []);
    expect([...world.blocked].sort()).toEqual(['12,11', '12,14', '14,11', '18,18']);
  });
});
