import {
  apartmentUnitWorldPoint,
  apartmentWorldPointToLocalMeters,
  type NumericPoint,
} from '../game/apartment-transform';
import { resolveReferencedUrl } from '../game/base';
import {
  applyPlanVariant,
  availablePlanVariants,
  inverseTransformPlanPoint,
  transformPlanPoint,
  type ApartmentPlanVariant,
} from '../game/plan-variants';
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
  private dragCanvas: HTMLCanvasElement | null = null;
  private catalogUrl = '';
  private mapLoadToken = 0;
  private search = '';
  private sequence = 0;
  private view = { minX: 0, minY: 0, maxX: 10, maxY: 10, scale: 1, offsetX: 0, offsetY: 0 };

  private readonly section = element<HTMLElement>('interiorEditor');
  private readonly mapSelect = element<HTMLSelectElement>('editorMapSelect');
  private readonly planVariantSelect = element<HTMLSelectElement>('editorPlanVariant');
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
    this.section.tabIndex = -1;
    this.mapSelect.innerHTML = this.catalog.maps.map((map) => `<option value="${map.id}">${map.unitType} · ${map.label}</option>`).join('');
    this.catalogUrl = resolveAppUrl(this.catalog.renderAssets.interiorCatalogUrl);
    const response = await fetch(this.catalogUrl);
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
    this.planVariantSelect.addEventListener('change', () => void this.selectMap(this.mapSelect.value));
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
    this.threeCanvas.addEventListener('pointerdown', (event) => this.threePointerDown(event));
    this.threeCanvas.addEventListener('pointermove', (event) => this.threePointerMove(event));
    this.threeCanvas.addEventListener('pointerup', (event) => this.threePointerUp(event));
    this.threeCanvas.addEventListener('pointercancel', (event) => this.threePointerUp(event));
    for (const canvas of [this.planCanvas, this.threeCanvas]) {
      canvas.addEventListener('wheel', (event) => this.editorWheel(event), { passive: false });
      canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    }
    this.section.addEventListener('keydown', (event) => this.editorKeyDown(event));
    element<HTMLButtonElement>('editorRotateLeft').addEventListener('click', () => this.rotate(-90));
    element<HTMLButtonElement>('editorRotateRight').addEventListener('click', () => this.rotate(90));
    element<HTMLButtonElement>('editorScaleDown').addEventListener('click', () => this.resizeSelected(-.05));
    element<HTMLButtonElement>('editorScaleUp').addEventListener('click', () => this.resizeSelected(.05));
    element<HTMLButtonElement>('editorMirror').addEventListener('click', () => this.mirror());
    element<HTMLButtonElement>('editorDuplicate').addEventListener('click', () => this.duplicateSelected());
    element<HTMLButtonElement>('editorDelete').addEventListener('click', () => this.deleteSelected());
    element<HTMLButtonElement>('editorReset').addEventListener('click', () => this.reset());
    element<HTMLButtonElement>('editorExport').addEventListener('click', () => this.exportLayout());
    this.importFile.addEventListener('change', () => void this.importLayout());
    window.addEventListener('resize', () => this.drawPlan());
  }

  private async selectMap(mapId: string): Promise<void> {
    const map = this.catalog.maps.find((entry) => entry.id === mapId);
    if (!map) return;
    const availableVariants = availablePlanVariants(map.unitType);
    [...this.planVariantSelect.options].forEach((option) => {
      option.hidden = !availableVariants.includes(option.value as ApartmentPlanVariant);
      option.disabled = option.hidden;
    });
    if (!availableVariants.includes(this.planVariantSelect.value as ApartmentPlanVariant)) this.planVariantSelect.value = availableVariants[0] || 'A';
    const token = ++this.mapLoadToken;
    this.status.textContent = `${map.unitType} 정적 world와 PBR 구조를 불러오는 중…`;
    this.section.dataset.loading = 'true';
    const world = await loadWorld(map as unknown as StaticMapEntry);
    if (token !== this.mapLoadToken) return;
    const planVariant = this.planVariantSelect.value as ApartmentPlanVariant;
    const planDefinition = applyPlanVariant(world, planVariant);
    this.world = world;
    this.apartment = world.objects.find((object) => object.type === 'enterable-apartment-unit-v1' && object.geometry) || null;
    this.mapSelect.value = map.id;
    this.selectedPropId = '';
    this.props = readLayout(map.id, new Set(this.assets.map((asset) => asset.assetId))).props;
    this.renderer?.setWorld(world);
    this.renderer?.setSelectedOptions(this.selectedOptions(map.id));
    this.renderer?.setEditorProps(this.props);
    this.renderer?.setEditorSelection('');
    this.focusApartment();
    this.updateInspector();
    this.updateCount();
    this.drawPlan();
    this.section.dataset.loading = 'false';
    this.section.dataset.mapId = map.id;
    this.section.dataset.planVariant = planDefinition.variant;
    this.planCanvas.dataset.planVariant = planDefinition.variant;
    this.threeCanvas.dataset.planVariant = planDefinition.variant;
    this.status.textContent = `${map.unitType} ${planDefinition.label} · 평면도와 Three.js PBR가 같은 RPG 변환 좌표를 사용합니다.`;
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
        <span class="editor-asset-icon" data-category="${asset.category}">${asset.previewUrl
          ? `<img src="${resolveReferencedUrl(asset.previewUrl, this.catalogUrl)}" alt="" loading="lazy" />`
          : asset.displayNameKo.slice(0, 1)}</span>
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
    this.section.focus({ preventScroll: true });
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
    const localMinX = Math.min(...floor.map((point) => point[0]));
    const localMaxX = Math.max(...floor.map((point) => point[0]));
    const localMinY = Math.min(...floor.map((point) => point[1]));
    const localMaxY = Math.max(...floor.map((point) => point[1]));
    const displayFloor = floor.map((point) => transformPlanPoint(point, apartment.transform));
    const minX = Math.min(...displayFloor.map((point) => point[0]));
    const maxX = Math.max(...displayFloor.map((point) => point[0]));
    const minY = Math.min(...displayFloor.map((point) => point[1]));
    const maxY = Math.max(...displayFloor.map((point) => point[1]));
    const padding = 30;
    const scale = Math.max(1, Math.min((bounds.width - padding * 2) / Math.max(.1, maxX - minX), (bounds.height - padding * 2) / Math.max(.1, maxY - minY)));
    this.view = { minX, minY, maxX, maxY, scale, offsetX: (bounds.width - (maxX - minX) * scale) / 2, offsetY: (bounds.height - (maxY - minY) * scale) / 2 };
    context.fillStyle = '#151412';
    context.fillRect(0, 0, bounds.width, bounds.height);
    context.strokeStyle = 'rgba(148, 163, 154, .12)';
    context.lineWidth = 1;
    for (let x = Math.floor(localMinX * 2) / 2; x <= localMaxX; x += .5) {
      const a = this.localToCanvas([x, localMinY]); const b = this.localToCanvas([x, localMaxY]);
      context.beginPath(); context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]); context.stroke();
    }
    for (let y = Math.floor(localMinY * 2) / 2; y <= localMaxY; y += .5) {
      const a = this.localToCanvas([localMinX, y]); const b = this.localToCanvas([localMaxX, y]);
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
    const angle = finite(prop.yawDeg) * Math.PI / 180;
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    const center: NumericPoint = [finite(position[0]), finite(position[1])];
    const corners: NumericPoint[] = [
      [-size[0] / 2, -size[1] / 2], [size[0] / 2, -size[1] / 2],
      [size[0] / 2, size[1] / 2], [-size[0] / 2, size[1] / 2],
    ].map(([x, y]) => this.localToCanvas([center[0] + x * cos - y * sin, center[1] + x * sin + y * cos]));
    context.beginPath();
    corners.forEach((point, index) => index === 0 ? context.moveTo(point[0], point[1]) : context.lineTo(point[0], point[1]));
    context.closePath();
    context.fillStyle = local ? 'rgba(77, 220, 165, .42)' : 'rgba(71, 75, 70, .30)';
    context.strokeStyle = String(prop.id) === this.selectedPropId ? '#fff1a8' : local ? '#63e6b4' : 'rgba(39, 43, 40, .56)';
    context.lineWidth = String(prop.id) === this.selectedPropId ? 3 : 1;
    context.fill();
    context.stroke();
  }

  private localToCanvas(point: NumericPoint): NumericPoint {
    const display = transformPlanPoint(point, this.apartment?.transform);
    return [this.view.offsetX + (display[0] - this.view.minX) * this.view.scale, this.view.offsetY + (this.view.maxY - display[1]) * this.view.scale];
  }

  private canvasToLocal(event: PointerEvent): NumericPoint {
    const bounds = this.planCanvas.getBoundingClientRect();
    const display: NumericPoint = [
      this.view.minX + (event.clientX - bounds.left - this.view.offsetX) / this.view.scale,
      this.view.maxY - (event.clientY - bounds.top - this.view.offsetY) / this.view.scale,
    ];
    return inverseTransformPlanPoint(display, this.apartment?.transform);
  }

  private planPointerDown(event: PointerEvent): void {
    const point = this.canvasToLocal(event);
    const hit = this.hitProp(point);
    if (hit && event.ctrlKey) {
      const copy = this.duplicateProp(hit);
      this.props.push(copy);
      this.selectedPropId = String(copy.id);
    } else {
      this.selectedPropId = String(hit?.id || '');
    }
    if (hit && event.altKey) {
      this.mirror();
      return;
    }
    this.dragPointer = hit ? event.pointerId : -1;
    this.dragCanvas = hit ? this.planCanvas : null;
    if (hit) {
      this.planCanvas.setPointerCapture(event.pointerId);
      this.section.focus({ preventScroll: true });
    }
    this.updateInspector();
    this.drawPlan();
    this.renderer?.setEditorSelection(this.selectedPropId);
  }

  private planPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointer) return;
    const point = this.canvasToLocal(event).map((value) => Math.round(value * 20) / 20) as NumericPoint;
    this.moveSelectedTo(point, true);
  }

  private planPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointer) return;
    this.dragPointer = -1;
    this.dragCanvas = null;
    this.save('소품 위치를 0.05m 단위로 로컬 저장했습니다.');
  }

  private threeLocalPoint(event: PointerEvent): NumericPoint | null {
    const apartment = this.apartment;
    const renderer = this.renderer;
    if (!apartment || !renderer) return null;
    const bounds = this.threeCanvas.getBoundingClientRect();
    const world = renderer.unproject(event.clientX - bounds.left, event.clientY - bounds.top);
    return world ? apartmentWorldPointToLocalMeters(apartment, world) : null;
  }

  private threePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const point = this.threeLocalPoint(event);
    if (!point) return;
    const hit = this.hitProp(point);
    if (hit && event.ctrlKey) {
      const copy = this.duplicateProp(hit);
      this.props.push(copy);
      this.selectedPropId = String(copy.id);
    } else {
      this.selectedPropId = String(hit?.id || '');
    }
    if (hit && event.altKey) {
      this.mirror();
      return;
    }
    this.dragPointer = hit ? event.pointerId : -1;
    this.dragCanvas = hit ? this.threeCanvas : null;
    if (hit) {
      this.threeCanvas.setPointerCapture(event.pointerId);
      this.section.focus({ preventScroll: true });
    }
    this.updateInspector();
    this.drawPlan();
    this.renderer?.setEditorSelection(this.selectedPropId);
  }

  private threePointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointer || this.dragCanvas !== this.threeCanvas) return;
    const point = this.threeLocalPoint(event);
    if (point) this.moveSelectedTo(point, true);
  }

  private threePointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointer || this.dragCanvas !== this.threeCanvas) return;
    this.dragPointer = -1;
    this.dragCanvas = null;
    this.save('PBR 화면에서 옮긴 소품 위치를 로컬 저장했습니다.');
  }

  private hitProp(point: NumericPoint): ApartmentInteriorProp | undefined {
    return [...this.props].reverse().find((prop) => {
      const position = prop.positionMeters;
      if (!Array.isArray(position)) return false;
      const asset = this.assets.find((candidate) => candidate.assetId === prop.assetId);
      const size = dimensions(prop, asset);
      const angle = -finite(prop.yawDeg) * Math.PI / 180;
      const dx = point[0] - finite(position[0]);
      const dy = point[1] - finite(position[1]);
      const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
      const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
      return Math.abs(localX) <= Math.max(.25, size[0] / 2)
        && Math.abs(localY) <= Math.max(.25, size[1] / 2);
    });
  }

  private duplicateProp(source: ApartmentInteriorProp): ApartmentInteriorProp {
    const position = Array.isArray(source.positionMeters) ? source.positionMeters : [0, 0];
    return {
      ...source,
      id: `local-${source.assetId}-${Date.now() + ++this.sequence}`,
      positionMeters: [finite(position[0]) + .1, finite(position[1]) + .1],
    };
  }

  private moveSelectedTo(rawPoint: NumericPoint, live = false): boolean {
    const prop = this.selectedProp();
    const floor = polygon(this.apartment?.geometry?.floorPolygon);
    const point = rawPoint.map((value) => Math.round(value * 20) / 20) as NumericPoint;
    if (!prop || (floor.length >= 3 && !this.fitsFloor(prop, point, floor))) return false;
    prop.positionMeters = point;
    this.updateInspector();
    this.drawPlan();
    if (live) this.renderer?.setEditorProps(this.props);
    return true;
  }

  private editorWheel(event: WheelEvent): void {
    if (!event.shiftKey || !this.selectedProp()) return;
    event.preventDefault();
    this.rotate(event.deltaY < 0 ? -90 : 90);
  }

  private editorKeyDown(event: KeyboardEvent): void {
    if (!this.selectedProp() || event.target instanceof HTMLInputElement) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteSelected();
      return;
    }
    if (event.key.toLowerCase() === 'x') {
      event.preventDefault();
      this.mirror();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.duplicateSelected();
      return;
    }
    const vector: Record<string, NumericPoint> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
    };
    const delta = vector[event.key];
    if (!delta) return;
    event.preventDefault();
    const prop = this.selectedProp();
    const position = prop?.positionMeters || [0, 0];
    const step = event.altKey ? .01 : event.ctrlKey ? .25 : .05;
    if (this.moveSelectedTo([finite(position[0]) + delta[0] * step, finite(position[1]) + delta[1] * step])) {
      this.save(`소품을 ${step.toFixed(2)}m 이동해 저장했습니다.`);
    }
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

  private resizeSelected(delta: number): void {
    const prop = this.selectedProp();
    if (!prop) return;
    const asset = this.assets.find((candidate) => candidate.assetId === prop.assetId);
    const size = dimensions(prop, asset);
    prop.dimensionsMeters = [
      Math.max(.15, Math.round((size[0] + delta) * 20) / 20),
      Math.max(.15, Math.round((size[1] + delta) * 20) / 20),
      size[2],
    ];
    this.save(`가구 폭·깊이를 ${delta > 0 ? '확대' : '축소'}해 저장했습니다.`);
  }

  private duplicateSelected(): void {
    const prop = this.selectedProp();
    if (!prop) return;
    const copy = this.duplicateProp(prop);
    const floor = polygon(this.apartment?.geometry?.floorPolygon);
    const position = copy.positionMeters as NumericPoint;
    if (floor.length >= 3 && !this.fitsFloor(copy, position, floor)) copy.positionMeters = [...(prop.positionMeters || [0, 0])];
    this.props.push(copy);
    this.selectedPropId = String(copy.id);
    this.save('선택 소품을 복제해 로컬 저장했습니다.');
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
    this.renderer?.setEditorSelection(this.selectedPropId);
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
