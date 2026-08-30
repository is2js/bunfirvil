import { apartmentUnitWorldPoint, type NumericPoint } from './game/apartment-transform';
import { applyPlanVariant, transformPlanPoint, type ApartmentPlanVariant } from './game/plan-variants';
import type { ThreeWorldRenderer } from './game/three-world';
import type { StaticMapEntry, WorldData, WorldObject } from './game/types';
import { loadWorld } from './game/world';
import { loadCatalog } from './manage/catalog';
import { loadReview } from './manage/review-store';
import type { ShowcaseCatalogV1 } from './manage/types';

interface StructureItem {
  key: string;
  type: string;
  label: string;
  value: Record<string, unknown>;
}

interface BuildingReviewV1 {
  schemaVersion: 1;
  mapId: string;
  variant: ApartmentPlanVariant;
  status: 'unreviewed' | 'pass' | 'needs-work';
  notes: string;
  selectedStructureKey: string;
  updatedAt: string;
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLElement)) throw new Error(`#${id} 요소를 찾을 수 없습니다.`);
  return node as T;
}

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function points(value: unknown): NumericPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point): NumericPoint[] => Array.isArray(point) && point.length >= 2
    ? [[finite(point[0]), finite(point[1])]] : []);
}

function rowPolygon(value: Record<string, unknown>): NumericPoint[] {
  const direct = points(value.footprintPolygonMeters || value.polygon);
  if (direct.length >= 3) return direct;
  const bounds = Array.isArray(value.boundsMeters) ? value.boundsMeters.map((item) => finite(item)) : [];
  return bounds.length === 4
    ? [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]]]
    : [];
}

function structureStorageKey(mapId: string, variant: string): string {
  return `bunfirvil:building-admin:v1:${mapId}:${variant}`;
}

function defaultReview(mapId: string, variant: ApartmentPlanVariant): BuildingReviewV1 {
  return { schemaVersion: 1, mapId, variant, status: 'unreviewed', notes: '', selectedStructureKey: 'floor:0', updatedAt: new Date(0).toISOString() };
}

class BuildingAdmin {
  private catalog!: ShowcaseCatalogV1;
  private world: WorldData | null = null;
  private apartment: WorldObject | null = null;
  private items: StructureItem[] = [];
  private selectedKey = 'floor:0';
  private renderer: ThreeWorldRenderer | null = null;
  private frame = 0;
  private loadToken = 0;
  private view = { minX: 0, minY: 0, maxX: 1, maxY: 1, scale: 1, offsetX: 0, offsetY: 0 };

  private readonly mapSelect = element<HTMLSelectElement>('buildingMapSelect');
  private readonly variantSelect = element<HTMLSelectElement>('buildingPlanVariant');
  private readonly planCanvas = element<HTMLCanvasElement>('buildingPlanCanvas');
  private readonly threeCanvas = element<HTMLCanvasElement>('buildingThreeCanvas');
  private readonly tree = element<HTMLElement>('buildingTree');
  private readonly inspector = element<HTMLElement>('buildingInspector');
  private readonly status = element<HTMLElement>('buildingStatus');
  private readonly reviewStatus = element<HTMLSelectElement>('buildingReviewStatus');
  private readonly notes = element<HTMLTextAreaElement>('buildingNotes');
  private readonly importFile = element<HTMLInputElement>('buildingImportFile');

  async initialize(): Promise<void> {
    this.catalog = await loadCatalog();
    this.mapSelect.innerHTML = this.catalog.maps.map((map) => `<option value="${map.id}">${map.unitType} · ${map.label}</option>`).join('');
    this.bind();
    try {
      const module = await import('./game/three-world');
      this.renderer = new module.ThreeWorldRenderer(this.threeCanvas, this.catalog.renderAssets);
    } catch (error) {
      this.threeCanvas.hidden = true;
      this.status.textContent = `WebGL을 열 수 없어 평면도 검수만 제공합니다. ${error instanceof Error ? error.message : ''}`;
    }
    await this.selectMap(this.catalog.maps[0]?.id || '');
    this.frame = requestAnimationFrame(this.renderFrame);
  }

  private bind(): void {
    this.mapSelect.addEventListener('change', () => void this.selectMap(this.mapSelect.value));
    this.variantSelect.addEventListener('change', () => void this.selectMap(this.mapSelect.value));
    this.reviewStatus.addEventListener('change', () => this.saveReview());
    this.notes.addEventListener('input', () => this.saveReview(false));
    element<HTMLButtonElement>('buildingExport').addEventListener('click', () => this.exportReview());
    element<HTMLButtonElement>('buildingReset').addEventListener('click', () => this.resetReview());
    this.importFile.addEventListener('change', () => void this.importReview());
    window.addEventListener('resize', () => this.drawPlan());
  }

