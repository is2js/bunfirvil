import { apartmentUnitWorldPoint, type NumericPoint } from '../game/apartment-transform';
import type { ThreeWorldRenderer } from '../game/three-world';
import type { ApartmentInteriorProp, StaticMapEntry, WorldData, WorldObject } from '../game/types';
import { loadWorld } from '../game/world';
import { resolveAppUrl } from './catalog';
import {
  createLocalProp,
  layoutStorageKey,
  readLayout,
  validateLayout,
  writeLayout,
  type InteriorAssetEntry,
  type LocalInteriorLayoutV1,
} from './interior-layout';
import type { ShowcaseCatalogV1 } from './types';

interface InteriorCatalogPayload {
  assets?: InteriorAssetEntry[];
}

type EditorMode = '2d' | 'split' | '3d';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLElement)) throw new Error(`#${id} 요소를 찾을 수 없습니다.`);
  return node as T;
}

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function polygon(value: unknown): NumericPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point): NumericPoint[] => Array.isArray(point) && point.length >= 2
    ? [[finite(point[0]), finite(point[1])]]
    : []);
}

function rowPolygon(row: Record<string, unknown>): NumericPoint[] {
  const direct = polygon(row.footprintPolygonMeters || row.polygon);
  if (direct.length >= 3) return direct;
  const bounds = Array.isArray(row.boundsMeters) ? row.boundsMeters.map((value) => finite(value)) : [];
  return bounds.length === 4
    ? [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]]]
    : [];
}

function contains(point: NumericPoint, area: NumericPoint[]): boolean {
  if (area.length < 3) return false;
  let inside = false;
  let previous = area[area.length - 1];
  for (const current of area) {
    if ((current[1] > point[1]) !== (previous[1] > point[1])) {
      const crossing = (previous[0] - current[0]) * (point[1] - current[1]) / ((previous[1] - current[1]) || 1e-9) + current[0];
      if (point[0] < crossing) inside = !inside;
    }
    previous = current;
  }
  return inside;
}

function dimensions(prop: ApartmentInteriorProp, asset?: InteriorAssetEntry): [number, number, number] {
  const source = prop.dimensionsMeters || asset?.defaultDimensionsMeters;
  if (Array.isArray(source)) return [finite(source[0], .8), finite(source[1], .8), finite(source[2], .8)];
  const object = source && typeof source === 'object' ? source : {};
  return [finite((object as { width?: number }).width, .8), finite((object as { depth?: number }).depth, .8), finite((object as { height?: number }).height, .8)];
}

export class InteriorEditor {
  private assets: InteriorAssetEntry[] = [];
  private world: WorldData | null = null;
  private apartment: WorldObject | null = null;
  private props: ApartmentInteriorProp[] = [];
  private selectedPropId = '';
  private renderer: ThreeWorldRenderer | null = null;
  private mode: EditorMode = 'split';
  private frame = 0;
  private dragPointer = -1;
  private mapLoadToken = 0;
  private search = '';
  private sequence = 0;
  private view = { minX: 0, minY: 0, maxX: 10, maxY: 10, scale: 1, offsetX: 0, offsetY: 0 };

  private readonly section = element<HTMLElement>('interiorEditor');
  private readonly mapSelect = element<HTMLSelectElement>('editorMapSelect');
  private readonly planCanvas = element<HTMLCanvasElement>('editorPlanCanvas');
  private readonly threeCanvas = element<HTMLCanvasElement>('editorThreeCanvas');
  private readonly assetList = element<HTMLElement>('editorAssetList');
  private readonly assetSearch = element<HTMLInputElement>('editorAssetSearch');
  private readonly inspector = element<HTMLElement>('editorInspector');
  private readonly localCount = element<HTMLElement>('editorLocalCount');
  private readonly status = element<HTMLElement>('editorStatus');
  private readonly importFile = element<HTMLInputElement>('editorImportFile');

  constructor(
    private readonly catalog: ShowcaseCatalogV1,
    private readonly selectedOptions: (mapId: string) => string[],
  ) {}

