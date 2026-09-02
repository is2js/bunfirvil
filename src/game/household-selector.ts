import { escapeHtml, resolveProjectUrl } from './base';
import type { ShowcaseCatalog } from './types';
import {
  BUNDANG_HOUSEHOLD_CATALOG,
  householdSelection,
  type BundangBuildingV1,
  type BundangHouseholdLineV1,
  type HouseholdSelectionV1,
} from './household-catalog';
import { resetAllBunfirvilLocalData } from '../shared/storage';

export const HOUSEHOLD_FLOORS = Array.from({ length: 25 }, (_, index) => 25 - index);

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function floorRail(): string {
  return `<div class="household-floor-rail" aria-hidden="true">
    <span class="household-floor-rail-head">층</span>
    <div>${HOUSEHOLD_FLOORS.map((floor) => `<span>${floor}</span>`).join('')}</div>
    <span class="household-floor-rail-foot">TYPE</span>
  </div>`;
}

function lineCell(building: BundangBuildingV1, line: BundangHouseholdLineV1, floor: number, interactive: boolean): string {
  const isHousehold = floor >= line.firstFloor && floor <= line.lastFloor;
  const isPilotis = line.pilotisFloors.includes(floor);
  if (isHousehold) {
    const number = String(floor * 100 + line.lineId);
    const facing = line.facing === 'south-east' ? '남동향' : '남서향';
    const content = `<span>${number}</span>`;
    const attributes = `class="household-cell unit-${line.unitType.toLowerCase()}" data-building="${building.buildingId}" data-floor="${floor}" data-line="${line.lineId}" aria-label="${building.buildingId}동 ${number}호 ${line.unitType} ${facing}"`;
    return interactive
      ? `<button type="button" ${attributes} aria-pressed="false">${content}</button>`
      : `<span ${attributes}>${content}</span>`;
  }
  if (isPilotis) {
    return `<span class="household-cell is-pilotis" aria-label="${building.buildingId}동 ${floor}층 ${line.lineId}호 라인 필로티">×</span>`;
  }
  return '<span class="household-cell is-void" aria-hidden="true"></span>';
}

export function householdBuildingCard(building: BundangBuildingV1, interactive = true): string {
  const cells = HOUSEHOLD_FLOORS.flatMap((floor) => building.lines.map((line) => lineCell(building, line, floor, interactive))).join('');
  const lineLabels = building.lines.map((line) => `<span class="unit-${line.unitType.toLowerCase()}">${line.unitType}</span>`).join('');
  return `<article class="household-building-card" data-building-card="${building.buildingId}">
    <header><b>${building.buildingId}동</b><small>${building.lines.length}개 호라인</small></header>
    <div class="household-unit-grid" style="--line-count:${building.lines.length}">${cells}</div>
    <footer style="--line-count:${building.lines.length}">${lineLabels}</footer>
  </article>`;
}

export function householdBuildingRows(buildings: BundangBuildingV1[], columnCount: number, interactive = true): string {
  return chunks(buildings, columnCount).map((row) => `
    <section class="household-building-row" style="--building-count:${row.length}" aria-label="${row[0]?.buildingId}동부터 ${row[row.length - 1]?.buildingId}동">
      ${floorRail()}
      ${row.map((building) => householdBuildingCard(building, interactive)).join('')}
    </section>
  `).join('');
}

function buildingPicker(): string {
  return BUNDANG_HOUSEHOLD_CATALOG.buildings.map((building) => {
    return `<button type="button" class="household-building-choice" data-choose-building="${building.buildingId}" aria-label="${building.buildingId}동 선택" aria-pressed="false">
      <span class="household-building-number"><b>${building.buildingId}</b><small>동</small></span>
    </button>`;
  }).join('');
}