  private async selectMap(mapId: string): Promise<void> {
    const map = this.catalog.maps.find((entry) => entry.id === mapId);
    if (!map) return;
    const token = ++this.loadToken;
    this.status.textContent = `${map.unitType} 건축물 구조를 불러오는 중…`;
    const world = await loadWorld(map as unknown as StaticMapEntry);
    if (token !== this.loadToken) return;
    const variant = (this.variantSelect.value === 'B' ? 'B' : 'A') as ApartmentPlanVariant;
    const plan = applyPlanVariant(world, variant);
    this.world = world;
    this.apartment = world.objects.find((object) => object.type === 'enterable-apartment-unit-v1' && object.geometry) || null;
    this.items = this.collectItems();
    this.mapSelect.value = map.id;
    this.restoreReview();
    this.renderTree();
    this.updateInspector();
    this.drawPlan();
    this.renderer?.setWorld(world);
    this.renderer?.setSelectedOptions(loadReview(map.id, this.catalog).review.selectedOptionIds);
    this.focusApartment();
    this.planCanvas.dataset.structureCount = String(this.items.length);
    this.threeCanvas.dataset.structureCount = String(this.items.length);
    this.status.textContent = `${map.unitType} ${plan.label} · ${this.items.length}개 구조 요소 · 원본과 같은 meter/cell 변환`;
  }

  private collectItems(): StructureItem[] {
    const geometry = this.apartment?.geometry;
    if (!geometry) return [];
    const result: StructureItem[] = [{ key: 'floor:0', type: 'floor', label: '세대 바닥 경계', value: { floorPolygon: geometry.floorPolygon } }];
    const groups: Array<[string, string, unknown[] | undefined]> = [
      ['room', '공간', geometry.roomZones], ['wall', '벽체', geometry.wallSegments], ['opening', '문·창호', geometry.openings],
      ['block', '구조 블록', geometry.solidBlocks], ['fixture', '주방 구조', geometry.kitchenFixtures],
    ];
    for (const [type, fallback, rows] of groups) {
      (rows || []).forEach((raw, index) => {
        const row = raw as Record<string, unknown>;
        result.push({ key: `${type}:${index}`, type, label: String(row.labelKo || row.label || row.id || `${fallback} ${index + 1}`), value: row });
      });
    }
    return result;
  }

