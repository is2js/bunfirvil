import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { apartmentPropPlacement } from './apartment-transform';
import {
  BUNDANG_OPTION_LAYOUTS,
  BUNDANG_OPTION_DISPLAY_OVERRIDES,
  bundangEditorSelectionPropIds,
  refineBundangOptionProps,
  replacedBundangOpeningIds,
} from './bundang-option-layout';
import { planVariantDefinition } from './plan-variants';
import { STRUCTURAL_PROP_ASSETS } from './three-world';
import type { ApartmentGeometry, ApartmentInteriorProp, ShowcaseCatalog, WorldChunk, WorldManifest, WorldObject } from './types';

async function apartmentsByUnit(): Promise<Map<string, WorldObject>> {
  const publicRoot = path.join(process.cwd(), 'public');
  const catalog = JSON.parse(await readFile(path.join(publicRoot, 'generated', 'catalog.v1.json'), 'utf8')) as ShowcaseCatalog;
  const result = new Map<string, WorldObject>();
  for (const map of catalog.maps) {
    const manifestPath = path.join(publicRoot, ...map.manifestUrl.split('/'));
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as WorldManifest;
    const mapRoot = path.dirname(manifestPath);
    const chunkWidth = manifest.chunk?.width || 16;
    const chunkHeight = manifest.chunk?.height || 16;
    for (let chunkY = 0; chunkY < Math.ceil(map.height / chunkHeight); chunkY += 1) {
      for (let chunkX = 0; chunkX < Math.ceil(map.width / chunkWidth); chunkX += 1) {
        const chunk = JSON.parse(await readFile(path.join(mapRoot, 'chunks', `${chunkX}-${chunkY}.json`), 'utf8')) as WorldChunk;
        const apartment = (chunk.objects || []).find((object) => object.type === 'enterable-apartment-unit-v1' && object.geometry);
        if (apartment) result.set(map.unitType, apartment);
      }
    }
  }
  return result;
}

const expectedFullDoorRooms: Record<string, string[]> = {
  '51A': ['bedroom-1', 'bedroom-2'],
  '55A': ['bedroom-1', 'bedroom-2', 'alpha-room'],
  '55B': ['bedroom-1', 'bedroom-2', 'alpha-room'],
  '59A': ['bedroom-1', 'bedroom-2', 'bedroom-3'],
};

function optionProps(
  geometry: ApartmentGeometry,
  unitType: string,
  selected: string[],
  baseProps: ApartmentInteriorProp[] = [],
  planVariant?: string,
): ApartmentInteriorProp[] {
  return refineBundangOptionProps(geometry, unitType, selected, baseProps, planVariant);
}

