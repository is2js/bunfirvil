import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { apartmentPropPlacement } from './apartment-transform';
import {
  BUNDANG_OPTION_LAYOUTS,
  BUNDANG_OPTION_DISPLAY_OVERRIDES,
  bundangEditorSelectionPropIds,
  bundangPreciseEditorPickOnly,
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
    expect(BUNDANG_OPTION_DISPLAY_OVERRIDES['bedroom-1-built-in-closet-pet']?.previewUrl)
      .toBe('assets/options/previews/bedroom-1-built-in-closet-pet-v2.png');
    expect(BUNDANG_OPTION_DISPLAY_OVERRIDES['bathroom-combination-ventilator']?.previewUrl)
      .toBe('assets/options/previews/bathroom-combination-ventilator-v2.png');
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

  it('디자인 월이나 광폭 강마루 한 조각을 선택하면 설치된 전체 마감이 그룹으로 선택된다', () => {
    const props: ApartmentInteriorProp[] = [
      { id: 'wall-a', assetId: 'living-art-wall-greige-stone', sourceOptionId: 'living-design-wall-panel' },
      { id: 'wall-b', assetId: 'living-art-wall-greige-stone', sourceOptionId: 'living-design-wall-panel' },
      { id: 'floor-a', assetId: 'wide-plank-floor-finish', sourceOptionId: 'wide-plank-floor-finish' },
      { id: 'floor-b', assetId: 'wide-plank-floor-finish', sourceOptionId: 'wide-plank-floor-finish' },
      { id: 'sofa', assetId: 'sofa' },
    ];
    expect(bundangEditorSelectionPropIds(props, 'wall-a')).toEqual(['wall-a', 'wall-b']);
    expect(bundangEditorSelectionPropIds(props, 'floor-a')).toEqual(['floor-a', 'floor-b']);
    expect(bundangEditorSelectionPropIds(props, 'sofa')).toEqual(['sofa']);
    expect(bundangPreciseEditorPickOnly(props[0])).toBe(true);
    expect(bundangPreciseEditorPickOnly(props[2])).toBe(false);
    expect(bundangPreciseEditorPickOnly(props[4])).toBe(false);
  });

  it('광폭 강마루 runtime 조각에 하나의 옵션 그룹 ID를 부여한다', () => {
    const props = optionProps({ wallSegments: [] }, '55A', ['wide-plank-floor-finish'], [
      { id: 'floor-a', assetId: 'wide-plank-floor-finish' },
      { id: 'floor-b', assetId: 'wide-plank-floor-finish' },
    ]);
    expect(props.map((prop) => prop.sourceOptionId)).toEqual(['wide-plank-floor-finish', 'wide-plank-floor-finish']);
    expect(bundangEditorSelectionPropIds(props, 'floor-b')).toEqual(['floor-a', 'floor-b']);
  });

  it('침실1 붙박이장은 평형·A/B형별 기본 전면 방향을 유지하면서 내부 실측 폭 전체를 채운다', async () => {
    const apartments = await apartmentsByUnit();
    const expectedYaw: Record<string, Record<'A' | 'B', number>> = {
      '51A': { A: 90, B: 270 },
      '55A': { A: 270, B: 90 },
      '55B': { A: 0, B: 180 },
      '59A': { A: 270, B: 270 },
    };
    const expectedClothingCareMirrored: Record<string, Record<'A' | 'B', boolean>> = {
      '51A': { A: true, B: false },
      '55A': { A: false, B: true },
      '55B': { A: false, B: true },
      '59A': { A: false, B: false },
    };
    for (const [unitType, layout] of Object.entries(BUNDANG_OPTION_LAYOUTS)) {
      const geometry = apartments.get(unitType)?.geometry;
      expect(geometry, `${unitType}:geometry`).toBeTruthy();
      if (!geometry) continue;
      const room = (roomId: string) => geometry.roomZones?.find((candidate) => candidate.id === roomId)?.boundsMeters as number[];
      const expectedSpan = (roomId: string, edge: string) => {
        const [x1, y1, x2, y2] = room(roomId);
        return (edge === 'east' || edge === 'west' ? y2 - y1 : x2 - x1) - .04;
      };

      for (const variant of ['A', 'B'] as const) {
        const pet = optionProps(geometry, unitType, ['bedroom-1-built-in-closet-pet'], [
          { id: `inspection-${unitType}-bedroom-1-wardrobe`, assetId: 'wardrobe-two-door', anchorId: 'options.storage.bedroom-1' },
        ], variant).filter((prop) => prop.sourceOptionId === 'bedroom-1-built-in-closet-pet');
        expect(pet).toHaveLength(1);
        expect(pet[0].assetId).toBe('bunfirvil-bedroom-1-pet-full-wall');
        expect((pet[0].dimensionsMeters as number[])[0]).toBeCloseTo(expectedSpan('bedroom-1', layout.bedroomOneStorage.edge));
        expect(pet[0].yawDeg, `${unitType}:${variant}:pet yaw`).toBe(expectedYaw[unitType][variant]);

        const clothingCare = optionProps(geometry, unitType, ['bedroom-1-clothing-care-closet'], [], variant)
          .find((prop) => prop.sourceOptionId === 'bedroom-1-clothing-care-closet');
        expect(clothingCare?.assetId).toBe('bunfirvil-bedroom-1-clothing-care-full-wall');
        expect(clothingCare?.yawDeg, `${unitType}:${variant}:clothing yaw`).toBe(expectedYaw[unitType][variant]);
        expect(clothingCare?.mirrored, `${unitType}:${variant}:styler end`).toBe(expectedClothingCareMirrored[unitType][variant]);
      }
    }
  });

  it('파우더 화장대와 3칸 수납장을 분리해 평형·A/B형별 위치와 전면을 기본값으로 고정한다', async () => {
    const apartments = await apartmentsByUnit();
    const expected: Record<string, Record<'A' | 'B', { vanityYaw: number; storageYaw: number; swapped: boolean }>> = {
      '51A': { A: { vanityYaw: 270, storageYaw: 90, swapped: false }, B: { vanityYaw: 270, storageYaw: 270, swapped: false } },
      '55A': { A: { vanityYaw: 270, storageYaw: 270, swapped: false }, B: { vanityYaw: 270, storageYaw: 90, swapped: false } },
      '55B': { A: { vanityYaw: 0, storageYaw: 180, swapped: true }, B: { vanityYaw: 180, storageYaw: 180, swapped: true } },
      '59A': { A: { vanityYaw: 270, storageYaw: 270, swapped: false }, B: { vanityYaw: 270, storageYaw: 270, swapped: false } },
    };
    for (const [unitType, layout] of Object.entries(BUNDANG_OPTION_LAYOUTS)) {
      const geometry = apartments.get(unitType)?.geometry;
      expect(geometry, `${unitType}:geometry`).toBeTruthy();
      if (!geometry) continue;
      const bounds = geometry.roomZones?.find((candidate) => candidate.id === 'dress-room')?.boundsMeters as number[];
      const [x1, y1, x2, y2] = bounds;
      const vertical = ['east', 'west'].includes(layout.dressRoomPowderStorage.edge);
      const expectedSpan = (vertical ? y2 - y1 : x2 - x1) - .04;
      for (const variant of ['A', 'B'] as const) {
        const props = optionProps(geometry, unitType, ['dress-room-powder-storage'], [{
          id: `inspection-${unitType}-dress-room-powder-storage`, assetId: 'vanity-dressing-table', anchorId: 'options.dressRoomPowderStorage',
        }], variant).filter((prop) => prop.sourceOptionId === 'dress-room-powder-storage');
        expect(props).toHaveLength(2);
        const vanity = props.find((prop) => prop.assetId === 'bunfirvil-dress-room-powder-vanity');
        const storage = props.find((prop) => prop.assetId === 'bunfirvil-dress-room-storage-three-bay');
        expect(vanity?.yawDeg, `${unitType}:${variant}:vanity`).toBe(expected[unitType][variant].vanityYaw);
        expect(storage?.yawDeg, `${unitType}:${variant}:storage`).toBe(expected[unitType][variant].storageYaw);
        expect((vanity?.dimensionsMeters as number[])[0] + (storage?.dimensionsMeters as number[])[0]).toBeCloseTo(expectedSpan);
        const axis = vertical ? 1 : 0;
        const vanityCoordinate = (vanity?.positionMeters as number[])[axis];
        const storageCoordinate = (storage?.positionMeters as number[])[axis];
        expect(vanityCoordinate < storageCoordinate, `${unitType}:${variant}:section order`)
          .toBe(expected[unitType][variant].swapped);
        expect(bundangEditorSelectionPropIds(props, String(vanity?.id))).toHaveLength(2);
      }
    }
  });

  it('복합환풍기를 둥근 로컬 recipe와 가로형 크기로 교체한다', () => {
    const props = optionProps({ wallSegments: [] }, '55A', ['bathroom-combination-ventilator'], [{
      id: 'bath-vent', assetId: 'bathroom-combination-ventilator', dimensionsMeters: [.43, .43, .2],
    }]);
    expect(props[0].assetId).toBe('bunfirvil-bathroom-combination-ventilator-rounded');
    expect(props[0].dimensionsMeters).toEqual([.52, .34, .12]);
    expect(props[0].materialVariantId).toBe('system-ac-light-gray');
    expect(props[0].sourceOptionId).toBe('bathroom-combination-ventilator');
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

  it('정밀 수납장과 둥근 복합환풍기 recipe를 로컬 자산으로 제공한다', () => {
    const clothingCare = STRUCTURAL_PROP_ASSETS.find((asset) => asset.assetId === 'bunfirvil-bedroom-1-clothing-care-full-wall');
    const powder = STRUCTURAL_PROP_ASSETS.find((asset) => asset.assetId === 'bunfirvil-dress-room-powder-vanity');
    const storage = STRUCTURAL_PROP_ASSETS.find((asset) => asset.assetId === 'bunfirvil-dress-room-storage-three-bay');
    const ventilator = STRUCTURAL_PROP_ASSETS.find((asset) => asset.assetId === 'bunfirvil-bathroom-combination-ventilator-rounded');
    expect(clothingCare?.parts?.some((part) => part.materialRole === 'styler-front')).toBe(true);
    expect(powder?.parts?.filter((part) => part.materialRole === 'secondary')).toHaveLength(2);
    expect(powder?.parts?.some((part) => part.materialRole === 'mirror')).toBe(true);
    expect(storage?.parts?.filter((part) => part.materialRole === 'secondary')).toHaveLength(3);
    expect(ventilator?.parts?.filter((part) => part.shape === 'vertical-cylinder').length).toBeGreaterThanOrEqual(4);
    expect(ventilator?.parts?.some((part) => part.materialRole === 'vent-dark')).toBe(true);
  });
});