  private renderTree(): void {
    const groups = new Map<string, StructureItem[]>();
    this.items.forEach((item) => groups.set(item.type, [...(groups.get(item.type) || []), item]));
    const labels: Record<string, string> = { floor: '평면', room: '공간', wall: '벽체', opening: '문·창호', block: '구조 블록', fixture: '주방 구조' };
    this.tree.innerHTML = '';
    groups.forEach((items, type) => {
      const section = document.createElement('section');
      section.innerHTML = `<h3><span>${labels[type] || type}</span><em>${items.length}</em></h3>`;
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.structureKey = item.key; button.classList.toggle('is-active', item.key === this.selectedKey);
        button.innerHTML = `<i>${item.type.slice(0, 1).toUpperCase()}</i><span>${item.label}</span><small>${item.key}</small>`;
        button.addEventListener('click', () => this.selectItem(item.key));
        section.append(button);
      }
      this.tree.append(section);
    });
  }

  private selectItem(key: string): void {
    this.selectedKey = key;
    this.tree.querySelectorAll<HTMLElement>('[data-structure-key]').forEach((node) => node.classList.toggle('is-active', node.dataset.structureKey === key));
    this.updateInspector(); this.drawPlan(); this.saveReview(false);
  }

  private updateInspector(): void {
    const item = this.items.find((candidate) => candidate.key === this.selectedKey) || this.items[0];
    if (!item) { this.inspector.textContent = '구조 요소가 없습니다.'; return; }
    this.selectedKey = item.key;
    const safeValue = JSON.stringify(item.value, null, 2);
    this.inspector.innerHTML = `<div class="structure-selection-card"><span>${item.type.toUpperCase()}</span><b>${item.label}</b><small>${item.key}</small></div><dl><div><dt>평면형</dt><dd>${this.variantSelect.value}형</dd></div><div><dt>좌표계</dt><dd>LOCAL METER</dd></div></dl><pre>${safeValue.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
  }

  private drawPlan(): void {
    const context = this.resizePlan();
    const apartment = this.apartment;
    if (!context || !apartment) return;
    const rect = this.planCanvas.getBoundingClientRect();
    const floor = points(apartment.geometry?.floorPolygon).map((point) => transformPlanPoint(point, apartment.transform));
    if (floor.length < 3) return;
    const padding = 38;
    this.view = {
      minX: Math.min(...floor.map(([x]) => x)), minY: Math.min(...floor.map(([, y]) => y)),
      maxX: Math.max(...floor.map(([x]) => x)), maxY: Math.max(...floor.map(([, y]) => y)), scale: 1, offsetX: 0, offsetY: 0,
    };
    this.view.scale = Math.max(1, Math.min((rect.width - padding * 2) / Math.max(.1, this.view.maxX - this.view.minX), (rect.height - padding * 2) / Math.max(.1, this.view.maxY - this.view.minY)));
    this.view.offsetX = (rect.width - (this.view.maxX - this.view.minX) * this.view.scale) / 2;
    this.view.offsetY = (rect.height - (this.view.maxY - this.view.minY) * this.view.scale) / 2;
    context.fillStyle = '#111615'; context.fillRect(0, 0, rect.width, rect.height);
    context.strokeStyle = 'rgba(156, 194, 181, .08)'; context.lineWidth = 1;
    for (let x = Math.floor(this.view.minX); x <= this.view.maxX; x += .5) {
      const a = this.toCanvas([x, this.view.minY]); const b = this.toCanvas([x, this.view.maxY]);
      context.beginPath(); context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]); context.stroke();
    }
    for (let y = Math.floor(this.view.minY); y <= this.view.maxY; y += .5) {
      const a = this.toCanvas([this.view.minX, y]); const b = this.toCanvas([this.view.maxX, y]);
      context.beginPath(); context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]); context.stroke();
    }
    this.fillPolygon(context, points(apartment.geometry?.floorPolygon), '#c9bfb0', '#f0e6d7', 2);
    (apartment.geometry?.roomZones || []).forEach((raw, index) => this.fillPolygon(context, rowPolygon(raw as Record<string, unknown>), this.selectedKey === `room:${index}` ? 'rgba(87, 218, 183, .28)' : 'rgba(72, 105, 96, .1)', 'rgba(67, 98, 90, .35)', 1));
    (apartment.geometry?.solidBlocks || []).forEach((raw, index) => this.fillPolygon(context, rowPolygon(raw as Record<string, unknown>), this.selectedKey === `block:${index}` ? '#dca75e' : '#8b857b', '#47443f', 1));
    (apartment.geometry?.kitchenFixtures || []).forEach((raw, index) => this.fillPolygon(context, rowPolygon(raw as Record<string, unknown>), this.selectedKey === `fixture:${index}` ? '#dfa867' : '#aaa297', '#575149', 1));
    (apartment.geometry?.wallSegments || []).forEach((raw, index) => this.drawSegment(context, raw as Record<string, unknown>, this.selectedKey === `wall:${index}`, false));
    (apartment.geometry?.openings || []).forEach((raw, index) => this.drawSegment(context, raw as Record<string, unknown>, this.selectedKey === `opening:${index}`, true));
    this.planCanvas.dataset.planReady = 'true';
  }

  private drawSegment(context: CanvasRenderingContext2D, row: Record<string, unknown>, selected: boolean, opening: boolean): void {
    const segment = points([row.a, row.b]);
    if (segment.length !== 2) return;
    const a = this.toCanvas(transformPlanPoint(segment[0], this.apartment?.transform));
    const b = this.toCanvas(transformPlanPoint(segment[1], this.apartment?.transform));
    context.beginPath(); context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]);
    context.strokeStyle = selected ? '#70e8b0' : opening ? '#77bcdc' : '#383936';
    context.lineWidth = selected ? 5 : opening ? 3 : Math.max(2, finite(row.thicknessMeters, .12) * this.view.scale);
    context.stroke();
  }

  private fillPolygon(context: CanvasRenderingContext2D, area: NumericPoint[], fill: string, stroke: string, width: number): void {
    if (area.length < 3) return;
    context.beginPath();
    area.map((point) => transformPlanPoint(point, this.apartment?.transform)).forEach((point, index) => {
      const value = this.toCanvas(point); if (index === 0) context.moveTo(value[0], value[1]); else context.lineTo(value[0], value[1]);
    });
    context.closePath(); context.fillStyle = fill; context.fill(); context.strokeStyle = stroke; context.lineWidth = width; context.stroke();
  }

  private toCanvas(point: NumericPoint): NumericPoint {
    return [this.view.offsetX + (point[0] - this.view.minX) * this.view.scale, this.view.offsetY + (point[1] - this.view.minY) * this.view.scale];
  }

  private resizePlan(): CanvasRenderingContext2D | null {
    const context = this.planCanvas.getContext('2d'); if (!context) return null;
    const rect = this.planCanvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.planCanvas.width = Math.max(1, Math.round(rect.width * dpr)); this.planCanvas.height = Math.max(1, Math.round(rect.height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0); return context;
  }

  private focusApartment(): void {
    const apartment = this.apartment; if (!apartment || !this.renderer) return;
    const floor = points(apartment.geometry?.floorPolygon); if (!floor.length) return;
    const center = apartmentUnitWorldPoint(apartment, [floor.reduce((sum, [x]) => sum + x, 0) / floor.length, floor.reduce((sum, [, y]) => sum + y, 0) / floor.length]);
    this.renderer.focusAt(center.x, center.y);
  }

  private readonly renderFrame = (time: number): void => {
    this.renderer?.render(time); this.frame = requestAnimationFrame(this.renderFrame);
  };

  private restoreReview(): void {
    const mapId = this.mapSelect.value; const variant = this.variantSelect.value as ApartmentPlanVariant;
    let review = defaultReview(mapId, variant);
    try {
      const parsed = JSON.parse(localStorage.getItem(structureStorageKey(mapId, variant)) || 'null') as Partial<BuildingReviewV1> | null;
      if (parsed?.schemaVersion === 1 && parsed.mapId === mapId && parsed.variant === variant) review = { ...review, ...parsed };
    } catch { /* 손상된 로컬 초안은 기본값으로 대체한다. */ }
    this.reviewStatus.value = review.status; this.notes.value = review.notes;
    this.selectedKey = this.items.some((item) => item.key === review.selectedStructureKey) ? review.selectedStructureKey : 'floor:0';
  }

  private currentReview(): BuildingReviewV1 {
    return { schemaVersion: 1, mapId: this.mapSelect.value, variant: this.variantSelect.value as ApartmentPlanVariant, status: this.reviewStatus.value as BuildingReviewV1['status'], notes: this.notes.value, selectedStructureKey: this.selectedKey, updatedAt: new Date().toISOString() };
  }

  private saveReview(announce = true): void {
    const review = this.currentReview(); localStorage.setItem(structureStorageKey(review.mapId, review.variant), JSON.stringify(review));
    if (announce) this.status.textContent = `${review.mapId} ${review.variant}형 건축 검수정보를 이 브라우저에 저장했습니다.`;
  }

  private exportReview(): void {
    const review = this.currentReview(); const url = URL.createObjectURL(new Blob([`${JSON.stringify(review, null, 2)}\n`], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `bunfirvil-building-${review.mapId}-${review.variant}.json`; anchor.click(); URL.revokeObjectURL(url);
  }

  private async importReview(): Promise<void> {
    const file = this.importFile.files?.[0]; this.importFile.value = ''; if (!file || file.size > 1_000_000) return;
    try {
      const value = JSON.parse(await file.text()) as BuildingReviewV1;
      const validStatus = ['unreviewed', 'pass', 'needs-work'].includes(value.status);
      if (value.schemaVersion !== 1 || value.mapId !== this.mapSelect.value || value.variant !== this.variantSelect.value || !validStatus || typeof value.notes !== 'string') throw new Error('현재 맵·평면형과 일치하는 BuildingReviewV1이 아닙니다.');
      localStorage.setItem(structureStorageKey(value.mapId, value.variant), JSON.stringify(value)); this.restoreReview(); this.renderTree(); this.updateInspector(); this.drawPlan();
      this.status.textContent = '건축 검수 JSON을 가져왔습니다.';
    } catch (error) { this.status.textContent = `가져오기 실패 · ${error instanceof Error ? error.message : '잘못된 JSON'}`; }
  }

  private resetReview(): void {
    localStorage.removeItem(structureStorageKey(this.mapSelect.value, this.variantSelect.value)); this.restoreReview(); this.renderTree(); this.updateInspector(); this.drawPlan(); this.status.textContent = '현재 평면형의 로컬 건축 검수정보를 초기화했습니다.';
  }
}

void new BuildingAdmin().initialize().catch((error) => {
  element('buildingStatus').textContent = error instanceof Error ? error.message : '건축물 관리자 초기화에 실패했습니다.';
});
