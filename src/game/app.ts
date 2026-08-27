import { escapeHtml, formatBytes, resolveProjectUrl } from './base';
import { loadCatalog, mapFromQuery } from './catalog';
import { ManifestEffectPlayer } from './effect-player';
import { readHotbar, reorderHotbar, writeHotbar } from './hotbar';
import { FrameMetrics } from './metrics';
import {
  applyOptionToggle,
  calculateOptionPrice,
  compatibleOptions,
  readSelectedOptions,
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
  WorldData,
} from './types';
import { IsometricWorldRenderer, isWalkable, loadWorld, nearestWalkable } from './world';

const numberFormat = new Intl.NumberFormat('ko-KR');
const MOVEMENT_INTERVAL_MS = 92;

interface WorldRendererPort {
  setWorld(world: WorldData): void;
  setSelectedOptions(optionIds: string[]): void;
  follow(target: ActorState, smoothing?: number): void;
  project(x: number, y: number): { x: number; y: number };
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

function directionFromDelta(dx: number, dy: number): Direction {
  if (dx === 0 && dy < 0) return 'n';
  if (dx > 0 && dy < 0) return 'ne';
  if (dx > 0 && dy === 0) return 'e';
  if (dx > 0 && dy > 0) return 'se';
  if (dx === 0 && dy > 0) return 's';
  if (dx < 0 && dy > 0) return 'sw';
  if (dx < 0 && dy === 0) return 'w';
  return 'nw';
}

function isFormTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function mapLabelShort(map: StaticMapEntry): string {
  return map.unitType || map.label.match(/\d+[A-Z]?/i)?.[0] || map.label;
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
  private readonly abortController = new AbortController();
  private selectedOptionIds: string[] = [];
  private optionCategory = '전체';
  private animationFrame = 0;
  private lastMoveAt = 0;
  private lastMetricPaint = 0;
  private assetCount = 0;
  private mapLoadToken = 0;
  private destroyed = false;

  constructor(private readonly mount: HTMLElement) {}

  async start(): Promise<void> {
    const { catalog, fallback } = await loadCatalog();
    this.catalog = catalog;
    this.currentMap = mapFromQuery(catalog, window.location.search);
    const requestedActor = new URLSearchParams(window.location.search).get('actor');
    if (requestedActor === '200') this.activeActor = '200';
    this.hotbar = readHotbar(catalog.defaultHotbar);

    this.renderShell(fallback);
    this.canvasRenderer = new IsometricWorldRenderer(this.get<HTMLCanvasElement>('#world-canvas'));
    this.renderer = this.canvasRenderer;
    this.effectPlayer = new ManifestEffectPlayer(this.get<HTMLElement>('#effect-layer'), () => this.trackAsset());
    try {
      const { ThreeWorldRenderer } = await import('./three-world');
      this.threeRenderer = new ThreeWorldRenderer(this.get<HTMLCanvasElement>('#three-world-canvas'));
    } catch (error) {
      console.warn('[bunfirvil] WebGL unavailable; Canvas2D renderer stays active.', error);
      this.threeRenderer = null;
    }
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
              <div class="actor-switch" role="group" aria-label="조작 캐릭터">
                <span>CONTROL ACTOR</span>
                <div>
                  <button type="button" data-actor-key="100" class="${this.activeActor === '100' ? 'is-active' : ''}"><i class="actor-dot actor-dot--100"></i>100</button>
                  <button type="button" data-actor-key="200" class="${this.activeActor === '200' ? 'is-active' : ''}"><i class="actor-dot actor-dot--200"></i>200</button>
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
              </div>

              <div class="performance-hud" aria-label="렌더링 성능">
                <div class="perf-title"><span></span> RUNTIME</div>
                <dl>
                  <div><dt>FPS</dt><dd id="metric-fps">—</dd></div>
                  <div><dt>P95</dt><dd id="metric-p95">—</dd></div>
                  <div><dt>RENDER</dt><dd id="metric-renderer">CANVAS2D</dd></div>
                  <div><dt>CHUNKS</dt><dd id="metric-chunks">0/0</dd></div>
                  <div><dt>ASSETS</dt><dd id="metric-assets">0</dd></div>
                </dl>
              </div>

              <div class="stage-tip"><kbd>WASD</kbd><span>또는</span><kbd>방향키</kbd><b>이동</b></div>
              <div id="toast" class="game-toast" role="status" aria-live="polite"></div>
              <div id="stage-loader" class="stage-loader" aria-live="polite">
                <span class="loader-orbit"><i></i></span>
                <b>STATIC WORLD LOADING</b>
                <small>manifest와 chunk를 조합하고 있습니다</small>
              </div>

              <div class="combat-dock">
                <div class="active-actor-card">
                  <span class="portrait portrait--${this.activeActor}" id="active-portrait">${this.activeActor}</span>
                  <div><small>ACTIVE ACTOR</small><b id="active-actor-label">${this.activeActor}</b></div>
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
              <span class="option-count" id="option-count">0</span>
            </header>
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
            <div><span class="help-icon">1–8</span><b>스킬 재생</b><p>숫자키 또는 핫바 클릭으로 모션과 효과를 재생합니다. 슬롯은 드래그해 맞바꿀 수 있습니다.</p></div>
            <div><span class="help-icon">B</span><b>옵션 프리뷰</b><p>B팔레트 선택은 맵의 미리보기 프롭과 견적에 반영되고 이 브라우저에 저장됩니다.</p></div>
          </div>
          <p class="dialog-note">이 사이트는 시각·성능 검수용입니다. 피해, 명중, MP, 사용자 인증과 공용 저장은 처리하지 않습니다.</p>
        </form>
      </dialog>
    `;
  }

  private createActors(): void {
    const entries = new Map(this.catalog.characters.map((entry) => [entry.key, entry]));
    const fallbackEntries: StaticCharacterEntry[] = [
      { key: '100', label: '남자 의료진', manifestUrl: 'generated/characters/100/animation.json' },
      { key: '200', label: '여자 의료진', manifestUrl: 'generated/characters/200/animation.json' },
    ];
    const layer = this.get<HTMLElement>('#actor-layer');
    for (const fallback of fallbackEntries) {
      const entry = entries.get(fallback.key) || fallback;
      const actor: ActorState = {
        key: entry.key,
        label: entry.label,
        x: this.currentMap.spawn.x,
        y: this.currentMap.spawn.y,
        direction: 's',
        motion: 'idle',
        motionUntil: 0,
        moving: false,
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
    this.mount.querySelectorAll<HTMLButtonElement>('[data-actor-key]').forEach((button) => {
      button.addEventListener('click', () => this.setActiveActor(button.dataset.actorKey as CharacterKey), { signal });
    });

    this.get<HTMLButtonElement>('#reset-position').addEventListener('click', () => {
      this.resetActors();
      this.toast('두 캐릭터를 스폰 위치로 이동했습니다.', 'notice');
    }, { signal });
    const dialog = this.get<HTMLDialogElement>('#help-dialog');
    this.get<HTMLButtonElement>('#open-help').addEventListener('click', () => dialog.showModal(), { signal });

    window.addEventListener('keydown', (event) => {
      if (isFormTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (/^[1-8]$/.test(key)) {
        event.preventDefault();
        this.activateHotbarSlot(Number(key) - 1);
        return;
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault();
        this.pressedKeys.add(key);
      }
    }, { signal });
    window.addEventListener('keyup', (event) => this.pressedKeys.delete(event.key.toLowerCase()), { signal });
    window.addEventListener('blur', () => this.pressedKeys.clear(), { signal });
  }

  private async selectMap(mapId: string, updateUrl = true): Promise<void> {
    const map = this.catalog.maps.find((entry) => entry.id === mapId);
    if (!map) return;
    const token = ++this.mapLoadToken;
    this.currentMap = map;
    this.get<HTMLElement>('#stage-loader').classList.remove('is-hidden');
    this.get<HTMLSelectElement>('#map-select').value = map.id;
    this.mount.querySelectorAll<HTMLElement>('[data-map-id]').forEach((button) => button.classList.toggle('is-active', button.dataset.mapId === map.id));

    const world = await loadWorld(map, () => this.trackAsset());
    if (token !== this.mapLoadToken || this.destroyed) return;
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
    this.optionCategory = '전체';
    this.renderOptions();

    this.get<HTMLElement>('#map-unit').textContent = map.unitType;
    this.get<HTMLElement>('#map-title').textContent = map.label;
    this.get<HTMLElement>('#map-revision').textContent = map.revision;
    this.get<HTMLElement>('#option-unit').textContent = map.unitType;
    this.get<HTMLElement>('#metric-chunks').textContent = `${world.loadedChunkCount}/${world.requestedChunkCount}`;
    this.get<HTMLElement>('#metric-renderer').textContent = rendererLabel;
    this.get<HTMLElement>('#stage-loader').classList.add('is-hidden');

    if (updateUrl) this.updateQuery();
    const sourceMessage = world.sourceMode === 'chunks'
      ? `${map.unitType} 정적 월드 · ${world.loadedChunkCount}개 chunk 준비 완료`
      : `${map.unitType} ${world.sourceMode === 'minimap' ? '미니맵' : '절차형'} fallback으로 렌더링합니다.`;
    this.toast(sourceMessage, world.sourceMode === 'chunks' ? 'success' : 'notice');
  }

  private resetActors(): void {
    if (!this.world) return;
    const first = nearestWalkable(this.world, this.currentMap.spawn.x, this.currentMap.spawn.y);
    const second = nearestWalkable(this.world, first.x + 2, first.y + 1);
    const actor100 = this.actors.get('100');
    const actor200 = this.actors.get('200');
    if (actor100) Object.assign(actor100, first, { direction: 's', motion: 'idle', moving: false });
    if (actor200) Object.assign(actor200, second, { direction: 'sw', motion: 'idle', moving: false });
  }

  private setActiveActor(key: CharacterKey, updateUrl = true): void {
    if (!this.actors.has(key) && this.actors.size > 0) key = [...this.actors.keys()][0];
    this.activeActor = key;
    this.actorViews.forEach((view, actorKey) => view.setSelected(actorKey === key));
    this.mount.querySelectorAll<HTMLElement>('[data-actor-key]').forEach((button) => button.classList.toggle('is-active', button.dataset.actorKey === key));
    const actor = this.actors.get(key);
    const portrait = this.mount.querySelector<HTMLElement>('#active-portrait');
    if (portrait) {
      portrait.textContent = key;
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
      slot.addEventListener('click', () => this.activateHotbarSlot(Number(slot.dataset.slot)), { signal: this.abortController.signal });
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

  private activateHotbarSlot(index: number): void {
    const skillId = this.hotbar[index];
    if (!skillId) {
      this.toast(`${index + 1}번 슬롯이 비어 있습니다.`, 'notice');
      return;
    }
    this.activateSkill(skillId);
  }

  private activateSkill(skillId: string): void {
    const now = performance.now();
    const skill = this.skillById(skillId);
    const remaining = (this.cooldowns.get(skillId) || 0) - now;
    if (remaining > 0) {
      this.toast(`${skill.label} 준비 중 · ${(remaining / 1_000).toFixed(1)}초`, 'notice');
      return;
    }
    const actor = this.actors.get(this.activeActor);
    if (!actor) return;
    this.cooldowns.set(skillId, now + skill.cooldownMs);
    actor.motion = skillId === 'basic-attack' || skillId === 'common-double-arrow' ? 'attack' : 'cast';
    actor.motionUntil = now + Math.min(900, Math.max(360, skill.cooldownMs * 0.28));
    actor.moving = false;
    this.triggerEffect(skillId, actor);
    this.toast(`${actor.label} · ${skill.label}`, 'skill');
  }

  private triggerEffect(skillId: string, actor: ActorState): void {
    const layer = this.get<HTMLElement>('#effect-layer');
    const from = this.renderer.project(actor.x, actor.y);
    const other = this.actors.get(actor.key === '100' ? '200' : '100');
    const to = other ? this.renderer.project(other.x, other.y) : { x: from.x + 110, y: from.y - 22 };
    const manifestUrls = this.catalog.skills.find((skill) => skill.id === skillId)?.effectUrls || [];
    this.effectPlayer.playMany(manifestUrls, {
      direction: actor.direction,
      characterKey: actor.key,
      origin: from,
      target: to,
    });

    if (skillId === 'common-teleport' && this.world) {
      this.spawnEffect('teleport-burst', from.x, from.y, 850);
      const offsets = [[5, -3], [4, 4], [-4, 3], [-3, -4], [2, -5]];
      const destination = offsets
        .map(([dx, dy]) => ({ x: actor.x + dx, y: actor.y + dy }))
        .find((point) => isWalkable(this.world, point.x, point.y));
      if (destination) {
        actor.x = destination.x;
        actor.y = destination.y;
        const projected = this.renderer.project(actor.x, actor.y);
        this.spawnEffect('teleport-burst is-arrival', projected.x, projected.y, 850);
      }
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
    const categories = ['전체', ...new Set(options.map((option) => option.category))];
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

    const visibleOptions = options.filter((option) => this.optionCategory === '전체' || option.category === this.optionCategory);
    this.get<HTMLElement>('#option-list').innerHTML = visibleOptions.length
      ? visibleOptions.map((option) => this.optionCard(option, options)).join('')
      : '<div class="empty-options"><b>이 세대형의 옵션이 없습니다.</b><span>기본 마감 렌더를 확인해 주세요.</span></div>';

    this.get<HTMLElement>('#option-list').querySelectorAll<HTMLInputElement>('input[data-option-id]').forEach((input) => {
      input.addEventListener('change', () => {
        this.selectedOptionIds = applyOptionToggle(options, this.selectedOptionIds, input.dataset.optionId || '');
        writeSelectedOptions(this.currentMap.id, this.selectedOptionIds);
        this.canvasRenderer.setSelectedOptions(this.selectedOptionIds);
        this.threeRenderer?.setSelectedOptions(this.selectedOptionIds);
        this.renderOptions();
        this.toast('B옵션 프리뷰를 로컬에 저장했습니다.', 'success');
      }, { signal: this.abortController.signal });
    });

    const selectedOptions = options.filter((option) => this.selectedOptionIds.includes(option.id));
    this.get<HTMLElement>('#option-count').textContent = String(selectedOptions.length).padStart(2, '0');
    this.get<HTMLElement>('#option-selected-count').textContent = `${selectedOptions.length}개`;
    this.get<HTMLElement>('#option-total').innerHTML = `${numberFormat.format(calculateOptionPrice(options, this.selectedOptionIds))}<small>원</small>`;
    this.get<HTMLElement>('#selected-option-chips').innerHTML = selectedOptions.length
      ? selectedOptions.map((option) => `<span>${escapeHtml(option.label)}</span>`).join('')
      : '<span>기본 마감</span>';
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
    const actor = this.actors.get(this.activeActor);
    if (!actor || !this.world) return;
    const horizontal = Number(this.pressedKeys.has('d') || this.pressedKeys.has('arrowright')) - Number(this.pressedKeys.has('a') || this.pressedKeys.has('arrowleft'));
    const vertical = Number(this.pressedKeys.has('s') || this.pressedKeys.has('arrowdown')) - Number(this.pressedKeys.has('w') || this.pressedKeys.has('arrowup'));
    if (horizontal === 0 && vertical === 0) {
      actor.moving = false;
      if (actor.motion === 'walk') actor.motion = 'idle';
      return;
    }
    actor.direction = directionFromDelta(horizontal, vertical);
    if (time - this.lastMoveAt < MOVEMENT_INTERVAL_MS || actor.motionUntil > time) return;
    this.lastMoveAt = time;
    const nextX = actor.x + horizontal;
    const nextY = actor.y + vertical;
    if (isWalkable(this.world, nextX, nextY)) {
      actor.x = nextX;
      actor.y = nextY;
      actor.moving = true;
      actor.motion = 'walk';
    } else {
      actor.moving = false;
      this.get<HTMLElement>('#game-stage').classList.remove('hit-boundary');
      void this.get<HTMLElement>('#game-stage').offsetWidth;
      this.get<HTMLElement>('#game-stage').classList.add('hit-boundary');
    }
  }

  private readonly tick = (time: number): void => {
    if (this.destroyed) return;
    this.frameMetrics.push(time);
    this.moveActiveActor(time);

    for (const actor of this.actors.values()) {
      if (actor.motionUntil > 0 && actor.motionUntil <= time) {
        actor.motionUntil = 0;
        actor.motion = actor.moving ? 'walk' : 'idle';
      }
    }
    const active = this.actors.get(this.activeActor);
    if (active) this.renderer.follow(active);
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
    this.actorViews.forEach((view, key) => {
      const actor = this.actors.get(key);
      if (actor) view.update(actor, this.renderer.project(actor.x, actor.y), time);
    });
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