  async initialize(): Promise<void> {
    this.mapSelect.innerHTML = this.catalog.maps.map((map) => `<option value="${map.id}">${map.unitType} · ${map.label}</option>`).join('');
    const response = await fetch(resolveAppUrl(this.catalog.renderAssets.interiorCatalogUrl));
    if (!response.ok) throw new Error(`인테리어 카탈로그를 불러오지 못했습니다. (HTTP ${response.status})`);
    const payload = await response.json() as InteriorCatalogPayload;
    this.assets = (payload.assets || []).filter((asset) => asset.assetId && asset.displayNameKo && asset.category !== 'notice' && asset.mountingKind !== 'room-finish');
    this.renderPalette();
    this.bind();
    try {
      const module = await import('../game/three-world');
      this.renderer = new module.ThreeWorldRenderer(this.threeCanvas, this.catalog.renderAssets);
    } catch (error) {
      this.threeCanvas.hidden = true;
      this.status.textContent = `WebGL 프리뷰를 열 수 없어 평면도 편집만 사용합니다. ${error instanceof Error ? error.message : ''}`;
    }
    await this.selectMap(this.catalog.maps[0]?.id || '');
    this.frame = requestAnimationFrame(this.renderFrame);
  }

  refreshSelectedOptions(mapId: string): void {
    if (this.world?.entry.id !== mapId) return;
    this.renderer?.setSelectedOptions(this.selectedOptions(mapId));
  }

  private bind(): void {
    this.mapSelect.addEventListener('change', () => void this.selectMap(this.mapSelect.value));
    this.assetSearch.addEventListener('input', () => {
      this.search = this.assetSearch.value.trim().toLowerCase();
      this.renderPalette();
    });
    document.querySelectorAll<HTMLButtonElement>('[data-editor-mode]').forEach((button) => {
      button.addEventListener('click', () => this.setMode(button.dataset.editorMode as EditorMode));
    });
    this.planCanvas.addEventListener('pointerdown', (event) => this.planPointerDown(event));
    this.planCanvas.addEventListener('pointermove', (event) => this.planPointerMove(event));
    this.planCanvas.addEventListener('pointerup', (event) => this.planPointerUp(event));
    this.planCanvas.addEventListener('pointercancel', (event) => this.planPointerUp(event));
    element<HTMLButtonElement>('editorRotateLeft').addEventListener('click', () => this.rotate(-90));
    element<HTMLButtonElement>('editorRotateRight').addEventListener('click', () => this.rotate(90));
    element<HTMLButtonElement>('editorMirror').addEventListener('click', () => this.mirror());
    element<HTMLButtonElement>('editorDelete').addEventListener('click', () => this.deleteSelected());
    element<HTMLButtonElement>('editorReset').addEventListener('click', () => this.reset());
    element<HTMLButtonElement>('editorExport').addEventListener('click', () => this.exportLayout());
    this.importFile.addEventListener('change', () => void this.importLayout());
    window.addEventListener('resize', () => this.drawPlan());
  }

  private async selectMap(mapId: string): Promise<void> {
    const map = this.catalog.maps.find((entry) => entry.id === mapId);
    if (!map) return;
    const token = ++this.mapLoadToken;
    this.status.textContent = `${map.unitType} 정적 world와 PBR 구조를 불러오는 중…`;
    this.section.dataset.loading = 'true';
    const world = await loadWorld(map as unknown as StaticMapEntry);
    if (token !== this.mapLoadToken) return;
    this.world = world;
    this.apartment = world.objects.find((object) => object.type === 'enterable-apartment-unit-v1' && object.geometry) || null;
    this.mapSelect.value = map.id;
    this.selectedPropId = '';
    this.props = readLayout(map.id, new Set(this.assets.map((asset) => asset.assetId))).props;
    this.renderer?.setWorld(world);
    this.renderer?.setSelectedOptions(this.selectedOptions(map.id));
    this.renderer?.setEditorProps(this.props);
    this.focusApartment();
    this.updateInspector();
    this.updateCount();
    this.drawPlan();
    this.section.dataset.loading = 'false';
    this.section.dataset.mapId = map.id;
    this.status.textContent = `${map.unitType} · 평면도와 Three.js PBR가 같은 로컬 meter 좌표를 사용합니다.`;
  }