export function householdStorageDialogMarkup(): string {
  return `<dialog id="selector-storage-dialog" class="storage-dialog">
    <form method="dialog">
      <button class="dialog-close" value="close" aria-label="닫기">×</button>
      <p class="eyebrow">LOCAL STORAGE</p>
      <h2>저장 관리</h2>
      <p class="storage-dialog-lead">옵션과 가구 배치는 서버가 아닌 현재 브라우저에만 저장됩니다.</p>
      <dl class="storage-key-list">
        <div><dt>옵션·검수</dt><dd>평형별 · A/B 공통</dd></div>
        <div><dt>가구 배치</dt><dd>평형별 · A/B 공통</dd></div>
        <div><dt>건축 검수</dt><dd>평형·A/B별</dd></div>
        <div><dt>핫바</dt><dd>전체 맵 공통</dd></div>
      </dl>
      <a class="storage-guide-link" href="${resolveProjectUrl('guides/?guide=local-storage')}">로컬 저장·초기화 가이드 보기 →</a>
      <button type="button" id="selector-reset-all" class="storage-danger-button">Bunfirvil 전체 로컬 데이터 초기화</button>
      <output id="selector-storage-status" class="storage-dialog-status" aria-live="polite"></output>
    </form>
  </dialog>`;
}

export function bindHouseholdStorageControls(mount: HTMLElement): void {
  const storageDialog = mount.querySelector<HTMLDialogElement>('#selector-storage-dialog');
  const storageStatus = mount.querySelector<HTMLOutputElement>('#selector-storage-status');
  mount.querySelector<HTMLButtonElement>('#selector-open-storage')?.addEventListener('click', () => storageDialog?.showModal());
  mount.querySelector<HTMLButtonElement>('#selector-reset-all')?.addEventListener('click', () => {
    if (!window.confirm('Bunfirvil의 모든 평형 옵션·가구, 검수 메모, 건축 기록과 핫바를 초기화할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    const result = resetAllBunfirvilLocalData();
    if (storageStatus) storageStatus.textContent = `${result.removedKeys.length}개의 Bunfirvil 저장 항목을 초기화했습니다.`;
  });
}

export function householdShellHeader(exportId: string, fallback = false, overview = false): string {
  const householdHref = overview ? resolveProjectUrl('') : resolveProjectUrl('households/');
  const householdLabel = overview ? '세대 선택' : '전체 동·호 현황';
  return `<header class="topbar household-topbar">
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
    <div class="household-header-actions" aria-label="세대 메뉴">
      <a class="household-header-action" href="${householdHref}" aria-label="${householdLabel}"><span>${householdLabel}</span><small aria-hidden="true">${overview ? '선택' : '현황'}</small></a>
      <button type="button" id="selector-open-storage" class="household-header-action" aria-label="저장 관리"><span>저장 관리</span><small aria-hidden="true">저장</small></button>
      <div class="build-chip" title="현재 정적 자산 스냅샷">
        <span class="status-dot ${fallback ? 'is-amber' : ''}"></span>
        <span><small>STATIC BUILD</small><b>${escapeHtml(exportId)}</b></span>
      </div>
    </div>
  </header>
  <div class="serverless-banner" role="status">
    <span class="banner-pulse" aria-hidden="true"></span>
    <b>프론트엔드 로컬 데모</b>
    <span>서버 판정 없음</span>
    <i></i>
    <span>데이터는 이 브라우저에만 저장됩니다.</span>
  </div>`;
}

async function verifyHouseholdNickname(nickname: string): Promise<boolean> {
  await new Promise((resolve) => window.setTimeout(resolve, 160));
  return nickname.trim().length > 0;
}

export function waitForHouseholdSelection(
  mount: HTMLElement,
  catalog: ShowcaseCatalog,
  fallback: boolean,
): Promise<HouseholdSelectionV1> {
  return new Promise((resolve) => {
    let selected: HouseholdSelectionV1 | null = null;
    mount.innerHTML = `<div class="household-selector-shell app-shell">
      ${householdShellHeader(catalog.exportId, fallback)}
      <main class="household-selector-main">
        <section class="household-selector-intro" id="household-selector-intro">
          <div class="household-selector-intro-copy">
            <nav class="household-wizard-progress" aria-label="세대 선택 단계">
              <span id="household-step-building" class="is-current" aria-current="step"><i>1</i><b>동 선택</b></span>
              <em aria-hidden="true"></em>
              <span id="household-step-unit"><i>2</i><b>세대 선택</b></span>
              <em aria-hidden="true"></em>
              <span id="household-step-nickname"><i>3</i><b>닉네임 입력</b></span>
            </nav>
            <p class="eyebrow">BUNDANG FIRST VILLAGE</p>
            <h1 id="household-selector-title">분당퍼스트빌리지 동 선택</h1>
            <p id="household-selector-description">먼저 확인할 동을 선택해 주세요. 다음 화면에서 해당 동의 세대를 선택할 수 있습니다.</p>
          </div>
          <div class="household-legend" id="household-selector-legend" aria-label="평형 색상 범례" hidden>
            <span class="unit-51a"><i></i>51A</span><span class="unit-55a"><i></i>55A</span><span class="unit-55b"><i></i>55B</span><span class="unit-59a"><i></i>59A</span><span class="is-pilotis"><i>×</i>필로티</span>
          </div>
        </section>
        <section id="household-building-picker" class="household-building-picker-panel">
          <div class="household-building-picker">${buildingPicker()}</div>
        </section>
        <section id="household-building-detail" class="household-building-detail" hidden>
          <header class="household-building-detail-head">
            <button type="button" id="household-building-back" class="household-building-back">← 동 다시 선택</button>
            <span id="household-selected-building" class="household-selected-building"></span>
          </header>
          <div id="household-building-rows" class="household-building-rows"></div>
        </section>
        <section id="household-nickname-stage" class="household-nickname-stage" hidden>
          <header class="household-nickname-stage-head">
            <button type="button" id="household-unit-back" class="household-building-back">← 세대 다시 선택</button>
            <span id="household-nickname-building" class="household-selected-building"></span>
          </header>
          <div class="household-nickname-card">
            <p class="eyebrow">HOUSEHOLD NICKNAME</p>
            <p>선택한 세대에서 사용할 닉네임을 입력해 주세요. 현재 서버리스 데모에서는 입력 형식만 확인합니다.</p>
            <div class="household-nickname-controls">
              <label><span>닉네임</span><input id="household-nickname" type="text" maxlength="20" autocomplete="off" placeholder="닉네임 입력" /></label>
              <button type="button" id="household-verify-nickname" disabled>인증 확인</button>
            </div>
            <output id="household-nickname-status" aria-live="polite"></output>
          </div>
        </section>
      </main>
      <aside class="household-selection-dock" id="household-selection-dock" aria-live="polite" hidden>
        <div><small>선택 세대</small><b id="household-selection-summary">동·층·호를 선택해 주세요.</b></div>
        <button type="button" id="household-enter" disabled>선택한 세대 쇼케이스 보기</button>
      </aside>
      ${householdStorageDialogMarkup()}
    </div>`;

    const picker = mount.querySelector<HTMLElement>('#household-building-picker');
    const detail = mount.querySelector<HTMLElement>('#household-building-detail');
    const nicknameStage = mount.querySelector<HTMLElement>('#household-nickname-stage');
    const rows = mount.querySelector<HTMLElement>('#household-building-rows');
    const title = mount.querySelector<HTMLElement>('#household-selector-title');
    const description = mount.querySelector<HTMLElement>('#household-selector-description');
    const legend = mount.querySelector<HTMLElement>('#household-selector-legend');
    const buildingStep = mount.querySelector<HTMLElement>('#household-step-building');
    const unitStep = mount.querySelector<HTMLElement>('#household-step-unit');
    const nicknameStep = mount.querySelector<HTMLElement>('#household-step-nickname');
    const selectedBuilding = mount.querySelector<HTMLElement>('#household-selected-building');
    const nicknameBuilding = mount.querySelector<HTMLElement>('#household-nickname-building');
    const dock = mount.querySelector<HTMLElement>('#household-selection-dock');
    const summary = mount.querySelector<HTMLElement>('#household-selection-summary');
    const enter = mount.querySelector<HTMLButtonElement>('#household-enter');
    const nicknameInput = mount.querySelector<HTMLInputElement>('#household-nickname');
    const verifyNickname = mount.querySelector<HTMLButtonElement>('#household-verify-nickname');
    const nicknameStatus = mount.querySelector<HTMLOutputElement>('#household-nickname-status');
    if (!picker || !detail || !nicknameStage || !rows || !title || !description || !legend || !buildingStep || !unitStep || !nicknameStep || !selectedBuilding || !nicknameBuilding || !dock || !summary || !enter || !nicknameInput || !verifyNickname || !nicknameStatus) throw new Error('세대 선택 화면을 구성하지 못했습니다.');
    let chosenBuildingId: string | null = null;
    let nickname = '';
    let nicknameVerified = false;

    const paintBuildingChoice = (): void => {
      picker.querySelectorAll<HTMLButtonElement>('[data-choose-building]').forEach((button) => {
        const active = button.dataset.chooseBuilding === chosenBuildingId;
        button.classList.toggle('is-selected', active);
        button.setAttribute('aria-pressed', String(active));
      });
    };

    const animatePanel = (panel: HTMLElement): void => {
      panel.classList.remove('is-entering');
      requestAnimationFrame(() => panel.classList.add('is-entering'));
    };

    const updateSelectionSummary = (): void => {
      if (!selected) {
        summary.textContent = '층·호를 선택해 주세요.';
        enter.disabled = true;
        return;
      }
      const facing = selected.facing === 'south-east' ? '남동향' : '남서향';
      const nicknameText = nickname.trim() ? ` · ${nickname.trim()}` : '';
      summary.textContent = `${selected.buildingId}동 ${selected.householdNumber}호 · ${selected.floor}층 · ${selected.unitType}${nicknameText} · ${facing}`;
      enter.disabled = !nicknameVerified;
    };

    const resetNicknameVerification = (clearNickname: boolean): void => {
      nicknameVerified = false;
      if (clearNickname) {
        nickname = '';
        nicknameInput.value = '';
      }
      verifyNickname.textContent = '인증 확인';
      verifyNickname.disabled = nickname.trim().length === 0;
      verifyNickname.removeAttribute('aria-busy');
      nicknameStatus.textContent = '';
      updateSelectionSummary();
    };

    const paintSelection = (): void => {
      mount.querySelectorAll<HTMLButtonElement>('.household-cell[data-building]').forEach((button) => {
        const active = Boolean(selected
          && button.dataset.building === selected.buildingId
          && Number(button.dataset.floor) === selected.floor
          && Number(button.dataset.line) === selected.lineId);
        button.classList.toggle('is-selected', active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (!selected) return;
      updateSelectionSummary();
    };

    const showBuildingPicker = (): void => {
      selected = null;
      resetNicknameVerification(true);
      picker.hidden = false;
      detail.hidden = true;
      nicknameStage.hidden = true;
      dock.hidden = true;
      legend.hidden = true;
      title.textContent = '분당퍼스트빌리지 동 선택';
      description.textContent = '먼저 확인할 동을 선택해 주세요. 다음 화면에서 해당 동의 세대를 선택할 수 있습니다.';
      buildingStep.classList.add('is-current');
      buildingStep.classList.toggle('is-complete', Boolean(chosenBuildingId));
      buildingStep.setAttribute('aria-current', 'step');
      unitStep.classList.remove('is-current');
      unitStep.classList.remove('is-complete');
      unitStep.removeAttribute('aria-current');
      nicknameStep.classList.remove('is-current', 'is-complete');
      nicknameStep.removeAttribute('aria-current');
      paintBuildingChoice();
      animatePanel(picker);
      enter.disabled = true;
    };

    const showBuilding = (buildingId: string, pushHistory: boolean): void => {
      const building = BUNDANG_HOUSEHOLD_CATALOG.buildings.find((entry) => entry.buildingId === buildingId);
      if (!building) return;
      chosenBuildingId = buildingId;
      selected = null;
      resetNicknameVerification(true);
      picker.hidden = true;
      detail.hidden = false;
      nicknameStage.hidden = true;
      dock.hidden = false;
      legend.hidden = false;
      rows.innerHTML = `<section class="household-building-row is-single" data-line-count="${building.lines.length}" style="--building-count:1" aria-label="${building.buildingId}동 세대">${floorRail()}${householdBuildingCard(building)}</section>`;
      title.textContent = `${building.buildingId}동 세대 선택`;
      description.textContent = '층과 호를 선택하면 평형과 향을 확인한 뒤 쇼케이스로 이동할 수 있습니다.';
      selectedBuilding.textContent = `${building.buildingId}동 선택됨`;
      buildingStep.classList.remove('is-current');
      buildingStep.classList.add('is-complete');
      buildingStep.removeAttribute('aria-current');
      unitStep.classList.add('is-current');
      unitStep.classList.remove('is-complete');
      unitStep.setAttribute('aria-current', 'step');
      nicknameStep.classList.remove('is-current', 'is-complete');
      nicknameStep.removeAttribute('aria-current');
      paintBuildingChoice();
      animatePanel(detail);
      updateSelectionSummary();
      if (pushHistory) history.pushState({ householdBuilding: buildingId }, '', `#building=${buildingId}`);
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    };

    const showNicknameStage = (): void => {
      if (!selected || !chosenBuildingId) return;
      picker.hidden = true;
      detail.hidden = true;
      nicknameStage.hidden = false;
      dock.hidden = false;
      legend.hidden = true;
      title.textContent = '닉네임 입력';
      description.textContent = '선택한 세대에서 사용할 닉네임을 입력하고 인증을 확인해 주세요.';
      nicknameBuilding.textContent = `${selected.buildingId}동 ${selected.householdNumber}호 선택됨`;
      buildingStep.classList.remove('is-current');
      buildingStep.classList.add('is-complete');
      buildingStep.removeAttribute('aria-current');
      unitStep.classList.remove('is-current');
      unitStep.classList.add('is-complete');
      unitStep.removeAttribute('aria-current');
      nicknameStep.classList.add('is-current');
      nicknameStep.classList.remove('is-complete');
      nicknameStep.setAttribute('aria-current', 'step');
      animatePanel(nicknameStage);
      updateSelectionSummary();
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        nicknameInput.focus();
      });
    };

    picker.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-choose-building]');
      if (button?.dataset.chooseBuilding) showBuilding(button.dataset.chooseBuilding, true);
    });

    rows.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.household-cell[data-building]');
      if (!button) return;
      selected = householdSelection(
        button.dataset.building || '',
        Number(button.dataset.floor),
        Number(button.dataset.line),
        catalog.maps,
      );
      resetNicknameVerification(false);
      paintSelection();
      showNicknameStage();
    });

    nicknameInput.addEventListener('input', () => {
      nickname = nicknameInput.value;
      nicknameVerified = false;
      verifyNickname.textContent = '인증 확인';
      verifyNickname.disabled = nickname.trim().length === 0;
      verifyNickname.removeAttribute('aria-busy');
      nicknameStatus.textContent = nickname.trim() ? '인증 확인이 필요합니다.' : '';
      updateSelectionSummary();
    });

    verifyNickname.addEventListener('click', async () => {
      const candidate = nickname.trim();
      if (!candidate) return;
      verifyNickname.disabled = true;
      verifyNickname.setAttribute('aria-busy', 'true');
      nicknameStatus.textContent = '닉네임을 확인하고 있습니다.';
      const verified = await verifyHouseholdNickname(candidate);
      if (nickname.trim() !== candidate || !selected) return;
      nicknameVerified = verified;
      verifyNickname.removeAttribute('aria-busy');
      verifyNickname.textContent = verified ? '인증 완료' : '다시 확인';
      verifyNickname.disabled = false;
      nicknameStatus.textContent = verified ? '입력 확인이 완료되었습니다.' : '닉네임을 다시 확인해 주세요.';
      updateSelectionSummary();
    });

    const onPopState = (): void => {
      const buildingId = new URLSearchParams(window.location.hash.slice(1)).get('building');
      if (buildingId) showBuilding(buildingId, false);
      else showBuildingPicker();
    };
    window.addEventListener('popstate', onPopState);
    mount.querySelector<HTMLButtonElement>('#household-building-back')?.addEventListener('click', () => {
      if (window.location.hash.startsWith('#building=')) history.back();
      else showBuildingPicker();
    });
    mount.querySelector<HTMLButtonElement>('#household-unit-back')?.addEventListener('click', () => {
      if (chosenBuildingId) showBuilding(chosenBuildingId, false);
    });

    enter.addEventListener('click', () => {
      if (!selected || !nicknameVerified) return;
      window.removeEventListener('popstate', onPopState);
      resolve(selected);
    });

    bindHouseholdStorageControls(mount);

    const initialBuilding = new URLSearchParams(window.location.hash.slice(1)).get('building');
    if (initialBuilding) showBuilding(initialBuilding, false);
  });
}
