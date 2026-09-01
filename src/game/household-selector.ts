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
    const types = [...new Set(building.lines.map((line) => line.unitType))];
    const householdCount = building.lines.reduce((sum, line) => sum + line.lastFloor - line.firstFloor + 1, 0);
    return `<button type="button" class="household-building-choice" data-choose-building="${building.buildingId}">
      <span class="household-building-number"><b>${building.buildingId}</b><small>동</small></span>
      <span class="household-building-meta">${building.lines.length}개 호라인 · ${householdCount}세대</span>
      <span class="household-building-types">${types.map((type) => `<i class="unit-${type.toLowerCase()}">${type}</i>`).join('')}</span>
      <strong>세대 선택</strong>
    </button>`;
  }).join('');
}

function storageDialogMarkup(): string {
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

export function waitForHouseholdSelection(
  mount: HTMLElement,
  catalog: ShowcaseCatalog,
  fallback: boolean,
): Promise<HouseholdSelectionV1> {
  return new Promise((resolve) => {
    let selected: HouseholdSelectionV1 | null = null;
    mount.innerHTML = `<div class="household-selector-shell">
      <header class="household-selector-topbar">
        <a class="brand" href="${resolveProjectUrl('')}" aria-label="Bunfirvil 세대 선택 홈">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
          <span><b>BUNFIRVIL</b><small>HOUSEHOLD SHOWCASE</small></span>
        </a>
        <div>
          <span class="selector-build-state"><i class="${fallback ? 'is-amber' : ''}"></i>${escapeHtml(catalog.exportId)}</span>
          <a class="selector-overview-link" href="${resolveProjectUrl('households/')}">전체 동·호 현황</a>
          <button type="button" id="selector-open-storage">저장 관리</button>
        </div>
      </header>
      <main class="household-selector-main">
        <section class="household-selector-intro" id="household-selector-intro">
          <p class="eyebrow">BUNDANG FIRST VILLAGE</p>
          <h1 id="household-selector-title">분당퍼스트빌리지 동 선택</h1>
          <p id="household-selector-description">먼저 확인할 동을 선택해 주세요. 다음 화면에서 해당 동의 세대를 선택할 수 있습니다.</p>
          <div class="household-legend" aria-label="평형 색상 범례">
            <span class="unit-51a"><i></i>51A</span><span class="unit-55a"><i></i>55A</span><span class="unit-55b"><i></i>55B</span><span class="unit-59a"><i></i>59A</span><span class="is-pilotis"><i>×</i>필로티</span>
          </div>
        </section>
        <div id="household-building-picker" class="household-building-picker">${buildingPicker()}</div>
        <section id="household-building-detail" class="household-building-detail" hidden>
          <button type="button" id="household-building-back" class="household-building-back">← 동 다시 선택</button>
          <div id="household-building-rows" class="household-building-rows"></div>
        </section>
      </main>
      <aside class="household-selection-dock" id="household-selection-dock" aria-live="polite" hidden>
        <div><small>선택 세대</small><b id="household-selection-summary">동·층·호를 선택해 주세요.</b></div>
        <button type="button" id="household-enter" disabled>선택한 세대 쇼케이스 보기</button>
      </aside>
      ${storageDialogMarkup()}
    </div>`;

    const picker = mount.querySelector<HTMLElement>('#household-building-picker');
    const detail = mount.querySelector<HTMLElement>('#household-building-detail');
    const rows = mount.querySelector<HTMLElement>('#household-building-rows');
    const title = mount.querySelector<HTMLElement>('#household-selector-title');
    const description = mount.querySelector<HTMLElement>('#household-selector-description');
    const dock = mount.querySelector<HTMLElement>('#household-selection-dock');
    const summary = mount.querySelector<HTMLElement>('#household-selection-summary');
    const enter = mount.querySelector<HTMLButtonElement>('#household-enter');
    if (!picker || !detail || !rows || !title || !description || !dock || !summary || !enter) throw new Error('세대 선택 화면을 구성하지 못했습니다.');

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
      const facing = selected.facing === 'south-east' ? '남동향' : '남서향';
      summary.textContent = `${selected.buildingId}동 ${selected.householdNumber}호 · ${selected.unitType} · ${facing}`;
      enter.disabled = false;
    };

    const showBuildingPicker = (): void => {
      selected = null;
      picker.hidden = false;
      detail.hidden = true;
      dock.hidden = true;
      title.textContent = '분당퍼스트빌리지 동 선택';
      description.textContent = '먼저 확인할 동을 선택해 주세요. 다음 화면에서 해당 동의 세대를 선택할 수 있습니다.';
      enter.disabled = true;
    };

    const showBuilding = (buildingId: string, pushHistory: boolean): void => {
      const building = BUNDANG_HOUSEHOLD_CATALOG.buildings.find((entry) => entry.buildingId === buildingId);
      if (!building) return;
      selected = null;
      picker.hidden = true;
      detail.hidden = false;
      dock.hidden = false;
      rows.innerHTML = `<section class="household-building-row is-single" style="--building-count:1" aria-label="${building.buildingId}동 세대">${floorRail()}${householdBuildingCard(building)}</section>`;
      title.textContent = `${building.buildingId}동 세대 선택`;
      description.textContent = '층과 호를 선택하면 평형과 향을 확인한 뒤 쇼케이스로 이동할 수 있습니다.';
      summary.textContent = '층·호를 선택해 주세요.';
      enter.disabled = true;
      if (pushHistory) history.pushState({ householdBuilding: buildingId }, '', `#building=${buildingId}`);
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
      paintSelection();
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

    enter.addEventListener('click', () => {
      if (!selected) return;
      window.removeEventListener('popstate', onPopState);
      resolve(selected);
    });

    const storageDialog = mount.querySelector<HTMLDialogElement>('#selector-storage-dialog');
    const storageStatus = mount.querySelector<HTMLOutputElement>('#selector-storage-status');
    mount.querySelector<HTMLButtonElement>('#selector-open-storage')?.addEventListener('click', () => storageDialog?.showModal());
    mount.querySelector<HTMLButtonElement>('#selector-reset-all')?.addEventListener('click', () => {
      if (!window.confirm('Bunfirvil의 모든 평형 옵션·가구, 검수 메모, 건축 기록과 핫바를 초기화할까요? 이 작업은 되돌릴 수 없습니다.')) return;
      const result = resetAllBunfirvilLocalData();
      if (storageStatus) storageStatus.textContent = `${result.removedKeys.length}개의 Bunfirvil 저장 항목을 초기화했습니다.`;
    });

    const initialBuilding = new URLSearchParams(window.location.hash.slice(1)).get('building');
    if (initialBuilding) showBuilding(initialBuilding, false);
  });
}