  private focusApartment(): void {
    if (!this.apartment) return;
    const floor = polygon(this.apartment.geometry?.floorPolygon);
    if (!floor.length) return;
    const x = (Math.min(...floor.map((point) => point[0])) + Math.max(...floor.map((point) => point[0]))) / 2;
    const y = (Math.min(...floor.map((point) => point[1])) + Math.max(...floor.map((point) => point[1]))) / 2;
    const world = apartmentUnitWorldPoint(this.apartment, [x, y]);
    this.renderer?.focusAt(world.x, world.y);
  }

  private renderPalette(): void {
    const matches = this.assets.filter((asset) => !this.search || `${asset.displayNameKo} ${asset.assetId} ${asset.category}`.toLowerCase().includes(this.search));
    this.assetList.innerHTML = matches.map((asset) => `
      <button type="button" class="editor-asset" data-editor-asset="${asset.assetId}">
        <span class="editor-asset-icon" data-category="${asset.category}">${asset.displayNameKo.slice(0, 1)}</span>
        <span><b>${asset.displayNameKo}</b><small>${asset.category} · ${asset.rendererKind === 'glb' ? 'GLB/recipe' : 'Three.js recipe'}</small></span>
        <em>＋</em>
      </button>`).join('') || '<p class="editor-empty">검색 결과가 없습니다.</p>';
    this.assetList.querySelectorAll<HTMLButtonElement>('[data-editor-asset]').forEach((button) => {
      button.addEventListener('click', () => this.addAsset(button.dataset.editorAsset || ''));
    });
  }

  private addAsset(assetId: string): void {
    const asset = this.assets.find((candidate) => candidate.assetId === assetId);
    const apartment = this.apartment;
    if (!asset || !apartment || !this.world) return;
    const floor = polygon(apartment.geometry?.floorPolygon);
    if (!floor.length) return;
    const center: NumericPoint = [
      (Math.min(...floor.map((point) => point[0])) + Math.max(...floor.map((point) => point[0]))) / 2,
      (Math.min(...floor.map((point) => point[1])) + Math.max(...floor.map((point) => point[1]))) / 2,
    ];
    const rooms = apartment.geometry?.roomZones || [];
    const room = rooms.map((row) => ({ row, area: rowPolygon(row as Record<string, unknown>) })).find((entry) => entry.area.length >= 3 && contains(center, entry.area))
      || rooms.map((row) => ({ row, area: rowPolygon(row as Record<string, unknown>) })).find((entry) => entry.area.length >= 3);
    const placement = room?.area.length
      ? [room.area.reduce((sum, point) => sum + point[0], 0) / room.area.length, room.area.reduce((sum, point) => sum + point[1], 0) / room.area.length] as NumericPoint
      : center;
    const prop = createLocalProp(asset, placement[0], placement[1], Date.now() + ++this.sequence);
    prop.roomZoneId = String((room?.row as Record<string, unknown> | undefined)?.id || '');
    this.props.push(prop);
    this.selectedPropId = String(prop.id);
    this.save('소품을 로컬 배치에 추가했습니다. 평면도에서 드래그해 위치를 조정하세요.');
  }

  private setMode(mode: EditorMode): void {
    this.mode = mode;
    this.section.dataset.mode = mode;
    document.querySelectorAll<HTMLElement>('[data-editor-mode]').forEach((button) => button.classList.toggle('is-active', button.dataset.editorMode === mode));
    this.drawPlan();
    this.focusApartment();
  }