describe('Bunfirvil 디자인 월·인피니티 도어 배치', () => {
  it('기존 옵션 ID를 유지하면서 표시 이름만 정확히 보정한다', () => {
    expect(BUNDANG_OPTION_DISPLAY_OVERRIDES['living-design-wall-panel']?.label)
      .toBe('디자인 월(거실/복도면)');
    expect(BUNDANG_OPTION_DISPLAY_OVERRIDES['entry-open-premium-shoe-cabinet']?.label)
      .toBe('오픈형 프리미엄 신발장');
  });

  it('오픈형 프리미엄 신발장은 55A·55B·59A A형만 현관 입구 방향으로 180도 보정한다', () => {
    const geometry = { wallSegments: [] } as ApartmentGeometry;
    const baseProp: ApartmentInteriorProp = {
      id: 'inspection-unit-premium-shoe-cabinet',
      assetId: 'entry-shoe-cabinet-tall',
      anchorId: 'options.entryShoeCabinet',
      yawDeg: 270,
    };
    for (const unitType of ['55A', '55B', '59A']) {
      expect(optionProps(geometry, unitType, ['entry-open-premium-shoe-cabinet'], [baseProp], 'A')[0]?.yawDeg, `${unitType}:A`)
        .toBe(90);
      expect(optionProps(geometry, unitType, ['entry-open-premium-shoe-cabinet'], [baseProp], 'B')[0]?.yawDeg, `${unitType}:B`)
        .toBe(270);
    }
  });

  it('4개 평형의 지정 벽 조각만 얇은 비충돌 디자인 월로 감싼다', async () => {
    const apartments = await apartmentsByUnit();
    for (const [unitType, layout] of Object.entries(BUNDANG_OPTION_LAYOUTS)) {
      const apartment = apartments.get(unitType);
      expect(apartment?.geometry, `${unitType} geometry`).toBeTruthy();
      if (!apartment?.geometry) continue;
      const unrelated = { id: `${unitType}-sofa`, assetId: 'sofa' };
      const props = optionProps(apartment.geometry, unitType, ['living-design-wall-panel'], [
        unrelated,
        { id: `inspection-${unitType}-living-design-wall`, assetId: 'living-art-wall-greige-stone', anchorId: 'options.livingDesignWall' },
      ]);
      const skins = props.filter((prop) => prop.sourceOptionId === 'living-design-wall-panel');
      const expectedSegments = layout.designWallRuns.flatMap((run) => run.segmentIds).sort();
      expect(skins.map((prop) => prop.anchorWallSegmentId).sort(), unitType).toEqual(expectedSegments);
      expect(props.some((prop) => prop.id === unrelated.id), unitType).toBe(true);
      expect(props.some((prop) => String(prop.id).startsWith(`inspection-${unitType}-living-design-wall`)), unitType).toBe(false);
      expect(skins.some((prop) => prop.anchorWallSegmentId === 'kitchen-living-short-return'), unitType).toBe(false);
      for (const skin of skins) {
        const dimensions = Array.isArray(skin.dimensionsMeters) ? skin.dimensionsMeters : [];
        expect(dimensions[1], `${unitType}:${skin.id}:depth`).toBeCloseTo(.02);
        expect(skin.collisionMode, `${unitType}:${skin.id}:collision`).toBe('visual-only');
        expect(skin.measurementObstacle, `${unitType}:${skin.id}:laser`).toBe(false);
        expect(skin.materialVariantId, `${unitType}:${skin.id}:material`).toBe('golden-shore-engineered-stone');
        expect(skin.occlusionSegmentsMeters, `${unitType}:${skin.id}:occlusion`).toHaveLength(1);
      }
    }
  });

  it('침실1 또는 전체 시공을 실제 출입구에 배치하고 욕실을 제외한다', async () => {
    const apartments = await apartmentsByUnit();
    for (const [unitType, expectedRooms] of Object.entries(expectedFullDoorRooms)) {
      const apartment = apartments.get(unitType);
      expect(apartment?.geometry, `${unitType} geometry`).toBeTruthy();
      if (!apartment?.geometry) continue;
      const bedroomOne = optionProps(apartment.geometry, unitType, ['infinity-door-bedroom-1'])
        .filter((prop) => prop.sourceOptionId === 'infinity-door-bedroom-1');
      expect(bedroomOne.map((prop) => prop.roomZoneId), `${unitType}:bedroom1`).toEqual(['bedroom-1']);

      const all = optionProps(apartment.geometry, unitType, ['living-design-wall-panel', 'infinity-door-all-bedrooms'])
        .filter((prop) => prop.sourceOptionId === 'infinity-door-all-bedrooms');
      expect(all.map((prop) => prop.roomZoneId), `${unitType}:all`).toEqual(expectedRooms);
      expect(all.some((prop) => String(prop.roomZoneId).includes('bathroom')), unitType).toBe(false);
      expect(all.some((prop) => ['utility', 'outdoor-unit'].includes(String(prop.roomZoneId))), unitType).toBe(false);
      for (const door of all) {
        const dimensions = Array.isArray(door.dimensionsMeters) ? door.dimensionsMeters : [];
        expect(door.assetId).toBe('interior-infinity-door-panel');
        expect(dimensions[0]).toBeGreaterThanOrEqual(.8);
        expect(dimensions[1]).toBeCloseTo(.02);
        expect(door.materialVariantId).toBe('golden-shore-engineered-stone');
        expect(door.measurementObstacle).toBe(false);
        expect(door.collisionMode).toBe('visual-only');
      }
      const expectedReplacementIds = BUNDANG_OPTION_LAYOUTS[unitType as keyof typeof BUNDANG_OPTION_LAYOUTS].infinityDoors
        .map((anchor) => anchor.openingId).filter(Boolean).sort();
      expect([...replacedBundangOpeningIds(unitType, ['infinity-door-all-bedrooms'])].sort()).toEqual(expectedReplacementIds);
    }
  });

  it('동일 A형 앵커를 기존 A/B 세대 변환으로 함께 배치한다', async () => {
    const apartments = await apartmentsByUnit();
    for (const [unitType, apartment] of apartments) {
      if (!apartment.geometry) continue;
      const prop = optionProps(apartment.geometry, unitType, ['living-design-wall-panel'])
        .find((candidate) => candidate.sourceOptionId === 'living-design-wall-panel');
      expect(prop, unitType).toBeTruthy();
      if (!prop) continue;
      const a = apartmentPropPlacement({ ...apartment, transform: planVariantDefinition(unitType, 'A').transform }, prop);
      const b = apartmentPropPlacement({ ...apartment, transform: planVariantDefinition(unitType, 'B').transform }, prop);
      expect([a.center.x, a.center.y, a.worldYaw].every(Number.isFinite), `${unitType}:A`).toBe(true);
      expect([b.center.x, b.center.y, b.worldYaw].every(Number.isFinite), `${unitType}:B`).toBe(true);
      expect([b.center.x, b.center.y, b.worldYaw]).not.toEqual([a.center.x, a.center.y, a.worldYaw]);
    }
  });

  it('디자인 월 한 조각을 선택하면 설치된 모든 디자인 월 조각을 그룹으로 선택한다', () => {
    const props: ApartmentInteriorProp[] = [
      { id: 'wall-a', assetId: 'living-art-wall-greige-stone', sourceOptionId: 'living-design-wall-panel' },
      { id: 'wall-b', assetId: 'living-art-wall-greige-stone', sourceOptionId: 'living-design-wall-panel' },
      { id: 'sofa', assetId: 'sofa' },
    ];
    expect(bundangEditorSelectionPropIds(props, 'wall-a')).toEqual(['wall-a', 'wall-b']);
    expect(bundangEditorSelectionPropIds(props, 'sofa')).toEqual(['sofa']);
  });

  it('비데일체형 양변기의 모델 전면축을 기본 양변기 방향에 맞춰 보정한다', () => {
    const geometry = { wallSegments: [] } as ApartmentGeometry;
    for (const yawDeg of [0, 90, 180, 270]) {
      const [standard, integrated] = optionProps(geometry, '55A', ['toilet-integrated-bidet'], [
        { id: `standard-${yawDeg}`, assetId: 'toilet-floor-mounted', yawDeg },
        { id: `integrated-${yawDeg}`, assetId: 'toilet-integrated-bidet', yawDeg },
      ]);
      expect(standard.yawDeg).toBe(yawDeg);
      expect(integrated.yawDeg).toBe((yawDeg + 180) % 360);
      expect(integrated.sourceOptionId).toBe('toilet-integrated-bidet');
    }
  });

  it('인피니티 도어 recipe에 손잡이는 없고 진한 4면 외곽선이 있다', () => {
    const door = STRUCTURAL_PROP_ASSETS.find((asset) => asset.assetId === 'interior-infinity-door-panel');
    expect(door).toBeTruthy();
    expect(door?.parts?.some((part) => part.shape === 'cylinder')).toBe(false);
    expect(door?.parts?.filter((part) => part.materialRole === 'door-outline')).toHaveLength(4);
  });
});
