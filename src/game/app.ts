import { escapeHtml, formatBytes, resolveProjectUrl, resolveReferencedUrl } from './base';
import { loadCatalog, mapFromQuery } from './catalog';
import { cameraZoomPercent, RPG_CAMERA_BASE_ZOOM } from './camera';
import { ManifestEffectPlayer } from './effect-player';
import { readHotbar, reorderHotbar, writeHotbar } from './hotbar';
import { interpolateCellTravel, screenDirection, screenVectorToWorldDelta } from './grid';
import { FrameMetrics } from './metrics';
import { FloorPlanMinimap } from './floorplan-minimap';
import { snapFurnitureToNearestWall } from './interior-wall-snap';
import {
  validateInteriorPlacement,
  type InteriorPlacementValidation,
} from './interior-placement';
import {
  measureIstarparkLaserGap,
  type InspectionLaserAxis,
  type InspectionLaserMeasurement,
} from './istarpark-laser-measurement';
import {
  applyPlanVariant,
  planVariantDefinition,
  planVariantFromQuery,
  type ApartmentPlanVariant,
  type ApartmentPlanVariantDefinition,
} from './plan-variants';
import {
  apartmentUnitWorldPoint,
  apartmentWorldPointToLocalMeters,
  type NumericPoint,
} from './apartment-transform';
import {
  createLocalProp,
  readLayout,
  writeLayout,
  type InteriorAssetEntry,
  type LocalInteriorLayoutV1,
} from '../manage/interior-layout';
import {
  applyOptionToggle,
  adjustSystemAcSelection,
  calculateOptionPrice,
  compatibleOptions,
  readSelectedOptions,
  systemAcChoice,
  systemAcChoices,
  type SystemAcTier,
  writeSelectedOptions,
} from './options';
import { ActorView } from './sprite';
import type { ThreeWorldRenderer as ThreeWorldRendererInstance } from './three-world';
import type {
  ActorState,
  BOptionEntry,
  CharacterKey,
  Direction,
  HotbarValue,
  ShowcaseCatalog,
  StaticCharacterEntry,
  StaticMapEntry,
  StaticSkillEntry,
  ApartmentInteriorProp,
  WorldData,
  WorldObject,
} from './types';
import { IsometricWorldRenderer, canTraverse, isWalkable, livingRoomSpawnCells, loadWorld, nearestWalkable } from './world';

const numberFormat = new Intl.NumberFormat('ko-KR');
// 원본 RPG의 기본 walk/movement duration과 동일한 한 cell cadence.
const MOVEMENT_INTERVAL_MS = 420;
const TURN_ONLY_HOLD_TO_MOVE_MS = 96;
const CHARACTER_DISPLAY_NAMES: Record<CharacterKey, string> = {
  '100': '돌범',
  '200': '피치',
};

interface WorldRendererPort {
  setWorld(world: WorldData): void;
  setSelectedOptions(optionIds: string[]): void;
  follow(target: ActorState, smoothing?: number): void;
  panByScreenDelta(deltaX: number, deltaY: number): void;
  project(x: number, y: number): { x: number; y: number };
  unproject(x: number, y: number): { x: number; y: number } | null;
  render(time: number): void;
}

interface DemoSkill {
  id: string;
  label: string;
  description: string;
  iconUrl: string;
  cooldownMs: number;
  manaCost: number;
  glyph: string;
}

const BASIC_ATTACK: DemoSkill = {
  id: 'basic-attack',
  label: '기본 공격',
  description: '선택한 캐릭터의 기본 공격 모션을 재생합니다.',
  iconUrl: '',
  cooldownMs: 620,
  manaCost: 0,
  glyph: '斬',
};

const SKILL_GLYPHS: Record<string, string> = {
  'basic-attack': '斬',
  'warrior-shock-stun': '✦',
  'common-double-arrow': '➹',
  'common-teleport': '⌁',
};

function isFormTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function mapLabelShort(map: StaticMapEntry): string {
  return map.unitType || map.label.match(/\d+[A-Z]?/i)?.[0] || map.label;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function apartmentFloor(object: WorldObject | null): NumericPoint[] {
  const source = object?.geometry?.floorPolygon;
  if (!Array.isArray(source)) return [];
  return source.flatMap((point): NumericPoint[] => Array.isArray(point) && point.length >= 2
    ? [[finiteNumber(point[0]), finiteNumber(point[1])]] : []);
}

function pointInside(point: NumericPoint, polygon: NumericPoint[]): boolean {
  if (polygon.length < 3) return true;
  let inside = false;
  let previous = polygon[polygon.length - 1];
  for (const current of polygon) {
    if ((current[1] > point[1]) !== (previous[1] > point[1])) {
      const crossing = (previous[0] - current[0]) * (point[1] - current[1]) / ((previous[1] - current[1]) || 1e-9) + current[0];
      if (point[0] < crossing) inside = !inside;
    }
    previous = current;
  }
  return inside;
}

function interiorDimensions(prop: ApartmentInteriorProp, asset?: InteriorAssetEntry): [number, number] {
  const source = prop.dimensionsMeters || asset?.defaultDimensionsMeters;
  if (Array.isArray(source)) return [finiteNumber(source[0], .8), finiteNumber(source[1], .8)];
  const value = source && typeof source === 'object' ? source : {};
  return [finiteNumber((value as { width?: number }).width, .8), finiteNumber((value as { depth?: number }).depth, .8)];
}

export class ShowcaseApp {
  private catalog!: ShowcaseCatalog;
  private currentMap!: StaticMapEntry;
  private world: WorldData | null = null;
  private renderer!: WorldRendererPort;
  private canvasRenderer!: IsometricWorldRenderer;
  private threeRenderer: ThreeWorldRendererInstance | null = null;
  private effectPlayer!: ManifestEffectPlayer;
  private hotbar: HotbarValue[] = [];
  private activeActor: CharacterKey = '100';
  private readonly actors = new Map<CharacterKey, ActorState>();
  private readonly actorViews = new Map<CharacterKey, ActorView>();
  private readonly pressedKeys = new Set<string>();
  private readonly cooldowns = new Map<string, number>();
  private readonly frameMetrics = new FrameMetrics();
  private minimap!: FloorPlanMinimap;
  private readonly abortController = new AbortController();
  private selectedOptionIds: string[] = [];
  private cursorScreenPoint: { x: number; y: number } | null = null;
  private optionCategory = '전체';
  private paletteTab: 'options' | 'furniture' = 'options';
  private paletteAppliedOnly = false;
  private interiorAssets: InteriorAssetEntry[] = [];
  private interiorCatalogUrl = '';
  private localInteriorProps: ApartmentInteriorProp[] = [];
  private selectedLocalPropId = '';
  private selectedScenePropSnapshot: ApartmentInteriorProp | null = null;
  private pendingInteriorAssetId = '';
  private furnitureContextMenuOpen = false;
  private furnitureWallSnapEnabled = false;
  private interiorDragPointer = -1;
  private interiorDragMoved = false;
  private interiorRelocationArmed = false;
  private interiorGhostProp: ApartmentInteriorProp | null = null;
  private interiorGhostMode: 'add' | 'move' | null = null;
  private interiorGhostValidation: InteriorPlacementValidation | null = null;
  private lastInteriorPointerPoint: NumericPoint | null = null;
  private mapPanPointer = -1;
  private mapPanLastX = 0;
  private mapPanLastY = 0;
  private mapPanMoved = false;
  private cameraTrackingPaused = false;
  private animationFrame = 0;
  private lastMetricPaint = 0;
  private assetCount = 0;
  private mapLoadToken = 0;
  private planVariant: ApartmentPlanVariant = 'A';
  private readonly inspectionLaser = {
    active: false,
    axis: 'x' as InspectionLaserAxis,
    lastScreenPoint: null as { x: number; y: number } | null,
    measurement: null as InspectionLaserMeasurement | null,
    frameRequest: 0,
    wheelDelta: 0,
    wheelLatched: false,
    wheelResetTimer: 0,
  };
  private destroyed = false;

  constructor(private readonly mount: HTMLElement) {}

  async start(): Promise<void> {
    const { catalog, fallback } = await loadCatalog();
    this.catalog = catalog;
    this.currentMap = mapFromQuery(catalog, window.location.search);
    this.planVariant = planVariantFromQuery(window.location.search);
    const requestedActor = new URLSearchParams(window.location.search).get('actor');
    if (requestedActor === '200') this.activeActor = '200';
    this.hotbar = readHotbar(catalog.defaultHotbar);

    this.renderShell(fallback);
    this.get<HTMLElement>('#game-stage').dataset.movementIntervalMs = String(MOVEMENT_INTERVAL_MS);
    this.get<HTMLElement>('#game-stage').dataset.cellProjection = '32x24';
    this.get<HTMLElement>('#game-stage').dataset.cameraTracking = 'follow';
    this.canvasRenderer = new IsometricWorldRenderer(this.get<HTMLCanvasElement>('#world-canvas'));
    this.minimap = new FloorPlanMinimap(
      this.get<HTMLCanvasElement>('#floorplan-minimap'),
      this.get<HTMLElement>('#minimap-map-label'),
    );
    this.renderer = this.canvasRenderer;
    this.effectPlayer = new ManifestEffectPlayer(this.get<HTMLElement>('#effect-layer'), () => this.trackAsset());
    try {
      const { ThreeWorldRenderer } = await import('./three-world');
      this.threeRenderer = new ThreeWorldRenderer(
        this.get<HTMLCanvasElement>('#three-world-canvas'),
        this.catalog.renderAssets,
        () => this.trackAsset(),
      );
    } catch (error) {
      console.warn('[bunfirvil] WebGL unavailable; Canvas2D renderer stays active.', error);
      this.threeRenderer = null;
    }
    await this.loadInteriorAssets();
    this.createActors();
    this.bindEvents();
    this.renderHotbar();

    await Promise.all([...this.actorViews.values()].map((view) => view.load(() => this.trackAsset())));
    await this.selectMap(this.currentMap.id, false);

    this.animationFrame = requestAnimationFrame(this.tick);
    this.toast(fallback ? '생성 자산 대기 중 · 안전한 프리뷰 모드로 실행합니다.' : '정적 자산 스냅샷을 불러왔습니다.', fallback ? 'notice' : 'success');
  }

  destroy(): void {
    this.destroyed = true;
    this.stopInspectionLaser('destroy');
    this.cancelInteriorGhost('', false);
    this.abortController.abort();
    cancelAnimationFrame(this.animationFrame);
    this.effectPlayer?.destroy();
    this.threeRenderer?.dispose();
  }

  private get<T extends Element>(selector: string): T {
    const element = this.mount.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }

  private async loadInteriorAssets(): Promise<void> {
    const catalogPath = this.catalog.renderAssets?.interiorCatalogUrl;
    if (!catalogPath) return;
    this.interiorCatalogUrl = resolveProjectUrl(catalogPath);
    try {
      const response = await fetch(this.interiorCatalogUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { assets?: InteriorAssetEntry[] };
      this.interiorAssets = (payload.assets || []).filter((asset) =>
        asset.assetId && asset.displayNameKo && asset.category !== 'notice' && asset.mountingKind !== 'room-finish');
      this.renderFurniturePalette();
    } catch (error) {
      console.warn('[bunfirvil] furniture palette unavailable.', error);
      this.interiorAssets = [];
      this.renderFurniturePalette();
    }
  }

  private renderShell(fallback: boolean): void {
    const mapOptions = this.catalog.maps
      .map(
        (map) => `<option value="${escapeHtml(map.id)}" ${map.id === this.currentMap.id ? 'selected' : ''}>${escapeHtml(map.unitType)} · ${escapeHtml(map.label)}</option>`,
      )
      .join('');
    const mapTabs = this.catalog.maps
      .map(
        (map) => `<button type="button" class="map-tab ${map.id === this.currentMap.id ? 'is-active' : ''}" data-map-id="${escapeHtml(map.id)}"><b>${escapeHtml(mapLabelShort(map))}</b><small>${escapeHtml(map.revision)}</small></button>`,
      )
      .join('');

    this.mount.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <a class="brand" href="${resolveProjectUrl('')}" aria-label="Bunfirvil 렌더 랩 홈">
            <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
            <span><b>BUNFIRVIL</b><small>RPG RENDERING LAB</small></span>
          </a>
          <nav class="topnav" aria-label="주요 메뉴">
            <a class="is-active" href="${resolveProjectUrl('')}"><span>LIVE</span> 렌더 쇼케이스</a>
            <a href="${resolveProjectUrl('manage/')}">검수맵 관리</a>
            <a href="${resolveProjectUrl('building-admin/')}">건축물 관리</a>
            <a href="${resolveProjectUrl('interior-admin/')}">인테리어 관리</a>
            <a href="${resolveProjectUrl('guides/')}">가이드</a>
          </nav>
          <div class="build-chip" title="현재 정적 자산 스냅샷">
            <span class="status-dot ${fallback ? 'is-amber' : ''}"></span>
            <span><small>STATIC BUILD</small><b>${escapeHtml(this.catalog.exportId)}</b></span>
          </div>
        </header>

        <div class="serverless-banner" role="status">
          <span class="banner-pulse" aria-hidden="true"></span>
          <b>프론트엔드 로컬 데모</b>
          <span>서버 판정 없음</span>
          <i></i>
          <span>데이터는 이 브라우저에만 저장됩니다.</span>
        </div>

        <main class="showcase-layout">
          <section class="play-column" aria-label="RPG 렌더링 쇼케이스">
            <div class="control-deck">
              <label class="select-field">
                <span>INSPECTION MAP</span>
                <select id="map-select" aria-label="검수맵 선택">${mapOptions}</select>
              </label>
              <div class="plan-variant-switch" role="group" aria-label="평면 A B형 선택">
                <span>PLAN TYPE</span>
                <div>
                  <button type="button" data-plan-variant="A" class="${this.planVariant === 'A' ? 'is-active' : ''}">A형</button>
                  <button type="button" data-plan-variant="B" class="${this.planVariant === 'B' ? 'is-active' : ''}">B형</button>
                </div>
              </div>
              <div class="actor-switch" role="group" aria-label="조작 캐릭터">
                <span>캐릭터</span>
                <div>
                  <button type="button" data-actor-key="100" class="${this.activeActor === '100' ? 'is-active' : ''}"><i class="actor-dot actor-dot--100"></i>돌범</button>
                  <button type="button" data-actor-key="200" class="${this.activeActor === '200' ? 'is-active' : ''}"><i class="actor-dot actor-dot--200"></i>피치</button>
                </div>
              </div>
              <div class="deck-actions">
                <button type="button" id="reset-position" class="icon-button" title="스폰 위치로 돌아가기" aria-label="스폰 위치로 돌아가기">↺</button>
                <button type="button" id="open-help" class="icon-button" title="조작 도움말" aria-label="조작 도움말">?</button>
              </div>
            </div>

            <div class="map-tabs" role="tablist" aria-label="빠른 맵 선택">${mapTabs}</div>

            <div class="game-stage" id="game-stage">
              <canvas id="world-canvas" aria-label="Canvas2D 등각 투영 검수맵"></canvas>
              <canvas id="three-world-canvas" aria-label="Three.js PBR 검수맵" hidden></canvas>
              <div class="stage-scanlines" aria-hidden="true"></div>
              <div id="actor-layer" class="actor-layer"></div>
              <div id="effect-layer" class="effect-layer" aria-hidden="true"></div>

              <div class="map-identity">
                <span id="map-unit">${escapeHtml(this.currentMap.unitType)}</span>
                <div><b id="map-title">${escapeHtml(this.currentMap.label)}</b><small id="map-revision">${escapeHtml(this.currentMap.revision)}</small></div>
                <em id="plan-variant-badge">${this.planVariant}형</em>
              </div>

              <aside class="floorplan-minimap" aria-label="현재 세대 평면도 미니맵">
                <div class="minimap-title"><span></span><b>FLOOR PLAN</b><em id="minimap-map-label">${escapeHtml(this.currentMap.unitType)} · ${this.planVariant}형</em></div>
                <canvas id="floorplan-minimap" aria-label="평면도와 캐릭터 현재 위치"></canvas>
                <div class="minimap-legend"><i></i><span>조작 캐릭터</span><small>LIVE</small></div>
                <dl class="runtime-metrics-source" aria-hidden="true">
                  <div><dt>FPS</dt><dd id="metric-fps">—</dd></div>
                  <div><dt>P95</dt><dd id="metric-p95">—</dd></div>
                  <div><dt>RENDER</dt><dd id="metric-renderer">CANVAS2D</dd></div>
                  <div><dt>CHUNKS</dt><dd id="metric-chunks">0/0</dd></div>
                  <div><dt>ASSETS</dt><dd id="metric-assets">0</dd></div>
                </dl>
              </aside>

              <div class="stage-zoom" aria-label="화면 확대 축소">
                <button type="button" id="zoom-out" aria-label="화면 축소">−</button>
                <button type="button" id="zoom-reset" aria-label="화면 확대 초기화"><span id="zoom-value">100%</span></button>
                <button type="button" id="zoom-in" aria-label="화면 확대">＋</button>
              </div>

              <button type="button" id="inspection-laser-toggle" class="istarpark-laser-toggle" aria-pressed="false" title="레이저 실측 시작 (J)" hidden>
                <span class="istarpark-laser-toggle-icon" aria-hidden="true">⌁</span>
                <span>레이저 실측</span>
                <kbd>J</kbd>
              </button>
              <div id="inspection-laser-hud" class="istarpark-laser-hud" aria-live="polite" hidden>
                <div class="istarpark-laser-hud-head"><strong>레이저 실측</strong><span id="inspection-laser-direction">북서 ↔ 남동</span></div>
                <output class="istarpark-laser-value" id="inspection-laser-value">— mm</output>
                <small id="inspection-laser-status">빈 공간을 가리키세요 · Shift+휠 방향 전환 · J/Esc 종료</small>
              </div>

              <div id="furniture-selection-toolbar" class="furniture-selection-toolbar" hidden>
                <b id="furniture-selection-name">선택 가구</b>
                <div>
                  <button type="button" data-screen-furniture-action="rotate-left" aria-label="화면 가구 왼쪽 90도 회전">↶</button>
                  <button type="button" data-screen-furniture-action="relocate" aria-label="가구 재배치">이동</button>
                  <button type="button" data-screen-furniture-action="rotate-right" aria-label="화면 가구 오른쪽 90도 회전">↷</button>
                  <button type="button" data-screen-furniture-action="snap" aria-label="가구 벽 자석">자석</button>
                  <button type="button" data-screen-furniture-action="delete" aria-label="화면 가구 제거">삭제</button>
                </div>
                <small>드래그 이동 · Shift+휠 회전 · Del 삭제</small>
              </div>

              <div class="stage-tip"><kbd>WASD</kbd><span>또는</span><kbd>방향키</kbd><b>이동</b><span>· 빈 화면 드래그</span></div>
              <div id="toast" class="game-toast" role="status" aria-live="polite"></div>
              <div id="stage-loader" class="stage-loader" aria-live="polite">
                <span class="loader-orbit"><i></i></span>
                <b>STATIC WORLD LOADING</b>
                <small>manifest와 chunk를 조합하고 있습니다</small>
              </div>

              <div class="stage-option-quote" aria-label="선택 B옵션과 합계">
                <div class="stage-option-title"><b>B</b><span>선택 옵션</span><em id="stage-option-count">0개</em></div>
                <div class="stage-option-chips" id="stage-option-chips"><span>기본 마감</span></div>
                <strong id="stage-option-total">0<small>원</small></strong>
              </div>

              <div class="combat-dock">
                <div class="active-actor-card">
                  <span class="portrait portrait--${this.activeActor}" id="active-portrait">${CHARACTER_DISPLAY_NAMES[this.activeActor]}</span>
                  <div><small>ACTIVE ACTOR</small><b id="active-actor-label">${CHARACTER_DISPLAY_NAMES[this.activeActor]}</b></div>
                  <span class="local-tag">LOCAL</span>
                </div>
                <div id="hotbar" class="hotbar" aria-label="로컬 스킬 핫바"></div>
              </div>
            </div>
          </section>

          <aside class="option-panel" aria-label="B 옵션 팔레트">
            <header class="option-header">
              <div>
                <p class="eyebrow">LOCAL INTERIOR PREVIEW</p>
                <h2><span>B</span> 옵션 팔레트</h2>
              </div>
              <div class="option-head-actions">
                <a class="option-guide-link" href="${resolveProjectUrl('guides/?guide=b-option')}">옵션 가이드</a>
                <span class="option-count" id="option-count">0</span>
              </div>
            </header>
            <div class="palette-tabs" role="tablist" aria-label="인테리어 도구">
              <button type="button" class="is-active" data-palette-tab="options">B 옵션</button>
              <button type="button" data-palette-tab="furniture">가구 배치</button>
            </div>
            <div class="palette-viewbar">
              <span id="palette-view-label">전체 B옵션</span>
              <button type="button" id="palette-applied-only" aria-pressed="false">적용만 보기</button>
            </div>
            <div id="option-palette-body">
              <div class="option-context">
                <span id="option-unit">${escapeHtml(this.currentMap.unitType)}</span>
                <div><b>세대 옵션 구성</b><small>선택 즉시 맵 프롭에 반영</small></div>
                <span class="saved-indicator"><i></i>로컬 저장</span>
              </div>
              <div id="option-categories" class="option-categories"></div>
              <div id="option-list" class="option-list"></div>
              <div class="option-summary">
                <div class="selected-option-chips" id="selected-option-chips"><span>기본 마감</span></div>
                <div class="quote-row">
                  <span><small>선택 옵션 합계</small><b id="option-selected-count">0개</b></span>
                  <strong id="option-total">0<small>원</small></strong>
                </div>
                <p>본 견적은 렌더 검수용 예시이며 실제 계약 금액이 아닙니다.</p>
              </div>
            </div>
            <div id="furniture-palette-body" hidden>
              <div class="furniture-context">
                <div><b>인게임 로컬 배치</b><small>카드 선택 → PBR 바닥 클릭 · 가구 드래그 이동</small></div>
                <span id="furniture-count">0개</span>
              </div>
              <input id="furniture-search" class="furniture-search" type="search" placeholder="가구·가전 검색" autocomplete="off" />
              <div class="furniture-actions">
                <button type="button" id="furniture-rotate-left">−90°</button>
                <button type="button" id="furniture-rotate-right">+90°</button>
                <button type="button" id="furniture-mirror">반전</button>
                <button type="button" id="furniture-delete">삭제</button>
              </div>
              <div id="furniture-list" class="furniture-list"></div>
              <p id="furniture-status" class="furniture-status">가구 카드를 선택한 뒤 PBR 맵 바닥을 누르세요.</p>
              <a class="furniture-manage-link" href="${resolveProjectUrl('manage/#interiorEditor')}">평면도 · PBR 상세 편집 열기 →</a>
            </div>
          </aside>
        </main>

        <footer class="app-footer">
          <span>© BUNFIRVIL STATIC SHOWCASE</span>
          <span>64×64 WORLD · 8-DIRECTION SPRITES · ZERO SERVER</span>
        </footer>
      </div>

      <dialog id="help-dialog" class="help-dialog">
        <form method="dialog">
          <button class="dialog-close" value="close" aria-label="닫기">×</button>
          <p class="eyebrow">CONTROL GUIDE</p>
          <h2>로컬 렌더 랩 조작법</h2>
          <div class="help-grid">
            <div><span class="help-icon">⌨</span><b>캐릭터 이동</b><p>WASD 또는 방향키로 8방향 이동합니다. 정적 chunk의 막힌 셀은 통과하지 않습니다.</p></div>
            <div><span class="help-icon">1–6</span><b>스킬 재생</b><p>1번 또는 휠 클릭은 현재 커서 위치로 텔레포트합니다. 2–4번은 전투 모션과 효과를 재생하며 5–6번은 빈 슬롯입니다.</p></div>
            <div><span class="help-icon">B</span><b>옵션 프리뷰</b><p>B팔레트 선택은 맵의 미리보기 프롭과 견적에 반영되고 이 브라우저에 저장됩니다.</p></div>
            <div><span class="help-icon">GHOST</span><b>가구 설치·이동</b><p>가구 목록을 누르거나 재배치를 시작하면 반투명 GHOST가 마우스를 따라갑니다. 초록은 설치 가능, 빨강은 벽·문·구조물·가구와 겹친 불가 위치입니다. 좌클릭으로 확정하고 우클릭 또는 Esc로 취소합니다.</p></div>
            <div><span class="help-icon">L</span><b>벽 자석·회전</b><p>GHOST 상태에서 L을 누르면 가까운 벽·코너 자석을 켜거나 끕니다. Shift+휠 또는 R로 90도 회전하며, 빈 맵은 손바닥 드래그와 휠로 이동·확대합니다.</p></div>
            <div><span class="help-icon">J</span><b>레이저 실측</b><p>J로 켜고 마우스를 빈 공간에 놓으면 130mm 높이의 양쪽 벽·설비·가구 사이 순수 폭을 mm로 표시합니다. Shift+휠로 측정 방향을 바꿉니다.</p></div>
          </div>
          <p class="dialog-note">이 사이트는 시각·성능 검수용입니다. 피해, 명중, MP, 사용자 인증과 공용 저장은 처리하지 않습니다.</p>
        </form>
      </dialog>
    `;
  }

  private createActors(): void {
    const entries = new Map(this.catalog.characters.map((entry) => [entry.key, entry]));
    const fallbackEntries: StaticCharacterEntry[] = [
      { key: '100', label: CHARACTER_DISPLAY_NAMES['100'], manifestUrl: 'generated/characters/100/animation.json' },
      { key: '200', label: CHARACTER_DISPLAY_NAMES['200'], manifestUrl: 'generated/characters/200/animation.json' },
    ];
    const layer = this.get<HTMLElement>('#actor-layer');
    for (const fallback of fallbackEntries) {
      const sourceEntry = entries.get(fallback.key) || fallback;
      const entry = { ...sourceEntry, label: CHARACTER_DISPLAY_NAMES[fallback.key] };
      const actor: ActorState = {
        key: entry.key,
        label: entry.label,
        x: this.currentMap.spawn.x,
        y: this.currentMap.spawn.y,
        direction: 's',
        motion: 'idle',
        motionUntil: 0,
        motionStartedAt: performance.now(),
        moving: false,
        displayX: this.currentMap.spawn.x,
        displayY: this.currentMap.spawn.y,
        turnReadyAt: 0,
        queuedDirection: null,
        travel: null,
      };
      const view = new ActorView(entry, (key) => this.setActiveActor(key));
      this.actors.set(entry.key, actor);
      this.actorViews.set(entry.key, view);
      layer.append(view.element);
    }
    this.setActiveActor(this.activeActor, false);
  }

  private bindEvents(): void {
    const signal = this.abortController.signal;
    this.get<HTMLSelectElement>('#map-select').addEventListener('change', (event) => {
      void this.selectMap((event.currentTarget as HTMLSelectElement).value);
    }, { signal });

    this.mount.querySelectorAll<HTMLButtonElement>('[data-map-id]').forEach((button) => {
      button.addEventListener('click', () => void this.selectMap(button.dataset.mapId || ''), { signal });
    });
    this.mount.querySelectorAll<HTMLButtonElement>('[data-plan-variant]').forEach((button) => {
      button.addEventListener('click', () => void this.selectPlanVariant(button.dataset.planVariant === 'B' ? 'B' : 'A'), { signal });
    });
    this.mount.querySelectorAll<HTMLButtonElement>('[data-actor-key]').forEach((button) => {
      button.addEventListener('click', () => this.setActiveActor(button.dataset.actorKey as CharacterKey), { signal });
    });
    this.mount.querySelectorAll<HTMLButtonElement>('[data-palette-tab]').forEach((button) => {
      button.addEventListener('click', () => this.setPaletteTab(button.dataset.paletteTab === 'furniture' ? 'furniture' : 'options'), { signal });
    });
    this.get<HTMLButtonElement>('#palette-applied-only').addEventListener('click', () => {
      this.paletteAppliedOnly = !this.paletteAppliedOnly;
      this.renderOptions();
      this.renderFurniturePalette();
    }, { signal });
    this.get<HTMLInputElement>('#furniture-search').addEventListener('input', () => this.renderFurniturePalette(), { signal });
    this.get<HTMLButtonElement>('#furniture-rotate-left').addEventListener('click', () => this.transformLocalProp('rotate-left'), { signal });
    this.get<HTMLButtonElement>('#furniture-rotate-right').addEventListener('click', () => this.transformLocalProp('rotate-right'), { signal });
    this.get<HTMLButtonElement>('#furniture-mirror').addEventListener('click', () => this.transformLocalProp('mirror'), { signal });
    this.get<HTMLButtonElement>('#furniture-delete').addEventListener('click', () => this.transformLocalProp('delete'), { signal });
    this.mount.querySelectorAll<HTMLButtonElement>('[data-screen-furniture-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.screenFurnitureAction;
        if (action === 'relocate') {
          const prop = this.selectedSceneProp();
          if (!prop) return;
          this.beginInteriorGhost('move', prop);
          return;
        }
        if (action === 'snap') {
          this.toggleFurnitureWallSnap();
          return;
        }
        if (action === 'rotate-left' || action === 'rotate-right' || action === 'delete') this.transformLocalProp(action);
      }, { signal });
    });
    const zoomFromButton = (factor: number): void => {
      const canvas = this.get<HTMLCanvasElement>('#three-world-canvas');
      this.applyCameraZoom(factor < 1 ? 220 : -220, canvas.clientWidth / 2, canvas.clientHeight / 2);
    };
    this.get<HTMLButtonElement>('#zoom-out').addEventListener('click', () => zoomFromButton(.75), { signal });
    this.get<HTMLButtonElement>('#zoom-in').addEventListener('click', () => zoomFromButton(1.25), { signal });
    this.get<HTMLButtonElement>('#zoom-reset').addEventListener('click', () => {
      const zoom = this.threeRenderer?.resetCameraZoom() || RPG_CAMERA_BASE_ZOOM;
      this.paintZoom(zoom);
    }, { signal });

    this.get<HTMLButtonElement>('#reset-position').addEventListener('click', () => {
      this.resumeCameraTracking();
      this.resetActors();
      this.toast('두 캐릭터를 스폰 위치로 이동했습니다.', 'notice');
    }, { signal });
    const dialog = this.get<HTMLDialogElement>('#help-dialog');
    this.get<HTMLButtonElement>('#open-help').addEventListener('click', () => dialog.showModal(), { signal });
    this.get<HTMLButtonElement>('#inspection-laser-toggle').addEventListener('click', () => this.toggleInspectionLaser(), { signal });

    window.addEventListener('keydown', (event) => {
      if (isFormTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'j' && this.inspectionLaserSupported()) {
        event.preventDefault();
        if (!event.repeat) this.toggleInspectionLaser();
        return;
      }
      if (this.inspectionLaser.active) {
        if (key === 'b') return;
        event.preventDefault();
        if (key === 'escape' || key === 'esc') this.stopInspectionLaser('escape');
        return;
      }
      if (this.interiorGhostProp) {
        if (key === 'l') {
          event.preventDefault();
          this.toggleFurnitureWallSnap();
          return;
        }
        if (key === 'r') {
          event.preventDefault();
          this.transformInteriorGhost(event.shiftKey ? 'rotate-left' : 'rotate-right');
          return;
        }
        if (key === 'escape' || key === 'delete' || key === 'backspace') {
          event.preventDefault();
          this.cancelInteriorGhost('GHOST 배치를 취소했습니다.');
          return;
        }
      }
      if (this.selectedSceneProp()) {
        if (key === 'l') {
          event.preventDefault();
          this.toggleFurnitureWallSnap();
          return;
        }
        if (key === 'r') {
          event.preventDefault();
          this.transformLocalProp(event.shiftKey ? 'rotate-left' : 'rotate-right');
          return;
        }
        if (key === 'delete' || key === 'backspace') {
          event.preventDefault();
          this.transformLocalProp('delete');
          return;
        }
      }
      if ((this.selectedLocalPropId || this.pendingInteriorAssetId) && key === 'escape') {
        event.preventDefault();
        this.pendingInteriorAssetId = '';
        this.selectedLocalPropId = '';
        this.selectedScenePropSnapshot = null;
        this.furnitureContextMenuOpen = false;
        this.interiorRelocationArmed = false;
        this.get<HTMLElement>('#game-stage').classList.remove('is-relocating-furniture');
        this.threeRenderer?.setEditorSelection('');
        this.renderFurniturePalette();
        this.updateFurnitureToolbar();
        return;
      }
      if (/^[1-6]$/.test(key)) {
        event.preventDefault();
        this.activateHotbarSlot(Number(key) - 1, this.cursorScreenPoint);
        return;
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault();
        this.pressedKeys.add(key);
      }
    }, { signal });
    window.addEventListener('keyup', (event) => this.pressedKeys.delete(event.key.toLowerCase()), { signal });
    window.addEventListener('blur', () => this.pressedKeys.clear(), { signal });
    const stage = this.get<HTMLElement>('#game-stage');
    stage.addEventListener('pointermove', (event) => {
      this.cursorScreenPoint = this.screenPoint(event.clientX, event.clientY);
      if (this.inspectionLaser.active) {
        this.scheduleInspectionLaserMeasurement(event);
        return;
      }
      this.handleMapPanMove(event);
    }, { signal });
    stage.addEventListener('pointerdown', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.istarpark-laser-toggle')) return;
      if (this.inspectionLaser.active) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.button === 0) {
        if ((this.paletteTab === 'furniture' || this.interiorRelocationArmed || this.interiorGhostProp) && this.handleInteriorPointerDown(event)) return;
        if (this.paletteTab === 'options' && this.handleFurnitureSelectionPointerDown(event)) return;
        this.startMapPan(event);
        return;
      }
      if (event.button !== 1) return;
      event.preventDefault();
      const point = this.screenPoint(event.clientX, event.clientY);
      if (point) this.activateSkill('common-teleport', point, true);
    }, { signal });
    stage.addEventListener('pointermove', (event) => {
      if (!this.inspectionLaser.active) this.handleInteriorPointerMove(event);
    }, { signal });
    stage.addEventListener('pointerup', (event) => {
      this.handleInteriorPointerUp(event);
      this.finishMapPan(event);
    }, { signal });
    stage.addEventListener('pointercancel', (event) => {
      this.handleInteriorPointerUp(event);
      this.finishMapPan(event);
    }, { signal });
    stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      if (this.inspectionLaser.active) {
        this.handleInspectionLaserWheel(event);
        return;
      }
      if (event.shiftKey && this.interiorGhostProp) {
        this.transformInteriorGhost(event.deltaY < 0 ? 'rotate-left' : 'rotate-right');
        return;
      }
      if (event.shiftKey && this.selectedSceneProp()) {
        this.transformLocalProp(event.deltaY < 0 ? 'rotate-left' : 'rotate-right');
        return;
      }
      const point = this.screenPoint(event.clientX, event.clientY);
      if (point) this.applyCameraZoom(event.deltaY, point.x, point.y);
    }, { signal, passive: false });
    stage.addEventListener('pointerleave', () => this.clearInspectionLaserPointer(), { signal });
    stage.addEventListener('auxclick', (event) => {
      if (event.button === 1) event.preventDefault();
    }, { signal });
    window.addEventListener('contextmenu', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('#game-stage')) return;
      // 캡처 단계에서 차단해 자식 UI가 이벤트를 가로채도 Chrome 기본 메뉴가 열리지 않는다.
      event.preventDefault();
      if (this.inspectionLaser.active) return;
      if (this.interiorGhostProp) {
        this.cancelInteriorGhost('GHOST 배치를 취소했습니다.');
        return;
      }
      this.handleFurnitureContextMenu(event);
    }, { signal, capture: true });
  }

  private applyCameraZoom(deltaY: number, x: number, y: number): void {
    if (!this.threeRenderer || this.renderer !== this.threeRenderer) return;
    this.paintZoom(this.threeRenderer.zoomAt(x, y, deltaY));
  }

  private paintZoom(zoom: number): void {
    const value = this.mount.querySelector<HTMLElement>('#zoom-value');
    if (value) value.textContent = `${cameraZoomPercent(zoom)}%`;
    this.updateFurnitureToolbar();
  }

  private startMapPan(event: PointerEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('button,a,input,textarea,select,label,[contenteditable="true"],.furniture-selection-toolbar')) return;
    event.preventDefault();
    this.mapPanPointer = event.pointerId;
    this.mapPanLastX = event.clientX;
    this.mapPanLastY = event.clientY;
    this.mapPanMoved = false;
    const stage = this.get<HTMLElement>('#game-stage');
    stage.classList.add('is-panning');
    stage.setPointerCapture(event.pointerId);
  }

  private handleMapPanMove(event: PointerEvent): void {
    if (event.pointerId !== this.mapPanPointer) return;
    const deltaX = event.clientX - this.mapPanLastX;
    const deltaY = event.clientY - this.mapPanLastY;
    this.mapPanLastX = event.clientX;
    this.mapPanLastY = event.clientY;
    if (Math.abs(deltaX) + Math.abs(deltaY) < .5) return;
    this.mapPanMoved = true;
    this.cameraTrackingPaused = true;
    const stage = this.get<HTMLElement>('#game-stage');
    stage.dataset.cameraTracking = 'free';
    this.renderer.panByScreenDelta(deltaX, deltaY);
  }

  private finishMapPan(event: PointerEvent): void {
    if (event.pointerId !== this.mapPanPointer) return;
    const stage = this.get<HTMLElement>('#game-stage');
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    stage.classList.remove('is-panning');
    stage.dataset.lastPanMoved = String(this.mapPanMoved);
    this.mapPanPointer = -1;
    this.mapPanMoved = false;
  }

  private resumeCameraTracking(): void {
    this.cameraTrackingPaused = false;
    const stage = this.mount.querySelector<HTMLElement>('#game-stage');
    if (stage) stage.dataset.cameraTracking = 'follow';
  }

  private screenPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = this.renderer === this.threeRenderer
      ? this.get<HTMLCanvasElement>('#three-world-canvas')
      : this.get<HTMLCanvasElement>('#world-canvas');
    const bounds = canvas.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return null;
    return { x, y };
  }

  private inspectionLaserSupported(): boolean {
    return Boolean(this.threeRenderer && this.renderer === this.threeRenderer && this.activeApartment()?.geometry);
  }

  private toggleInspectionLaser(force?: boolean): void {
    const shouldStart = force ?? !this.inspectionLaser.active;
    if (shouldStart) this.startInspectionLaser();
    else this.stopInspectionLaser('toggle');
  }

  private startInspectionLaser(): void {
    if (!this.inspectionLaserSupported()) return;
    this.pressedKeys.clear();
    this.inspectionLaser.active = true;
    this.inspectionLaser.axis = 'x';
    this.inspectionLaser.lastScreenPoint = null;
    this.inspectionLaser.measurement = null;
    this.get<HTMLElement>('#game-stage').dataset.istarparkLaserActive = 'true';
    this.renderInspectionLaserHud();
  }

  private stopInspectionLaser(_reason: string): void {
    if (this.inspectionLaser.frameRequest) cancelAnimationFrame(this.inspectionLaser.frameRequest);
    if (this.inspectionLaser.wheelResetTimer) window.clearTimeout(this.inspectionLaser.wheelResetTimer);
    this.inspectionLaser.active = false;
    this.inspectionLaser.lastScreenPoint = null;
    this.inspectionLaser.measurement = null;
    this.inspectionLaser.frameRequest = 0;
    this.inspectionLaser.wheelDelta = 0;
    this.inspectionLaser.wheelLatched = false;
    this.inspectionLaser.wheelResetTimer = 0;
    const stage = this.mount.querySelector<HTMLElement>('#game-stage');
    if (stage) delete stage.dataset.istarparkLaserActive;
    this.threeRenderer?.clearApartmentInspectionLaserFrame();
    this.renderInspectionLaserHud();
  }

  private clearInspectionLaserPointer(): void {
    if (!this.inspectionLaser.active) return;
    this.inspectionLaser.lastScreenPoint = null;
    this.inspectionLaser.measurement = null;
    this.threeRenderer?.hideApartmentInspectionLaserFrame();
    this.renderInspectionLaserHud();
  }

  private inspectionLaserDirectionLabel(): string {
    const direction = this.threeRenderer?.apartmentInspectionLaserScreenDirection(
      this.activeApartment(),
      this.inspectionLaser.axis,
    ) || (this.inspectionLaser.axis === 'y' ? 'ne-sw' : 'nw-se');
    return direction === 'ne-sw' ? '북동 ↔ 남서' : '북서 ↔ 남동';
  }

  private renderInspectionLaserHud(): void {
    const supported = this.inspectionLaserSupported();
    const active = supported && this.inspectionLaser.active;
    const toggle = this.mount.querySelector<HTMLButtonElement>('#inspection-laser-toggle');
    if (toggle) {
      toggle.hidden = !supported;
      toggle.classList.toggle('is-active', active);
      toggle.setAttribute('aria-pressed', String(active));
      toggle.title = `레이저 실측 ${active ? '종료' : '시작'} (J)`;
    }
    const hud = this.mount.querySelector<HTMLElement>('#inspection-laser-hud');
    if (!hud) return;
    hud.hidden = !active;
    if (!active) return;
    this.get<HTMLElement>('#inspection-laser-direction').textContent = this.inspectionLaserDirectionLabel();
    const measurement = this.inspectionLaser.measurement;
    this.get<HTMLOutputElement>('#inspection-laser-value').textContent = measurement?.valid
      ? measurement.label || `${measurement.distanceMm || 0}mm`
      : '— mm';
    const status = !this.inspectionLaser.lastScreenPoint
      ? '빈 공간을 가리키세요 · Shift+휠 방향 전환 · J/Esc 종료'
      : measurement?.reason === 'anchor-inside-obstacle'
        ? '구조물 위입니다. 측정할 빈 공간으로 마우스를 옮기세요.'
        : measurement?.reason === 'outside-floor'
          ? '세대 바닥 안쪽을 가리키세요.'
          : measurement?.valid !== true
            ? '양쪽 경계가 닿는 빈 공간에서 측정할 수 있습니다.'
            : measurement.anchorSnapped
              ? '구조물 가장자리의 빈 폭으로 자동 맞춤 · J/Esc 종료'
              : '현재 배치 가구 포함 · Shift+휠 방향 전환 · J/Esc 종료';
    this.get<HTMLElement>('#inspection-laser-status').textContent = status;
  }

  private scheduleInspectionLaserMeasurement(event: PointerEvent): void {
    if (!this.inspectionLaser.active) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.istarpark-laser-toggle,.istarpark-laser-hud')) return;
    const point = this.screenPoint(event.clientX, event.clientY);
    if (!point) return;
    this.inspectionLaser.lastScreenPoint = point;
    if (this.inspectionLaser.frameRequest) return;
    this.inspectionLaser.frameRequest = requestAnimationFrame(() => {
      this.inspectionLaser.frameRequest = 0;
      this.refreshInspectionLaserMeasurement();
    });
  }

  private refreshInspectionLaserMeasurement(): void {
    const screenPoint = this.inspectionLaser.lastScreenPoint;
    const apartment = this.activeApartment();
    if (!this.inspectionLaser.active || !screenPoint || !apartment?.geometry || !this.threeRenderer) {
      this.renderInspectionLaserHud();
      return;
    }
    const worldPoint = this.threeRenderer.unproject(screenPoint.x, screenPoint.y);
    const anchorPlanPoint = worldPoint ? apartmentWorldPointToLocalMeters(apartment, worldPoint) : null;
    const measurement = anchorPlanPoint
      ? measureIstarparkLaserGap({
        anchorPlanPoint,
        axis: this.inspectionLaser.axis,
        geometry: apartment.geometry,
        props: this.threeRenderer.getRenderedProps(),
        assets: this.interiorAssets,
      })
      : { valid: false, reason: 'outside-floor', axis: this.inspectionLaser.axis } as InspectionLaserMeasurement;
    this.inspectionLaser.measurement = measurement;
    if (measurement.valid) this.threeRenderer.setApartmentInspectionLaserFrame(apartment, measurement);
    else this.threeRenderer.hideApartmentInspectionLaserFrame();
    this.renderInspectionLaserHud();
  }

  private handleInspectionLaserWheel(event: WheelEvent): void {
    if (!event.shiftKey) return;
    this.inspectionLaser.wheelDelta += Math.abs(event.deltaY);
    if (this.inspectionLaser.wheelResetTimer) window.clearTimeout(this.inspectionLaser.wheelResetTimer);
    this.inspectionLaser.wheelResetTimer = window.setTimeout(() => {
      this.inspectionLaser.wheelDelta = 0;
      this.inspectionLaser.wheelLatched = false;
      this.inspectionLaser.wheelResetTimer = 0;
    }, 160);
    if (!this.inspectionLaser.wheelLatched && this.inspectionLaser.wheelDelta >= 40) {
      this.inspectionLaser.wheelLatched = true;
      this.inspectionLaser.axis = this.inspectionLaser.axis === 'x' ? 'y' : 'x';
      this.refreshInspectionLaserMeasurement();
    }
  }

  private setPaletteTab(tab: 'options' | 'furniture'): void {
    this.paletteTab = tab;
    this.furnitureContextMenuOpen = false;
    this.mount.querySelectorAll<HTMLElement>('[data-palette-tab]').forEach((button) =>
      button.classList.toggle('is-active', button.dataset.paletteTab === tab));
    this.get<HTMLElement>('#option-palette-body').hidden = tab !== 'options';
    this.get<HTMLElement>('#furniture-palette-body').hidden = tab !== 'furniture';
    this.get<HTMLElement>('#game-stage').classList.toggle('is-interior-authoring', tab === 'furniture');
    if (tab === 'furniture') {
      this.pressedKeys.clear();
      this.focusInteriorApartment();
    }
    if (tab !== 'furniture') {
      this.cancelInteriorGhost('', false);
      this.pendingInteriorAssetId = '';
      this.interiorDragPointer = -1;
      this.interiorRelocationArmed = false;
      this.get<HTMLElement>('#game-stage').classList.remove('is-relocating-furniture');
    }
    this.paintPaletteViewToggle();
    this.renderFurniturePalette();
    this.updateFurnitureToolbar();
  }

  private paintPaletteViewToggle(): void {
    const button = this.mount.querySelector<HTMLButtonElement>('#palette-applied-only');
    const label = this.mount.querySelector<HTMLElement>('#palette-view-label');
    if (!button || !label) return;
    const count = this.paletteTab === 'options'
      ? this.selectedOptionIds.length
      : this.localInteriorProps.filter((prop) => prop.localDeleted !== true).length;
    label.textContent = this.paletteAppliedOnly
      ? `${this.paletteTab === 'options' ? '적용 B옵션' : '배치 가구'} ${count}개`
      : this.paletteTab === 'options' ? '전체 B옵션' : '전체 가구·가전';
    button.textContent = this.paletteAppliedOnly ? '전체 보기' : '적용만 보기';
    button.setAttribute('aria-pressed', String(this.paletteAppliedOnly));
    button.classList.toggle('is-active', this.paletteAppliedOnly);
  }

  private focusInteriorApartment(): void {
    const apartment = this.activeApartment();
    const floor = apartmentFloor(apartment);
    if (!apartment || !floor.length || !this.threeRenderer) return;
    const local: NumericPoint = [
      (Math.min(...floor.map((point) => point[0])) + Math.max(...floor.map((point) => point[0]))) / 2,
      (Math.min(...floor.map((point) => point[1])) + Math.max(...floor.map((point) => point[1]))) / 2,
    ];
    const world = apartmentUnitWorldPoint(apartment, local);
    this.threeRenderer.focusAt(world.x, world.y);
  }

  private renderFurniturePalette(): void {
    const list = this.mount.querySelector<HTMLElement>('#furniture-list');
    if (!list) return;
    const query = this.mount.querySelector<HTMLInputElement>('#furniture-search')?.value.trim().toLowerCase() || '';
    if (this.paletteAppliedOnly) {
      const matches = [...this.localInteriorProps].reverse().flatMap((prop) => {
        if (prop.localDeleted === true) return [];
        const asset = this.interiorAssets.find((candidate) => candidate.assetId === prop.assetId);
        if (!asset || (query && !`${asset.displayNameKo} ${asset.assetId} ${asset.category}`.toLowerCase().includes(query))) return [];
        return [{ prop, asset }];
      });
      list.innerHTML = matches.map(({ prop, asset }, index) => {
        const selected = String(prop.id) === this.selectedLocalPropId;
        const preview = asset.previewUrl
          ? `<img src="${escapeHtml(resolveReferencedUrl(asset.previewUrl, this.interiorCatalogUrl))}" alt="" loading="lazy" />`
          : `<i>${escapeHtml(asset.displayNameKo.slice(0, 1))}</i>`;
        const yaw = ((Math.round(finiteNumber(prop.yawDeg)) % 360) + 360) % 360;
        return `<button type="button" class="furniture-card furniture-card--placed ${selected ? 'is-selected' : ''}" data-furniture-prop-id="${escapeHtml(String(prop.id || ''))}">
          <span>${preview}</span><b>${escapeHtml(asset.displayNameKo)}</b><small>배치 ${matches.length - index} · ${yaw}°</small></button>`;
      }).join('') || '<p class="empty-options">배치된 가구·가전이 없습니다.</p>';
    } else {
      const matches = this.interiorAssets.filter((asset) => !query
        || `${asset.displayNameKo} ${asset.assetId} ${asset.category}`.toLowerCase().includes(query));
      list.innerHTML = matches.map((asset) => {
        const selected = asset.assetId === this.pendingInteriorAssetId;
        const preview = asset.previewUrl
          ? `<img src="${escapeHtml(resolveReferencedUrl(asset.previewUrl, this.interiorCatalogUrl))}" alt="" loading="lazy" />`
          : `<i>${escapeHtml(asset.displayNameKo.slice(0, 1))}</i>`;
        return `<button type="button" class="furniture-card ${selected ? 'is-active' : ''}" data-furniture-asset="${escapeHtml(asset.assetId)}">
          <span>${preview}</span><b>${escapeHtml(asset.displayNameKo)}</b><small>${escapeHtml(asset.category)}</small></button>`;
      }).join('') || '<p class="empty-options">검색 결과가 없습니다.</p>';
    }
    list.querySelectorAll<HTMLButtonElement>('[data-furniture-asset]').forEach((button) => {
      button.addEventListener('click', () => {
        const assetId = button.dataset.furnitureAsset || '';
        const asset = this.interiorAssets.find((candidate) => candidate.assetId === assetId);
        if (!asset) return;
        this.pendingInteriorAssetId = assetId;
        this.selectedLocalPropId = '';
        this.selectedScenePropSnapshot = null;
        this.threeRenderer?.setEditorSelection('');
        this.interiorRelocationArmed = false;
        this.get<HTMLElement>('#game-stage').classList.remove('is-relocating-furniture');
        const point = this.lastInteriorPointerPoint || this.defaultInteriorGhostPoint();
        this.beginInteriorGhost('add', createLocalProp(asset, point[0], point[1]));
        this.renderFurniturePalette();
      });
    });
    list.querySelectorAll<HTMLButtonElement>('[data-furniture-prop-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const propId = button.dataset.furniturePropId || '';
        if (!this.localInteriorProps.some((prop) => String(prop.id) === propId)) return;
        this.pendingInteriorAssetId = '';
        this.selectedLocalPropId = propId;
        this.selectedScenePropSnapshot = { ...this.localInteriorProps.find((prop) => String(prop.id) === propId)! };
        this.interiorRelocationArmed = false;
        this.get<HTMLElement>('#game-stage').classList.remove('is-relocating-furniture');
        this.threeRenderer?.setEditorSelection(propId);
        this.renderFurniturePalette();
        this.updateFurnitureToolbar();
        this.get<HTMLElement>('#furniture-status').textContent = '배치 목록에서 가구를 선택했습니다. 화면 메뉴나 단축키로 수정하세요.';
      });
    });
    const count = this.mount.querySelector<HTMLElement>('#furniture-count');
    if (count) count.textContent = `${this.localInteriorProps.filter((prop) => prop.localDeleted !== true).length}개`;
    this.paintPaletteViewToggle();
  }

  private activeApartment(): WorldObject | null {
    return this.world?.objects.find((object) => object.type === 'enterable-apartment-unit-v1' && object.geometry) || null;
  }

  private stageLocalPoint(event: PointerEvent): NumericPoint | null {
    const apartment = this.activeApartment();
    if (!apartment || !this.threeRenderer || this.renderer !== this.threeRenderer) return null;
    const canvas = this.get<HTMLCanvasElement>('#three-world-canvas');
    const bounds = canvas.getBoundingClientRect();
    const world = this.threeRenderer.unproject(event.clientX - bounds.left, event.clientY - bounds.top);
    if (!world) return null;
    const point = apartmentWorldPointToLocalMeters(apartment, world);
    return point.map((value) => Math.round(value * 20) / 20) as NumericPoint;
  }

  private defaultInteriorGhostPoint(): NumericPoint {
    const apartment = this.activeApartment();
    const rooms = apartment?.geometry?.roomZones || [];
    const room = rooms.find((candidate) => String(candidate.id || candidate.roomId || '').includes('living')) || rooms[0];
    const bounds = room?.boundsMeters;
    if (Array.isArray(bounds) && bounds.length >= 4) {
      return [(finiteNumber(bounds[0]) + finiteNumber(bounds[2])) / 2, (finiteNumber(bounds[1]) + finiteNumber(bounds[3])) / 2];
    }
    const floor = apartmentFloor(apartment);
    if (!floor.length) return [0, 0];
    const sum = floor.reduce((total, point) => [total[0] + point[0], total[1] + point[1]] as NumericPoint, [0, 0]);
    return [Math.round(sum[0] / floor.length * 20) / 20, Math.round(sum[1] / floor.length * 20) / 20];
  }

  private beginInteriorGhost(mode: 'add' | 'move', prop: ApartmentInteriorProp): void {
    this.interiorGhostMode = mode;
    this.interiorGhostProp = { ...prop, positionMeters: [...(prop.positionMeters || this.defaultInteriorGhostPoint())] };
    this.interiorRelocationArmed = mode === 'move';
    this.furnitureContextMenuOpen = false;
    const stage = this.get<HTMLElement>('#game-stage');
    stage.classList.toggle('is-relocating-furniture', mode === 'move');
    stage.classList.add('has-interior-ghost');
    this.threeRenderer?.setEditorSelection('');
    this.updateInteriorGhost(this.interiorGhostProp.positionMeters as NumericPoint);
    this.renderFurniturePalette();
    this.updateFurnitureToolbar();
  }

  private updateInteriorGhost(point: NumericPoint): void {
    const prop = this.interiorGhostProp;
    const apartment = this.activeApartment();
    if (!prop || !apartment?.geometry) return;
    const snappedPoint = this.snapFurniturePoint(prop, point.map((value) => Math.round(value * 20) / 20) as NumericPoint);
    prop.positionMeters = [...snappedPoint];
    const renderedProps = this.threeRenderer?.getRenderedProps() || this.localInteriorProps;
    this.interiorGhostValidation = validateInteriorPlacement({
      prop,
      geometry: apartment.geometry,
      props: renderedProps,
      assets: this.interiorAssets,
      ignorePropId: this.interiorGhostMode === 'move' ? String(prop.id || '') : '',
    });
    if (this.interiorGhostValidation.roomZoneId) prop.roomZoneId = this.interiorGhostValidation.roomZoneId;
    const valid = this.interiorGhostValidation.ok;
    this.threeRenderer?.setEditorGhost(prop, valid, this.interiorGhostMode === 'move' ? String(prop.id || '') : '');
    const stage = this.get<HTMLElement>('#game-stage');
    stage.classList.toggle('is-furniture-ghost-valid', valid);
    stage.classList.toggle('is-furniture-ghost-invalid', !valid);
    stage.dataset.furnitureGhostState = valid ? 'valid' : 'invalid';
    const asset = this.interiorAssets.find((candidate) => candidate.assetId === prop.assetId);
    const name = asset?.displayNameKo || String(prop.assetId || '가구');
    const wallSnap = this.furnitureWallSnapEnabled ? ' · 벽 자석 ON' : '';
    this.get<HTMLElement>('#furniture-status').textContent = valid
      ? `${name} GHOST · 설치 가능${wallSnap} · 좌클릭 확정 · 우클릭/Esc 취소`
      : `${name} GHOST · 배치 불가: ${this.interiorGhostValidation.errors[0]?.message || '위치를 옮겨주세요.'}${wallSnap}`;
  }

  private confirmInteriorGhost(): boolean {
    const ghost = this.interiorGhostProp;
    if (!ghost || !this.interiorGhostValidation?.ok) {
      const message = this.interiorGhostValidation?.errors[0]?.message || '배치 가능한 초록색 위치로 옮겨주세요.';
      this.get<HTMLElement>('#furniture-status').textContent = `빨간 GHOST는 설치할 수 없습니다. ${message}`;
      this.toast('빨간 GHOST는 설치할 수 없습니다.', 'notice');
      return false;
    }
    const mode = this.interiorGhostMode;
    if (mode === 'add') {
      const installed = { ...ghost, positionMeters: [...(ghost.positionMeters || [])] };
      this.localInteriorProps.push(installed);
      this.selectedLocalPropId = String(installed.id || '');
      this.selectedScenePropSnapshot = { ...installed, positionMeters: [...(installed.positionMeters || [])] };
    } else {
      const editable = this.ensureEditableSelectedProp();
      if (!editable) return false;
      editable.positionMeters = [...(ghost.positionMeters || [])];
      editable.yawDeg = ghost.yawDeg;
      editable.mirrored = ghost.mirrored;
      editable.roomZoneId = ghost.roomZoneId;
      this.selectedScenePropSnapshot = { ...editable, positionMeters: [...editable.positionMeters] };
    }
    this.clearInteriorGhostState();
    this.saveInteriorLayout(mode === 'add'
      ? '가구를 PBR 맵에 배치했습니다. 다시 선택해 이동할 수 있습니다.'
      : '가구를 선택한 위치로 재배치했습니다.');
    return true;
  }

  private clearInteriorGhostState(): void {
    this.interiorGhostProp = null;
    this.interiorGhostMode = null;
    this.interiorGhostValidation = null;
    this.pendingInteriorAssetId = '';
    this.interiorRelocationArmed = false;
    const stage = this.mount.querySelector<HTMLElement>('#game-stage');
    if (stage) {
      stage.classList.remove('has-interior-ghost', 'is-furniture-ghost-valid', 'is-furniture-ghost-invalid', 'is-relocating-furniture');
      delete stage.dataset.furnitureGhostState;
    }
    this.threeRenderer?.clearEditorGhost();
    this.threeRenderer?.setEditorSelection(this.selectedLocalPropId);
  }

  private cancelInteriorGhost(message = '', repaint = true): void {
    if (!this.interiorGhostProp && !this.interiorGhostMode) return;
    this.clearInteriorGhostState();
    if (!repaint) return;
    this.renderFurniturePalette();
    this.updateFurnitureToolbar();
    if (message) this.get<HTMLElement>('#furniture-status').textContent = message;
  }

  private transformInteriorGhost(action: 'rotate-left' | 'rotate-right' | 'mirror'): void {
    const ghost = this.interiorGhostProp;
    if (!ghost) return;
    if (action === 'mirror') ghost.mirrored = !ghost.mirrored;
    else ghost.yawDeg = ((finiteNumber(ghost.yawDeg) + (action === 'rotate-left' ? -90 : 90)) % 360 + 360) % 360;
    this.updateInteriorGhost((ghost.positionMeters || this.defaultInteriorGhostPoint()) as NumericPoint);
  }

  private selectedLocalProp(): ApartmentInteriorProp | undefined {
    return this.localInteriorProps.find((prop) => String(prop.id) === this.selectedLocalPropId && prop.localDeleted !== true);
  }

  private selectedSceneProp(): ApartmentInteriorProp | undefined {
    return this.selectedLocalProp()
      || this.threeRenderer?.getRenderedProp(this.selectedLocalPropId)
      || (String(this.selectedScenePropSnapshot?.id || '') === this.selectedLocalPropId ? this.selectedScenePropSnapshot : undefined)
      || undefined;
  }

  private ensureEditableSelectedProp(): ApartmentInteriorProp | undefined {
    const local = this.selectedLocalProp();
    if (local) return local;
    const rendered = this.threeRenderer?.getRenderedProp(this.selectedLocalPropId);
    const source = rendered
      || (String(this.selectedScenePropSnapshot?.id || '') === this.selectedLocalPropId ? this.selectedScenePropSnapshot : undefined);
    if (!source?.id || !source.assetId) return undefined;
    const safeSourceId = String(source.id).replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'prop';
    const override: ApartmentInteriorProp = {
      ...source,
      id: `local-override-${safeSourceId}-${Date.now()}`,
      sourcePropId: String(source.id),
      localOverride: true,
      positionMeters: [...(source.positionMeters || [0, 0])],
    };
    this.localInteriorProps.push(override);
    this.selectedLocalPropId = String(override.id);
    this.selectedScenePropSnapshot = { ...override, positionMeters: [...(override.positionMeters || [])] };
    this.threeRenderer?.setEditorProps(this.localInteriorProps);
    this.threeRenderer?.setEditorSelection(this.selectedLocalPropId);
    return override;
  }

  private scenePropAt(event: MouseEvent | PointerEvent): ApartmentInteriorProp | undefined {
    if (!this.threeRenderer || this.renderer !== this.threeRenderer) return undefined;
    if ((event.target as HTMLElement | null)?.closest('.combat-dock,.map-identity,.floorplan-minimap,.stage-option-quote,.game-toast,.stage-zoom,.furniture-selection-toolbar')) return undefined;
    const canvas = this.get<HTMLCanvasElement>('#three-world-canvas');
    const bounds = canvas.getBoundingClientRect();
    const propId = this.threeRenderer.pickEditorProp(event.clientX - bounds.left, event.clientY - bounds.top);
    return this.localInteriorProps.find((prop) => String(prop.id) === propId && prop.localDeleted !== true)
      || this.threeRenderer.getRenderedProp(propId)
      || undefined;
  }

  private selectSceneProp(prop: ApartmentInteriorProp, openMenu: boolean, message: string): void {
    this.selectedLocalPropId = String(prop.id || '');
    this.selectedScenePropSnapshot = { ...prop, positionMeters: [...(prop.positionMeters || [])] };
    this.pendingInteriorAssetId = '';
    this.furnitureContextMenuOpen = openMenu;
    this.interiorRelocationArmed = false;
    this.get<HTMLElement>('#game-stage').classList.remove('is-relocating-furniture');
    this.threeRenderer?.setEditorSelection(this.selectedLocalPropId);
    this.renderFurniturePalette();
    this.updateFurnitureToolbar();
    const status = this.mount.querySelector<HTMLElement>('#furniture-status');
    if (status) status.textContent = message;
  }

  private handleFurnitureSelectionPointerDown(event: PointerEvent): boolean {
    if ((event.target as HTMLElement | null)?.closest('.furniture-selection-toolbar')) {
      event.preventDefault();
      event.stopPropagation();
      return Boolean(this.selectedSceneProp());
    }
    const picked = this.scenePropAt(event);
    if (!picked) {
      this.selectedLocalPropId = '';
      this.selectedScenePropSnapshot = null;
      this.furnitureContextMenuOpen = false;
      this.threeRenderer?.setEditorSelection('');
      this.updateFurnitureToolbar();
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    this.selectSceneProp(picked, false, '가구를 선택했습니다. L 키로 가까운 벽에 자석처럼 붙일 수 있습니다.');
    return true;
  }

  private handleFurnitureContextMenu(event: MouseEvent): boolean {
    const target = event.target as HTMLElement | null;
    // 선택 이름표가 가구 위를 덮더라도 현재 마스크 대상을 잃지 않는다.
    const picked = target?.closest('.furniture-selection-toolbar')
      ? this.selectedSceneProp()
      : this.scenePropAt(event);
    if (!picked) return false;
    event.preventDefault();
    this.selectSceneProp(picked, true, '가구 우클릭 메뉴를 열었습니다. 이동·회전·벽 자석·삭제를 사용할 수 있습니다.');
    return true;
  }

  private hitLocalProp(point: NumericPoint): ApartmentInteriorProp | undefined {
    return [...this.localInteriorProps].reverse().find((prop) => {
      if (prop.localDeleted === true) return false;
      const position = prop.positionMeters;
      if (!Array.isArray(position)) return false;
      const asset = this.interiorAssets.find((candidate) => candidate.assetId === prop.assetId);
      const size = interiorDimensions(prop, asset);
      const angle = -finiteNumber(prop.yawDeg) * Math.PI / 180;
      const dx = point[0] - finiteNumber(position[0]);
      const dy = point[1] - finiteNumber(position[1]);
      const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
      const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
      return Math.abs(localX) <= Math.max(.25, size[0] / 2)
        && Math.abs(localY) <= Math.max(.25, size[1] / 2);
    });
  }

  private handleInteriorPointerDown(event: PointerEvent): boolean {
    if ((event.target as HTMLElement | null)?.closest('.combat-dock,.map-identity,.floorplan-minimap,.stage-option-quote,.game-toast,.stage-zoom,.furniture-selection-toolbar')) return false;
    const apartment = this.activeApartment();
    if (!apartment) return false;
    const point = this.stageLocalPoint(event);
    this.lastInteriorPointerPoint = point || this.lastInteriorPointerPoint;
    event.preventDefault();
    event.stopPropagation();
    if (this.interiorGhostProp) {
      if (point) this.updateInteriorGhost(point);
      this.confirmInteriorGhost();
      return true;
    }
    const canvas = this.get<HTMLCanvasElement>('#three-world-canvas');
    const bounds = canvas.getBoundingClientRect();
    const pickedId = this.threeRenderer?.pickEditorProp(event.clientX - bounds.left, event.clientY - bounds.top) || '';
    const picked = this.localInteriorProps.find((prop) => String(prop.id) === pickedId && prop.localDeleted !== true)
      || this.threeRenderer?.getRenderedProp(pickedId)
      || undefined;
    if (picked) {
      this.selectSceneProp(picked, true, '가구를 선택했습니다. 드래그하거나 화면 조작창으로 수정하세요.');
      if (event.altKey) {
        this.transformLocalProp('mirror');
        return true;
      }
      if (event.ctrlKey) {
        const position = Array.isArray(picked.positionMeters) ? picked.positionMeters : point || [0, 0];
        const copy = { ...picked, id: `local-${picked.assetId}-${Date.now()}`, sourcePropId: undefined, localOverride: false, positionMeters: [...position] };
        this.localInteriorProps.push(copy);
        this.selectedLocalPropId = String(copy.id);
        this.selectedScenePropSnapshot = { ...copy, positionMeters: [...(copy.positionMeters || [])] };
      }
      this.interiorDragPointer = event.pointerId;
      this.interiorDragMoved = false;
      this.get<HTMLElement>('#game-stage').setPointerCapture(event.pointerId);
      return true;
    }
    if (!point || !pointInside(point, apartmentFloor(apartment))) {
      this.selectedLocalPropId = '';
      this.selectedScenePropSnapshot = null;
      this.threeRenderer?.setEditorSelection('');
      this.updateFurnitureToolbar();
      this.get<HTMLElement>('#furniture-status').textContent = '가구를 직접 누르거나 세대 바닥 안쪽을 선택해 주세요.';
      return false;
    }
    const hit = this.hitLocalProp(point);
    this.selectedLocalPropId = String(hit?.id || '');
    this.selectedScenePropSnapshot = hit ? { ...hit, positionMeters: [...(hit.positionMeters || [])] } : null;
    this.threeRenderer?.setEditorSelection(this.selectedLocalPropId);
    if (hit && event.altKey) {
      this.transformLocalProp('mirror');
      return true;
    }
    if (hit && event.ctrlKey) {
      const copy = { ...hit, id: `local-${hit.assetId}-${Date.now()}`, sourcePropId: undefined, localOverride: false, positionMeters: [...(hit.positionMeters || point)] };
      this.localInteriorProps.push(copy);
      this.selectedLocalPropId = String(copy.id);
      this.selectedScenePropSnapshot = { ...copy, positionMeters: [...(copy.positionMeters || [])] };
    }
    this.interiorDragPointer = hit ? event.pointerId : -1;
    this.interiorDragMoved = false;
    if (hit) this.get<HTMLElement>('#game-stage').setPointerCapture(event.pointerId);
    this.renderFurniturePalette();
    this.updateFurnitureToolbar();
    return Boolean(hit);
  }

  private handleInteriorPointerMove(event: PointerEvent): void {
    const point = this.stageLocalPoint(event);
    if (point) this.lastInteriorPointerPoint = point;
    if (this.interiorGhostProp) {
      if (point) {
        if (event.pointerId === this.interiorDragPointer) this.interiorDragMoved = true;
        this.updateInteriorGhost(point);
      }
      return;
    }
    if (event.pointerId !== this.interiorDragPointer || !point) return;
    const selected = this.selectedSceneProp();
    if (!selected) return;
    const previous = selected.positionMeters;
    if (Array.isArray(previous)
      && Math.abs(finiteNumber(previous[0]) - point[0]) <= .001
      && Math.abs(finiteNumber(previous[1]) - point[1]) <= .001) return;
    this.interiorDragMoved = true;
    this.beginInteriorGhost('move', selected);
    this.updateInteriorGhost(point);
  }

  private handleInteriorPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.interiorDragPointer) return;
    this.interiorDragPointer = -1;
    if (this.interiorDragMoved && this.interiorGhostMode === 'move') {
      if (!this.confirmInteriorGhost()) {
        this.get<HTMLElement>('#furniture-status').textContent = '빨간 GHOST 위치는 저장하지 않았습니다. 마우스로 초록 영역까지 옮긴 뒤 좌클릭하세요.';
      }
    } else {
      this.get<HTMLElement>('#furniture-status').textContent = '가구를 선택했습니다. 드래그하거나 화면 조작창으로 수정하세요.';
    }
    this.interiorDragMoved = false;
  }

  private transformLocalProp(action: 'rotate-left' | 'rotate-right' | 'mirror' | 'delete'): void {
    const prop = this.ensureEditableSelectedProp();
    if (!prop) {
      this.get<HTMLElement>('#furniture-status').textContent = '먼저 PBR 맵에서 배치된 가구를 선택해 주세요.';
      return;
    }
    if (action === 'delete') {
      if (prop.sourcePropId) prop.localDeleted = true;
      else this.localInteriorProps = this.localInteriorProps.filter((candidate) => candidate !== prop);
      this.selectedLocalPropId = '';
      this.selectedScenePropSnapshot = null;
      this.furnitureContextMenuOpen = false;
    } else if (action === 'mirror') {
      prop.mirrored = !prop.mirrored;
    } else {
      prop.yawDeg = ((finiteNumber(prop.yawDeg) + (action === 'rotate-left' ? -90 : 90)) % 360 + 360) % 360;
    }
    this.saveInteriorLayout(action === 'delete' ? '선택 가구를 삭제했습니다.' : '가구 변형을 로컬 저장했습니다.');
  }

  private snapFurniturePoint(prop: ApartmentInteriorProp, point: NumericPoint): NumericPoint {
    if (!this.furnitureWallSnapEnabled) return point;
    const apartment = this.activeApartment();
    if (!apartment?.geometry) return point;
    const asset = this.interiorAssets.find((candidate) => candidate.assetId === prop.assetId);
    const result = snapFurnitureToNearestWall({ ...prop, positionMeters: point }, apartment.geometry, asset);
    return result?.positionMeters || point;
  }

  private toggleFurnitureWallSnap(): void {
    const ghost = this.interiorGhostProp;
    const selected = ghost || this.selectedSceneProp();
    if (!selected) return;
    this.furnitureWallSnapEnabled = !this.furnitureWallSnapEnabled;
    if (ghost) {
      this.updateInteriorGhost((this.lastInteriorPointerPoint || ghost.positionMeters || this.defaultInteriorGhostPoint()) as NumericPoint);
      this.updateFurnitureToolbar();
      this.toast(this.furnitureWallSnapEnabled ? 'GHOST 벽 자석을 켰습니다.' : 'GHOST 벽 자석을 껐습니다.', this.furnitureWallSnapEnabled ? 'success' : 'notice');
      return;
    }
    if (!this.furnitureWallSnapEnabled) {
      this.updateFurnitureToolbar();
      this.toast('가구 위치 자석을 껐습니다.', 'notice');
      return;
    }
    const apartment = this.activeApartment();
    const asset = this.interiorAssets.find((candidate) => candidate.assetId === selected.assetId);
    const snapped = apartment?.geometry ? snapFurnitureToNearestWall(selected, apartment.geometry, asset) : null;
    if (!snapped) {
      this.updateFurnitureToolbar();
      this.toast('1.15m 안에서 붙일 수 있는 벽을 찾지 못했습니다.', 'notice');
      return;
    }
    const prop = this.ensureEditableSelectedProp();
    if (!prop) return;
    prop.positionMeters = snapped.positionMeters;
    this.selectedScenePropSnapshot = { ...prop, positionMeters: [...snapped.positionMeters] };
    this.saveInteriorLayout(`위치 자석 ON · ${snapped.wallId} 벽면에 가구를 붙였습니다.`);
    this.toast('위치 자석 ON · 가까운 벽면에 배치했습니다.', 'success');
  }

  private saveInteriorLayout(message: string): void {
    if (!this.world) return;
    const layout: LocalInteriorLayoutV1 = {
      schemaVersion: 1,
      mapId: this.world.entry.id,
      props: this.localInteriorProps,
      updatedAt: new Date().toISOString(),
    };
    writeLayout(layout);
    this.threeRenderer?.setEditorProps(this.localInteriorProps);
    this.threeRenderer?.setEditorSelection(this.selectedLocalPropId);
    this.renderFurniturePalette();
    this.updateFurnitureToolbar();
    this.get<HTMLElement>('#furniture-status').textContent = message;
  }

  private updateFurnitureToolbar(): void {
    const toolbar = this.mount.querySelector<HTMLElement>('#furniture-selection-toolbar');
    if (!toolbar) return;
    const stage = this.get<HTMLElement>('#game-stage');
    stage.dataset.furnitureWallSnap = String(this.furnitureWallSnapEnabled);
    const prop = this.selectedSceneProp();
    if (this.interiorGhostProp || !prop || !this.threeRenderer || this.renderer !== this.threeRenderer) {
      toolbar.hidden = true;
      stage.classList.remove('has-furniture-selection', 'has-furniture-context-menu');
      delete stage.dataset.selectedFurnitureName;
      delete stage.dataset.selectedFurnitureMode;
      return;
    }
    const apartment = this.activeApartment();
    const position = prop.positionMeters;
    if (!apartment || !Array.isArray(position)) {
      toolbar.hidden = true;
      return;
    }
    const world = apartmentUnitWorldPoint(apartment, [finiteNumber(position[0]), finiteNumber(position[1])]);
    const point = this.threeRenderer.project(world.x, world.y);
    const left = Math.max(88, Math.min(stage.clientWidth - 88, point.x));
    const top = Math.max(76, Math.min(stage.clientHeight - 150, point.y - 20));
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
    toolbar.hidden = false;
    const actionsVisible = this.paletteTab === 'furniture' || this.furnitureContextMenuOpen;
    toolbar.classList.toggle('is-name-only', !actionsVisible);
    toolbar.classList.toggle('is-wall-snap', this.furnitureWallSnapEnabled);
    stage.classList.add('has-furniture-selection');
    stage.classList.toggle('has-furniture-context-menu', actionsVisible);
    const asset = this.interiorAssets.find((candidate) => candidate.assetId === prop.assetId);
    const name = asset?.displayNameKo || String(prop.assetId || '선택 가구');
    this.get<HTMLElement>('#furniture-selection-name').textContent = name;
    stage.dataset.selectedFurnitureName = name;
    stage.dataset.selectedFurnitureMode = actionsVisible ? 'menu' : 'name';
    const shortcut = toolbar.querySelector<HTMLElement>('small');
    if (shortcut) shortcut.textContent = `드래그 이동 · L 자석 ${this.furnitureWallSnapEnabled ? 'ON' : 'OFF'} · Shift+휠 회전 · Del 삭제`;
  }

  private async selectMap(mapId: string, updateUrl = true): Promise<void> {
    const map = this.catalog.maps.find((entry) => entry.id === mapId);
    if (!map) return;
    this.stopInspectionLaser('map-change');
    this.cancelInteriorGhost('', false);
    this.lastInteriorPointerPoint = null;
    const token = ++this.mapLoadToken;
    this.currentMap = map;
    this.resumeCameraTracking();
    this.get<HTMLElement>('#stage-loader').classList.remove('is-hidden');
    this.get<HTMLSelectElement>('#map-select').value = map.id;
    this.mount.querySelectorAll<HTMLElement>('[data-map-id]').forEach((button) => button.classList.toggle('is-active', button.dataset.mapId === map.id));

    const world = await loadWorld(map, () => this.trackAsset());
    if (token !== this.mapLoadToken || this.destroyed) return;
    const planDefinition = applyPlanVariant(world, this.planVariant);
    this.world = world;
    this.canvasRenderer.setWorld(world);
    let rendererLabel = world.sourceMode === 'chunks' ? 'CANVAS·ISO' : world.sourceMode === 'minimap' ? 'MINIMAP' : 'PROCEDURAL';
    const canvas = this.get<HTMLCanvasElement>('#world-canvas');
    const webglCanvas = this.get<HTMLCanvasElement>('#three-world-canvas');
    if (map.renderer === 'three-pbr' && this.threeRenderer && world.sourceMode === 'chunks') {
      try {
        webglCanvas.hidden = false;
        canvas.hidden = true;
        this.threeRenderer.setWorld(world);
        this.renderer = this.threeRenderer;
        rendererLabel = this.threeRenderer.label;
      } catch (error) {
        console.warn('[bunfirvil] Three.js map initialization failed; using Canvas2D.', error);
        webglCanvas.hidden = true;
        canvas.hidden = false;
        this.renderer = this.canvasRenderer;
      }
    } else {
      webglCanvas.hidden = true;
      canvas.hidden = false;
      this.renderer = this.canvasRenderer;
    }
    this.resetActors();
    this.selectedOptionIds = readSelectedOptions(map.id).filter((id) =>
      compatibleOptions(this.catalog.bOptions, map.unitType).some((option) => option.id === id),
    );
    this.renderer.setSelectedOptions(this.selectedOptionIds);
    this.localInteriorProps = readLayout(map.id, new Set(this.interiorAssets.map((asset) => asset.assetId))).props;
    this.selectedLocalPropId = '';
    this.selectedScenePropSnapshot = null;
    this.pendingInteriorAssetId = '';
    this.furnitureContextMenuOpen = false;
    this.furnitureWallSnapEnabled = false;
    this.threeRenderer?.setEditorProps(this.localInteriorProps);
    this.threeRenderer?.setEditorSelection('');
    this.renderFurniturePalette();
    this.optionCategory = '전체';
    this.renderOptions();

    this.get<HTMLElement>('#map-unit').textContent = map.unitType;
    this.get<HTMLElement>('#map-title').textContent = map.label;
    this.get<HTMLElement>('#map-revision').textContent = map.revision;
    this.paintPlanVariant(planDefinition);
    this.get<HTMLElement>('#option-unit').textContent = map.unitType;
    this.get<HTMLElement>('#metric-chunks').textContent = `${world.loadedChunkCount}/${world.requestedChunkCount}`;
    this.get<HTMLElement>('#metric-renderer').textContent = rendererLabel;
    this.minimap.setWorld(world, planDefinition.variant);
    this.get<HTMLElement>('#stage-loader').classList.add('is-hidden');
    this.renderInspectionLaserHud();

    if (updateUrl) this.updateQuery();
    const sourceMessage = world.sourceMode === 'chunks'
      ? `${map.unitType} ${planDefinition.label} 정적 월드 · ${world.loadedChunkCount}개 chunk 준비 완료`
      : `${map.unitType} ${world.sourceMode === 'minimap' ? '미니맵' : '절차형'} fallback으로 렌더링합니다.`;
    this.toast(sourceMessage, world.sourceMode === 'chunks' ? 'success' : 'notice');
  }

  private async selectPlanVariant(variant: ApartmentPlanVariant): Promise<void> {
    if (variant === this.planVariant) return;
    this.planVariant = variant;
    this.paintPlanVariant(planVariantDefinition(this.currentMap.unitType, variant));
    await this.selectMap(this.currentMap.id);
  }

  private paintPlanVariant(definition: ApartmentPlanVariantDefinition): void {
    this.mount.querySelectorAll<HTMLElement>('[data-plan-variant]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.planVariant === definition.variant);
      if (button instanceof HTMLButtonElement) button.setAttribute('aria-pressed', String(button.dataset.planVariant === definition.variant));
    });
    const badge = this.mount.querySelector<HTMLElement>('#plan-variant-badge');
    if (badge) {
      badge.textContent = definition.label;
      badge.title = definition.operations.length ? definition.operations.join(' · ') : '원본 평면도';
    }
    const stage = this.mount.querySelector<HTMLElement>('#game-stage');
    if (stage) {
      stage.dataset.planVariant = definition.variant;
      stage.dataset.planVariantTransform = definition.operations.join(' + ') || '원본';
    }
  }

  private resetActors(): void {
    if (!this.world) return;
    const livingRoomSpawns = livingRoomSpawnCells(this.world);
    const first = livingRoomSpawns?.first || nearestWalkable(this.world, this.currentMap.spawn.x, this.currentMap.spawn.y);
    const second = livingRoomSpawns?.second || nearestWalkable(this.world, first.x + 2, first.y + 1);
    const stage = this.mount.querySelector<HTMLElement>('#game-stage');
    if (stage) stage.dataset.actorSpawnRoom = livingRoomSpawns ? 'living' : 'map-fallback';
    const actor100 = this.actors.get('100');
    const actor200 = this.actors.get('200');
    const now = performance.now();
    if (actor100) Object.assign(actor100, first, {
      displayX: first.x,
      displayY: first.y,
      direction: 's',
      motion: 'idle',
      motionStartedAt: now,
      motionUntil: 0,
      moving: false,
      travel: null,
      turnReadyAt: 0,
      queuedDirection: null,
    });
    if (actor200) Object.assign(actor200, second, {
      displayX: second.x,
      displayY: second.y,
      direction: 'sw',
      motion: 'idle',
      motionStartedAt: now,
      motionUntil: 0,
      moving: false,
      travel: null,
      turnReadyAt: 0,
      queuedDirection: null,
    });
  }

  private setActiveActor(key: CharacterKey, updateUrl = true): void {
    if (!this.actors.has(key) && this.actors.size > 0) key = [...this.actors.keys()][0];
    this.activeActor = key;
    this.resumeCameraTracking();
    this.actorViews.forEach((view, actorKey) => view.setSelected(actorKey === key));
    this.mount.querySelectorAll<HTMLElement>('[data-actor-key]').forEach((button) => button.classList.toggle('is-active', button.dataset.actorKey === key));
    const actor = this.actors.get(key);
    const portrait = this.mount.querySelector<HTMLElement>('#active-portrait');
    if (portrait) {
      portrait.textContent = CHARACTER_DISPLAY_NAMES[key];
      portrait.className = `portrait portrait--${key}`;
    }
    const label = this.mount.querySelector<HTMLElement>('#active-actor-label');
    if (label) label.textContent = actor?.label || key;
    if (updateUrl && this.catalog) this.updateQuery();
  }

  private updateQuery(): void {
    const url = new URL(window.location.href);
    url.searchParams.set('map', this.currentMap.id);
    url.searchParams.set('actor', this.activeActor);
    url.searchParams.set('variant', this.planVariant);
    history.replaceState(null, '', url);
  }

  private renderHotbar(): void {
    const element = this.get<HTMLElement>('#hotbar');
    element.innerHTML = this.hotbar
      .map((skillId, index) => {
        const skill = skillId ? this.skillById(skillId) : null;
        const icon = skill?.iconUrl
          ? `<img src="${escapeHtml(resolveProjectUrl(skill.iconUrl))}" alt="" onerror="this.hidden=true" />`
          : '';
        return `
          <button type="button" class="hotbar-slot ${skill ? '' : 'is-empty'}" data-slot="${index}" data-skill-id="${escapeHtml(skillId || '')}" draggable="${Boolean(skill)}" aria-label="${skill ? `${index + 1}번 ${escapeHtml(skill.label)}` : `${index + 1}번 빈 슬롯`}">
            <span class="slot-number">${index + 1}</span>
            ${skill ? `${icon}<span class="skill-glyph">${escapeHtml(skill.glyph)}</span><span class="skill-name">${escapeHtml(skill.label)}</span>` : '<span class="empty-cross">+</span>'}
            <span class="cooldown-sweep"></span><span class="cooldown-number"></span>
          </button>
        `;
      })
      .join('');

    element.querySelectorAll<HTMLButtonElement>('.hotbar-slot').forEach((slot) => {
      slot.addEventListener('click', () => this.activateHotbarSlot(Number(slot.dataset.slot), this.cursorScreenPoint), { signal: this.abortController.signal });
      slot.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/plain', slot.dataset.slot || '');
        event.dataTransfer?.setDragImage(slot, slot.clientWidth / 2, slot.clientHeight / 2);
        slot.classList.add('is-dragging');
      }, { signal: this.abortController.signal });
      slot.addEventListener('dragend', () => slot.classList.remove('is-dragging'), { signal: this.abortController.signal });
      slot.addEventListener('dragover', (event) => {
        event.preventDefault();
        slot.classList.add('is-drop-target');
      }, { signal: this.abortController.signal });
      slot.addEventListener('dragleave', () => slot.classList.remove('is-drop-target'), { signal: this.abortController.signal });
      slot.addEventListener('drop', (event) => {
        event.preventDefault();
        slot.classList.remove('is-drop-target');
        const from = Number(event.dataTransfer?.getData('text/plain'));
        const to = Number(slot.dataset.slot);
        if (!Number.isInteger(from) || !Number.isInteger(to)) return;
        this.hotbar = reorderHotbar(this.hotbar, from, to);
        writeHotbar(this.hotbar);
        this.renderHotbar();
      }, { signal: this.abortController.signal });
    });
  }

  private skillById(skillId: string): DemoSkill {
    if (skillId === BASIC_ATTACK.id) return BASIC_ATTACK;
    const skill = this.catalog.skills.find((item) => item.id === skillId);
    if (!skill) return { ...BASIC_ATTACK, id: skillId, label: skillId, glyph: '?' };
    return {
      id: skill.id,
      label: skill.label,
      description: skill.description,
      iconUrl: skill.iconUrl,
      cooldownMs: Math.max(200, skill.cooldownMs || 1_000),
      manaCost: Math.max(0, skill.manaCost || 0),
      glyph: SKILL_GLYPHS[skill.id] || '✦',
    };
  }

  private activateHotbarSlot(index: number, target: { x: number; y: number } | null = null): void {
    const skillId = this.hotbar[index];
    if (!skillId) {
      this.toast(`${index + 1}번 슬롯이 비어 있습니다.`, 'notice');
      return;
    }
    this.activateSkill(skillId, target);
  }

  private activateSkill(skillId: string, target: { x: number; y: number } | null = null, ignoreCooldown = false): void {
    let teleportDestination: { x: number; y: number } | null = null;
    if (skillId === 'common-teleport') {
      if (!this.world || !target) {
        this.toast('맵 위에 마우스 커서를 둔 뒤 텔레포트하세요.', 'notice');
        return;
      }
      const worldPoint = this.renderer.unproject(target.x, target.y);
      if (!worldPoint) {
        this.toast('현재 커서 위치의 월드 좌표를 찾지 못했습니다.', 'notice');
        return;
      }
      teleportDestination = nearestWalkable(this.world, worldPoint.x, worldPoint.y);
      if (!isWalkable(this.world, teleportDestination.x, teleportDestination.y)) {
        this.toast('해당 위치로 텔레포트할 수 없습니다.', 'notice');
        return;
      }
    }
    const now = performance.now();
    const skill = this.skillById(skillId);
    const remaining = (this.cooldowns.get(skillId) || 0) - now;
    if (!ignoreCooldown && remaining > 0) {
      this.toast(`${skill.label} 준비 중 · ${(remaining / 1_000).toFixed(1)}초`, 'notice');
      return;
    }
    const actor = this.actors.get(this.activeActor);
    if (!actor) return;
    this.cooldowns.set(skillId, now + skill.cooldownMs);
    actor.motion = skillId === 'basic-attack' || skillId === 'common-double-arrow' ? 'attack' : 'cast';
    actor.motionStartedAt = now;
    actor.motionUntil = now + Math.min(900, Math.max(360, skill.cooldownMs * 0.28));
    actor.moving = false;
    actor.travel = null;
    actor.displayX = actor.x;
    actor.displayY = actor.y;
    this.triggerEffect(skillId, actor, teleportDestination);
    this.toast(`${actor.label} · ${skill.label}`, 'skill');
  }

  private triggerEffect(skillId: string, actor: ActorState, teleportDestination: { x: number; y: number } | null = null): void {
    const layer = this.get<HTMLElement>('#effect-layer');
    const from = this.renderer.project(actor.displayX, actor.displayY);
    const other = this.actors.get(actor.key === '100' ? '200' : '100');
    const to = teleportDestination
      ? this.renderer.project(teleportDestination.x, teleportDestination.y)
      : other ? this.renderer.project(other.displayX, other.displayY) : { x: from.x + 110, y: from.y - 22 };
    const manifestUrls = this.catalog.skills.find((skill) => skill.id === skillId)?.effectUrls || [];
    this.effectPlayer.playMany(manifestUrls, {
      direction: actor.direction,
      characterKey: actor.key,
      origin: from,
      target: to,
    });

    if (skillId === 'common-teleport' && this.world && teleportDestination) {
      this.spawnEffect('teleport-burst', from.x, from.y, 850);
      actor.x = teleportDestination.x;
      actor.y = teleportDestination.y;
      actor.displayX = actor.x;
      actor.displayY = actor.y;
      actor.travel = null;
      const projected = this.renderer.project(actor.x, actor.y);
      this.spawnEffect('teleport-burst is-arrival', projected.x, projected.y, 850);
      return;
    }

    if (skillId === 'warrior-shock-stun') {
      this.spawnEffect('shock-orbit', to.x, to.y - 34, 1_150, '<i></i><i></i><i></i><i></i>');
      return;
    }

    if (skillId === 'common-double-arrow') {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      for (const offset of [-7, 7]) {
        const effect = this.spawnEffect('energy-arrow', from.x, from.y - 35 + offset, 720, '<i></i>');
        effect.style.setProperty('--travel-x', `${dx}px`);
        effect.style.setProperty('--travel-y', `${dy - offset}px`);
        effect.style.setProperty('--arrow-angle', `${Math.atan2(dy, dx) * 180 / Math.PI}deg`);
      }
      return;
    }

    this.spawnEffect('slash-arc', from.x + 18, from.y - 40, 520, '<i></i>');
  }

  private spawnEffect(className: string, x: number, y: number, duration: number, markup = ''): HTMLElement {
    const effect = document.createElement('span');
    effect.className = `skill-effect ${className}`;
    effect.style.left = `${x}px`;
    effect.style.top = `${y}px`;
    effect.innerHTML = markup;
    this.get<HTMLElement>('#effect-layer').append(effect);
    window.setTimeout(() => effect.remove(), duration);
    return effect;
  }

  private renderOptions(): void {
    const options = compatibleOptions(this.catalog.bOptions, this.currentMap.unitType).map((option) => ({
      ...option,
      price: option.prices?.[this.currentMap.unitType] ?? option.price,
    }));
    const allowedIds = new Set(options.map((option) => option.id));
    this.selectedOptionIds = this.selectedOptionIds.filter((id) => allowedIds.has(id));
    const sourceCategories = [...new Set(options.map((option) => option.category))];
    const categoryPriority = (category: string): number => {
      if (category === '시스템에어컨') return 0;
      if (category.includes('주방')) return 1;
      if (category.includes('현관') || category.includes('거실')) return 2;
      if (category.includes('빌트인')) return 3;
      return 10 + sourceCategories.indexOf(category);
    };
    const categories = ['전체', ...sourceCategories.sort((left, right) => categoryPriority(left) - categoryPriority(right))];
    if (!categories.includes(this.optionCategory)) this.optionCategory = '전체';

    const categoryElement = this.get<HTMLElement>('#option-categories');
    categoryElement.innerHTML = categories
      .map((category) => `<button type="button" class="${category === this.optionCategory ? 'is-active' : ''}" data-option-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`)
      .join('');
    categoryElement.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.addEventListener('click', () => {
        this.optionCategory = button.dataset.optionCategory || '전체';
        this.renderOptions();
      }, { signal: this.abortController.signal });
    });
    requestAnimationFrame(() => categoryElement.querySelector<HTMLElement>('button.is-active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));

    const categoryOptions = options.filter((option) => this.optionCategory === '전체' || option.category === this.optionCategory);
    const visibleOptions = this.paletteAppliedOnly
      ? categoryOptions.filter((option) => this.selectedOptionIds.includes(option.id))
      : categoryOptions;
    const renderedOptions = visibleOptions.filter((option) => {
      const ac = systemAcChoice(option.id);
      return !ac || (this.paletteAppliedOnly
        ? this.selectedOptionIds.includes(option.id)
        : ac.count === systemAcChoices(options, ac.tier)[0]?.count);
    });
    this.get<HTMLElement>('#option-list').innerHTML = renderedOptions.length
      ? renderedOptions.map((option) => {
          const ac = systemAcChoice(option.id);
          return ac ? this.systemAcCard(ac.tier, options) : this.optionCard(option, options);
        }).join('')
      : '<div class="empty-options"><b>이 세대형의 옵션이 없습니다.</b><span>기본 마감 렌더를 확인해 주세요.</span></div>';

    this.get<HTMLElement>('#option-list').querySelectorAll<HTMLInputElement>('input[data-option-id]').forEach((input) => {
      input.addEventListener('change', () => {
        this.selectedOptionIds = applyOptionToggle(options, this.selectedOptionIds, input.dataset.optionId || '');
        this.commitSelectedOptions();
      }, { signal: this.abortController.signal });
    });
    this.get<HTMLElement>('#option-list').querySelectorAll<HTMLButtonElement>('[data-system-ac-adjust]').forEach((button) => {
      button.addEventListener('click', () => {
        const tier = button.dataset.systemAcTier as SystemAcTier;
        const delta = button.dataset.systemAcAdjust === 'increase' ? 1 : -1;
        this.selectedOptionIds = adjustSystemAcSelection(options, this.selectedOptionIds, tier, delta);
        this.commitSelectedOptions();
      }, { signal: this.abortController.signal });
    });

    const selectedOptions = options.filter((option) => this.selectedOptionIds.includes(option.id));
    this.get<HTMLElement>('#option-count').textContent = String(selectedOptions.length).padStart(2, '0');
    this.get<HTMLElement>('#option-selected-count').textContent = `${selectedOptions.length}개`;
    const total = calculateOptionPrice(options, this.selectedOptionIds);
    this.get<HTMLElement>('#option-total').innerHTML = `${numberFormat.format(total)}<small>원</small>`;
    this.get<HTMLElement>('#selected-option-chips').innerHTML = selectedOptions.length
      ? selectedOptions.map((option) => `<span>${escapeHtml(option.label)}</span>`).join('')
      : '<span>기본 마감</span>';
    this.get<HTMLElement>('#stage-option-count').textContent = `${selectedOptions.length}개`;
    this.get<HTMLElement>('#stage-option-total').innerHTML = `${numberFormat.format(total)}<small>원</small>`;
    this.get<HTMLElement>('#stage-option-chips').innerHTML = selectedOptions.length
      ? selectedOptions.map((option) => `<span><b>${escapeHtml(option.label)}</b><em>+${numberFormat.format(option.price)}원</em></span>`).join('')
      : '<span><b>기본 마감</b><em>+0원</em></span>';
    this.paintPaletteViewToggle();
  }

  private commitSelectedOptions(): void {
    writeSelectedOptions(this.currentMap.id, this.selectedOptionIds);
    this.canvasRenderer.setSelectedOptions(this.selectedOptionIds);
    this.threeRenderer?.setSelectedOptions(this.selectedOptionIds);
    this.renderOptions();
    this.toast('B옵션 프리뷰를 로컬에 저장했습니다.', 'success');
  }

  private systemAcCard(tier: SystemAcTier, allOptions: BOptionEntry[]): string {
    const choices = systemAcChoices(allOptions, tier);
    const active = choices.find((choice) => this.selectedOptionIds.includes(choice.id)) || null;
    const option = allOptions.find((candidate) => candidate.id === (active?.id || choices[0]?.id));
    const count = active?.count || 0;
    const canIncrease = !active || choices.some((choice) => choice.count > active.count);
    const preview = option?.previewUrl
      ? `<img src="${escapeHtml(resolveProjectUrl(option.previewUrl))}" alt="" loading="lazy" />`
      : '';
    return `
      <article class="option-card system-ac-card ${active ? 'is-selected' : ''}" data-system-ac-tier="${tier}">
        <span class="option-preview ${option?.previewUrl ? '' : 'is-fallback'}">${preview}<i>空</i><em>${active ? '적용됨' : '2대부터'}</em></span>
        <span class="option-copy">
          <span class="option-category">시스템에어컨</span>
          <b>시스템에어컨 · ${tier === 'premium' ? '고급형' : '일반형'}</b>
          <small>거실 기본 설치 후 침실 순서대로 대수를 추가합니다.</small>
          <strong>${active && option ? `+ ${numberFormat.format(option.price)}원` : '2대부터 선택'}</strong>
        </span>
        <span class="system-ac-stepper" aria-label="${tier === 'premium' ? '고급형' : '일반형'} 설치 대수">
          <button type="button" data-system-ac-adjust="decrease" data-system-ac-tier="${tier}" ${active ? '' : 'disabled'} aria-label="설치 대수 1 감소">−</button>
          <output>${count ? `${count}대` : '미적용'}</output>
          <button type="button" data-system-ac-adjust="increase" data-system-ac-tier="${tier}" ${canIncrease ? '' : 'disabled'} aria-label="설치 대수 1 증가">＋</button>
        </span>
      </article>`;
  }

  private optionCard(option: BOptionEntry, allOptions: BOptionEntry[]): string {
    const selected = this.selectedOptionIds.includes(option.id);
    const dependencyLabels = option.requires
      .map((required) => allOptions.find((candidate) => candidate.id === required)?.label || required)
      .join(', ');
    const alternativeDependencyLabels = (option.requiresAny ?? [])
      .map((required) => allOptions.find((candidate) => candidate.id === required)?.label || required)
      .join(' 또는 ');
    const dependencyCopy = [dependencyLabels, alternativeDependencyLabels].filter(Boolean).join(' + ');
    const preview = option.previewUrl
      ? `<img src="${escapeHtml(resolveProjectUrl(option.previewUrl))}" alt="" loading="lazy" onerror="this.closest('.option-preview')?.classList.add('is-fallback')" />`
      : '';
    return `
      <label class="option-card ${selected ? 'is-selected' : ''}">
        <span class="option-preview ${option.previewUrl ? '' : 'is-fallback'}">${preview}<i>${escapeHtml(option.category.slice(0, 1))}</i><em>${selected ? '적용됨' : 'PREVIEW'}</em></span>
        <span class="option-copy">
          <span class="option-category">${escapeHtml(option.category)}</span>
          <b>${escapeHtml(option.label)}</b>
          <small>${escapeHtml(option.description)}</small>
          ${dependencyCopy ? `<span class="dependency">+ ${escapeHtml(dependencyCopy)} 필요</span>` : ''}
          <strong>+ ${numberFormat.format(option.price)}원</strong>
        </span>
        <input type="checkbox" data-option-id="${escapeHtml(option.id)}" ${selected ? 'checked' : ''} />
        <span class="check-ui" aria-hidden="true"></span>
      </label>
    `;
  }

  private moveActiveActor(time: number): void {
    if (this.paletteTab === 'furniture') return;
    const actor = this.actors.get(this.activeActor);
    if (!actor || !this.world) return;
    const horizontal = Number(this.pressedKeys.has('d') || this.pressedKeys.has('arrowright')) - Number(this.pressedKeys.has('a') || this.pressedKeys.has('arrowleft'));
    const vertical = Number(this.pressedKeys.has('s') || this.pressedKeys.has('arrowdown')) - Number(this.pressedKeys.has('w') || this.pressedKeys.has('arrowup'));
    if (horizontal === 0 && vertical === 0) {
      if (!actor.travel) {
        actor.moving = false;
        if (actor.motion === 'walk') {
          actor.motion = 'idle';
          actor.motionStartedAt = time;
        }
      }
      return;
    }
    const nextDirection = screenDirection(horizontal, vertical);
    if (actor.travel) {
      // 이동 중에는 현재 cell의 출발 방향을 유지하고 다음 intent만 큐에 둔다.
      actor.queuedDirection = nextDirection;
      return;
    }
    if (actor.direction !== nextDirection) {
      actor.direction = nextDirection;
      actor.queuedDirection = null;
      actor.turnReadyAt = time + TURN_ONLY_HOLD_TO_MOVE_MS;
      actor.moving = false;
      actor.motion = 'idle';
      actor.motionStartedAt = time;
      return;
    }
    actor.direction = nextDirection;
    actor.queuedDirection = null;
    if (actor.motionUntil > time) return;
    if (actor.turnReadyAt > time) return;
    const worldDelta = screenVectorToWorldDelta(horizontal, vertical);
    const nextX = actor.x + worldDelta.dx;
    const nextY = actor.y + worldDelta.dy;
    if (canTraverse(this.world, actor.x, actor.y, nextX, nextY)) {
      actor.travel = {
        fromX: actor.x,
        fromY: actor.y,
        toX: nextX,
        toY: nextY,
        startedAt: time,
        endsAt: time + MOVEMENT_INTERVAL_MS,
        direction: nextDirection,
      };
      actor.x = nextX;
      actor.y = nextY;
      actor.moving = true;
      actor.motion = 'walk';
      actor.motionStartedAt = time;
      actor.turnReadyAt = 0;
    } else {
      actor.moving = false;
      this.get<HTMLElement>('#game-stage').classList.remove('hit-boundary');
      void this.get<HTMLElement>('#game-stage').offsetWidth;
      this.get<HTMLElement>('#game-stage').classList.add('hit-boundary');
    }
  }

  private advanceActorTravel(actor: ActorState, time: number): void {
    if (!actor.travel) return;
    const position = interpolateCellTravel(actor.travel, time);
    actor.displayX = position.x;
    actor.displayY = position.y;
    if (position.progress < 1) return;
    actor.displayX = actor.travel.toX;
    actor.displayY = actor.travel.toY;
    actor.travel = null;
    actor.moving = false;
    if (actor.queuedDirection && actor.queuedDirection !== actor.direction) {
      actor.direction = actor.queuedDirection;
      actor.turnReadyAt = time + TURN_ONLY_HOLD_TO_MOVE_MS;
      actor.motion = 'idle';
      actor.motionStartedAt = time;
    }
    actor.queuedDirection = null;
  }

  private readonly tick = (time: number): void => {
    if (this.destroyed) return;
    this.frameMetrics.push(time);
    for (const actor of this.actors.values()) this.advanceActorTravel(actor, time);
    this.moveActiveActor(time);

    for (const actor of this.actors.values()) {
      if (actor.motionUntil > 0 && actor.motionUntil <= time) {
        actor.motionUntil = 0;
        actor.motion = actor.moving ? 'walk' : 'idle';
        actor.motionStartedAt = time;
      }
    }
    const active = this.actors.get(this.activeActor);
    if (active && !this.cameraTrackingPaused && this.paletteTab !== 'furniture' && !this.selectedLocalPropId) this.renderer.follow(active);
    this.threeRenderer?.setOcclusionFocus(active || null);
    try {
      this.renderer.render(time);
    } catch (error) {
      if (this.renderer === this.threeRenderer && this.world) {
        console.warn('[bunfirvil] WebGL render failed; switching to Canvas2D.', error);
        this.get<HTMLCanvasElement>('#three-world-canvas').hidden = true;
        this.get<HTMLCanvasElement>('#world-canvas').hidden = false;
        this.renderer = this.canvasRenderer;
        this.canvasRenderer.setWorld(this.world);
        this.canvasRenderer.setSelectedOptions(this.selectedOptionIds);
        this.get<HTMLElement>('#metric-renderer').textContent = 'CANVAS·FALLBACK';
        this.renderer.render(time);
      } else {
        throw error;
      }
    }
    const actorWorldScale = this.renderer === this.threeRenderer ? this.threeRenderer?.getCameraZoom() || 1 : 1;
    this.actorViews.forEach((view, key) => {
      const actor = this.actors.get(key);
      if (actor) view.update(actor, this.renderer.project(actor.displayX, actor.displayY), time, actorWorldScale);
    });
    this.minimap.render(this.actors.values(), this.activeActor, time);
    if (this.selectedLocalPropId) this.updateFurnitureToolbar();
    this.paintCooldowns(time);

    if (time - this.lastMetricPaint > 500) {
      this.lastMetricPaint = time;
      const metrics = this.frameMetrics.snapshot();
      this.get<HTMLElement>('#metric-fps').textContent = metrics.fps ? String(metrics.fps) : '—';
      this.get<HTMLElement>('#metric-p95').textContent = metrics.p95 ? `${metrics.p95}ms` : '—';
      this.get<HTMLElement>('#metric-assets').textContent = String(this.assetCount);
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private paintCooldowns(time: number): void {
    this.get<HTMLElement>('#hotbar').querySelectorAll<HTMLElement>('.hotbar-slot[data-skill-id]').forEach((slot) => {
      const id = slot.dataset.skillId || '';
      if (!id) return;
      const skill = this.skillById(id);
      const remaining = Math.max(0, (this.cooldowns.get(id) || 0) - time);
      const ratio = Math.min(1, remaining / skill.cooldownMs);
      slot.style.setProperty('--cooldown-ratio', String(ratio));
      slot.classList.toggle('is-cooling', remaining > 0);
      const label = slot.querySelector<HTMLElement>('.cooldown-number');
      if (label) label.textContent = remaining > 0 ? (remaining / 1_000).toFixed(remaining > 950 ? 1 : 0) : '';
    });
  }

  private trackAsset(): void {
    this.assetCount += 1;
  }

  private toast(message: string, tone: 'success' | 'notice' | 'skill'): void {
    const element = this.get<HTMLElement>('#toast');
    element.textContent = message;
    element.dataset.tone = tone;
    element.classList.remove('is-visible');
    void element.offsetWidth;
    element.classList.add('is-visible');
    window.setTimeout(() => element.classList.remove('is-visible'), 2_200);
  }
}