  private resizePlan(): CanvasRenderingContext2D | null {
    const context = this.planCanvas.getContext('2d');
    if (!context) return null;
    const bounds = this.planCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.planCanvas.width = Math.max(1, Math.round(bounds.width * dpr));
    this.planCanvas.height = Math.max(1, Math.round(bounds.height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return context;
  }

  private drawPlan(): void {
    const context = this.resizePlan();
    const apartment = this.apartment;
    if (!context || !apartment) return;
    const bounds = this.planCanvas.getBoundingClientRect();
    const floor = polygon(apartment.geometry?.floorPolygon);
    if (floor.length < 3) return;
    const minX = Math.min(...floor.map((point) => point[0]));
    const maxX = Math.max(...floor.map((point) => point[0]));
    const minY = Math.min(...floor.map((point) => point[1]));
    const maxY = Math.max(...floor.map((point) => point[1]));
    const padding = 30;
    const scale = Math.max(1, Math.min((bounds.width - padding * 2) / Math.max(.1, maxX - minX), (bounds.height - padding * 2) / Math.max(.1, maxY - minY)));
    this.view = { minX, minY, maxX, maxY, scale, offsetX: (bounds.width - (maxX - minX) * scale) / 2, offsetY: (bounds.height - (maxY - minY) * scale) / 2 };
    context.fillStyle = '#151412';
    context.fillRect(0, 0, bounds.width, bounds.height);
    context.strokeStyle = 'rgba(148, 163, 154, .12)';
    context.lineWidth = 1;
    for (let x = Math.floor(minX * 2) / 2; x <= maxX; x += .5) {
      const a = this.localToCanvas([x, minY]); const b = this.localToCanvas([x, maxY]);
      context.beginPath(); context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]); context.stroke();
    }
    for (let y = Math.floor(minY * 2) / 2; y <= maxY; y += .5) {
      const a = this.localToCanvas([minX, y]); const b = this.localToCanvas([maxX, y]);
      context.beginPath(); context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]); context.stroke();
    }
    this.fillPolygon(context, floor, '#c7b7a4', '#f0e4d4', 2);
    for (const raw of apartment.geometry?.roomZones || []) {
      const row = raw as Record<string, unknown>;
      const area = rowPolygon(row);
      if (area.length < 3) continue;
      this.fillPolygon(context, area, 'rgba(87, 123, 111, .10)', 'rgba(77, 116, 105, .28)', 1);
      const center = this.localToCanvas([area.reduce((sum, point) => sum + point[0], 0) / area.length, area.reduce((sum, point) => sum + point[1], 0) / area.length]);
      context.fillStyle = 'rgba(49, 61, 56, .66)';
      context.font = '600 10px sans-serif';
      context.textAlign = 'center';
      context.fillText(String(row.labelKo || row.label || row.id || ''), center[0], center[1]);
    }
    context.lineCap = 'square';
    for (const raw of apartment.geometry?.wallSegments || []) {
      const wall = raw as Record<string, unknown>;
      if (!Array.isArray(wall.a) || !Array.isArray(wall.b)) continue;
      const a = this.localToCanvas([finite(wall.a[0]), finite(wall.a[1])]);
      const b = this.localToCanvas([finite(wall.b[0]), finite(wall.b[1])]);
      context.strokeStyle = '#403d38';
      context.lineWidth = Math.max(2, finite(wall.thicknessMeters, .12) * scale);
      context.beginPath(); context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]); context.stroke();
    }
    const base = apartment.geometry?.interiorProps || [];
    for (const prop of base) this.drawProp(context, prop, false);
    for (const prop of this.props) this.drawProp(context, prop, true);
    this.planCanvas.dataset.localPropCount = String(this.props.length);
  }

  private fillPolygon(context: CanvasRenderingContext2D, area: NumericPoint[], fill: string, stroke: string, width: number): void {
    context.beginPath();
    area.forEach((point, index) => {
      const value = this.localToCanvas(point);
      if (index === 0) context.moveTo(value[0], value[1]); else context.lineTo(value[0], value[1]);
    });
    context.closePath(); context.fillStyle = fill; context.fill(); context.strokeStyle = stroke; context.lineWidth = width; context.stroke();
  }

  private drawProp(context: CanvasRenderingContext2D, prop: ApartmentInteriorProp, local: boolean): void {
    const position = prop.positionMeters;
    if (!Array.isArray(position) || position.length < 2) return;
    const asset = this.assets.find((candidate) => candidate.assetId === prop.assetId);
    const size = dimensions(prop, asset);
    const center = this.localToCanvas([finite(position[0]), finite(position[1])]);
    context.save();
    context.translate(center[0], center[1]);
    context.rotate(-finite(prop.yawDeg) * Math.PI / 180);
    context.fillStyle = local ? 'rgba(77, 220, 165, .42)' : 'rgba(71, 75, 70, .30)';
    context.strokeStyle = String(prop.id) === this.selectedPropId ? '#fff1a8' : local ? '#63e6b4' : 'rgba(39, 43, 40, .56)';
    context.lineWidth = String(prop.id) === this.selectedPropId ? 3 : 1;
    context.fillRect(-size[0] * this.view.scale / 2, -size[1] * this.view.scale / 2, size[0] * this.view.scale, size[1] * this.view.scale);
    context.strokeRect(-size[0] * this.view.scale / 2, -size[1] * this.view.scale / 2, size[0] * this.view.scale, size[1] * this.view.scale);
    context.restore();
  }

  private localToCanvas(point: NumericPoint): NumericPoint {
    return [this.view.offsetX + (point[0] - this.view.minX) * this.view.scale, this.view.offsetY + (this.view.maxY - point[1]) * this.view.scale];
  }

  private canvasToLocal(event: PointerEvent): NumericPoint {
    const bounds = this.planCanvas.getBoundingClientRect();
    return [
      this.view.minX + (event.clientX - bounds.left - this.view.offsetX) / this.view.scale,
      this.view.maxY - (event.clientY - bounds.top - this.view.offsetY) / this.view.scale,
    ];
  }

  private planPointerDown(event: PointerEvent): void {
    const point = this.canvasToLocal(event);
    const hit = [...this.props].reverse().find((prop) => {
      const position = prop.positionMeters;
      if (!Array.isArray(position)) return false;
      const asset = this.assets.find((candidate) => candidate.assetId === prop.assetId);
      const size = dimensions(prop, asset);
      return Math.abs(point[0] - finite(position[0])) <= Math.max(.25, size[0] / 2) && Math.abs(point[1] - finite(position[1])) <= Math.max(.25, size[1] / 2);
    });
    this.selectedPropId = String(hit?.id || '');
    this.dragPointer = hit ? event.pointerId : -1;
    if (hit) this.planCanvas.setPointerCapture(event.pointerId);
    this.updateInspector();
    this.drawPlan();
  }

  private planPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointer) return;
    const prop = this.selectedProp();
    const floor = polygon(this.apartment?.geometry?.floorPolygon);
    const point = this.canvasToLocal(event).map((value) => Math.round(value * 20) / 20) as NumericPoint;
    if (!prop || (floor.length >= 3 && !this.fitsFloor(prop, point, floor))) return;
    prop.positionMeters = point;
    this.updateInspector();
    this.drawPlan();
  }

  private planPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointer) return;
    this.dragPointer = -1;
    this.save('소품 위치를 0.05m 단위로 로컬 저장했습니다.');
  }

  private selectedProp(): ApartmentInteriorProp | undefined {
    return this.props.find((prop) => String(prop.id) === this.selectedPropId);
  }

  private fitsFloor(prop: ApartmentInteriorProp, position: NumericPoint, floor = polygon(this.apartment?.geometry?.floorPolygon)): boolean {
    if (floor.length < 3) return true;
    const asset = this.assets.find((candidate) => candidate.assetId === prop.assetId);
    const size = dimensions(prop, asset);
    const angle = finite(prop.yawDeg) * Math.PI / 180;
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    const corners: NumericPoint[] = [
      [-size[0] / 2, -size[1] / 2], [size[0] / 2, -size[1] / 2],
      [size[0] / 2, size[1] / 2], [-size[0] / 2, size[1] / 2],
    ].map(([x, y]) => [position[0] + x * cos - y * sin, position[1] + x * sin + y * cos]);
    return corners.every((corner) => contains(corner, floor));
  }

  private updateInspector(): void {
    const prop = this.selectedProp();
    if (!prop) {
      this.inspector.innerHTML = '<div class="editor-no-selection"><b>선택 없음</b><p>평면도의 초록 소품을 선택하거나 팔레트에서 새 소품을 추가하세요.</p></div>';
      return;
    }
    const asset = this.assets.find((candidate) => candidate.assetId === prop.assetId);
    const position = prop.positionMeters || [0, 0];
    this.inspector.innerHTML = `
      <div class="editor-selection-card"><span>${asset?.category || 'prop'}</span><b>${asset?.displayNameKo || prop.assetId}</b><small>${prop.id}</small></div>
      <label>X (m)<input id="editorPropX" type="number" step="0.05" value="${finite(position[0]).toFixed(2)}" /></label>
      <label>Y (m)<input id="editorPropY" type="number" step="0.05" value="${finite(position[1]).toFixed(2)}" /></label>
      <dl><div><dt>회전</dt><dd>${finite(prop.yawDeg)}°</dd></div><div><dt>반전</dt><dd>${prop.mirrored ? 'ON' : 'OFF'}</dd></div></dl>`;
    const applyCoordinate = () => {
      const x = Number((document.getElementById('editorPropX') as HTMLInputElement).value);
      const y = Number((document.getElementById('editorPropY') as HTMLInputElement).value);
      const floor = polygon(this.apartment?.geometry?.floorPolygon);
      if (!Number.isFinite(x) || !Number.isFinite(y) || (floor.length >= 3 && !this.fitsFloor(prop, [x, y], floor))) {
        this.status.textContent = '세대 바닥 안의 유효한 meter 좌표를 입력해 주세요.';
        return;
      }
      prop.positionMeters = [Math.round(x * 20) / 20, Math.round(y * 20) / 20];
      this.save('좌표를 로컬 저장했습니다.');
    };
    document.getElementById('editorPropX')?.addEventListener('change', applyCoordinate);
    document.getElementById('editorPropY')?.addEventListener('change', applyCoordinate);
  }

  private rotate(delta: number): void {
    const prop = this.selectedProp(); if (!prop) return;
    prop.yawDeg = ((finite(prop.yawDeg) + delta) % 360 + 360) % 360;
    this.save(`${delta > 0 ? '+' : '−'}90° 회전을 저장했습니다.`);
  }

  private mirror(): void {
    const prop = this.selectedProp(); if (!prop) return;
    prop.mirrored = !prop.mirrored;
    this.save(`좌우 반전을 ${prop.mirrored ? '적용' : '해제'}했습니다.`);
  }

  private deleteSelected(): void {
    if (!this.selectedPropId) return;
    this.props = this.props.filter((prop) => String(prop.id) !== this.selectedPropId);
    this.selectedPropId = '';
    this.save('선택 소품을 로컬 배치에서 삭제했습니다.');
  }

  private save(message: string): void {
    if (!this.world) return;
    const layout: LocalInteriorLayoutV1 = { schemaVersion: 1, mapId: this.world.entry.id, props: this.props, updatedAt: new Date().toISOString() };
    writeLayout(layout);
    this.renderer?.setEditorProps(this.props);
    this.updateInspector();
    this.updateCount();
    this.drawPlan();
    this.status.textContent = message;
  }

  private updateCount(): void {
    this.localCount.textContent = `${this.props.length}개 로컬 배치`;
    this.section.dataset.localPropCount = String(this.props.length);
  }

  private reset(): void {
    if (!this.world || !window.confirm('현재 맵의 로컬 가구 배치를 모두 초기화할까요?')) return;
    localStorage.removeItem(layoutStorageKey(this.world.entry.id));
    this.props = [];
    this.selectedPropId = '';
    this.save('현재 맵의 로컬 가구 배치를 초기화했습니다.');
  }

  private exportLayout(): void {
    if (!this.world) return;
    const layout: LocalInteriorLayoutV1 = { schemaVersion: 1, mapId: this.world.entry.id, props: this.props, updatedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(layout, null, 2)}\n`], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `bunfirvil-layout-${this.world.entry.unitType.toLowerCase()}.json`; anchor.click(); URL.revokeObjectURL(url);
    this.status.textContent = '현재 맵의 로컬 배치를 JSON으로 내보냈습니다.';
  }

  private async importLayout(): Promise<void> {
    const file = this.importFile.files?.[0]; this.importFile.value = '';
    if (!file || !this.world) return;
    try {
      const result = validateLayout(JSON.parse(await file.text()), this.world.entry.id, new Set(this.assets.map((asset) => asset.assetId)));
      if (!result.ok) throw new Error(result.error);
      const floor = polygon(this.apartment?.geometry?.floorPolygon);
      if (result.value.props.some((prop) => {
        const position = prop.positionMeters;
        return !Array.isArray(position) || !this.fitsFloor(prop, [finite(position[0]), finite(position[1])], floor);
      })) throw new Error('세대 바닥 경계를 벗어난 소품 배치가 있습니다.');
      this.props = result.value.props;
      this.selectedPropId = '';
      this.save(`${this.props.length}개 로컬 소품 배치를 가져왔습니다.`);
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : '배치 JSON을 가져오지 못했습니다.';
    }
  }

  private readonly renderFrame = (): void => {
    this.renderer?.render();
    this.frame = requestAnimationFrame(this.renderFrame);
  };
}
