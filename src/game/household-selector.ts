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

const FLOORS = Array.from({ length: 25 }, (_, index) => 25 - index);

function buildingColumnCount(): number {
  if (window.matchMedia('(min-width: 1280px)').matches) return 6;
  if (window.matchMedia('(min-width: 720px)').matches) return 5;
  return 4;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function floorRail(): string {
  return `<div class="household-floor-rail" aria-hidden="true">
    <span class="household-floor-rail-head">층</span>
    <div>${FLOORS.map((floor) => `<span>${floor}</span>`).join('')}</div>
    <span class="household-floor-rail-foot">TYPE</span>
  </div>`;
}

function lineCell(building: BundangBuildingV1, line: BundangHouseholdLineV1, floor: number): string {
  const isHousehold = floor >= line.firstFloor && floor <= line.lastFloor;
  const isPilotis = line.pilotisFloors.includes(floor);
  if (isHousehold) {
    const number = String(floor * 100 + line.lineId);
    const facing = line.facing === 'south-east' ? '남동향' : '남서향';
    return `<button type="button" class="household-cell unit-${line.unitType.toLowerCase()}" data-building="${building.buildingId}" data-floor="${floor}" data-line="${line.lineId}" aria-pressed="false" aria-label="${building.buildingId}동 ${number}호 ${line.unitType} ${line.planVariant}형 ${facing}"><span>${number}</span></button>`;
  }
  if (isPilotis) {
    return `<span class="household-cell is-pilotis" aria-label="${building.buildingId}동 ${floor}층 ${line.lineId}호 라인 필로티">×</span>`;
  }
  return '<span class="household-cell is-void" aria-hidden="true"></span>';
}

function buildingCard(building: BundangBuildingV1): string {
  const cells = FLOORS.flatMap((floor) => building.lines.map((line) => lineCell(building, line, floor))).join('');
  const lineLabels = building.lines.map((line) => `<span class="unit-${line.unitType.toLowerCase()}">${line.unitType}</span>`).join('');
  return `<article class="household-building-card" data-building-card="${building.buildingId}">
    <header><b>${building.buildingId}동</b><small>${building.lines.length}개 호라인</small></header>
    <div class="household-unit-grid" style="--line-count:${building.lines.length}">${cells}</div>
    <footer style="--line-count:${building.lines.length}">${lineLabels}</footer>
  </article>`;
}

function buildingRows(columnCount: number): string {
  return chunks(BUNDANG_HOUSEHOLD_CATALOG.buildings, columnCount).map((row) => `
    <section class="household-building-row" style="--building-count:${row.length}" aria-label="${row[0]?.buildingId}동부터 ${row[row.length - 1]?.buildingId}동">
      ${floorRail()}
      ${row.map(buildingCard).join('')}
    </section>
  `).join('');
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
    let columns = buildingColumnCount();
    let resizeFrame = 0;
    mount.innerHTML = `<div class="household-selector-shell">
      <header class="household-selector-topbar">
        <a class="brand" href="${resolveProjectUrl('')}" aria-label="Bunfirvil 세대 선택 홈">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
          <span><b>BUNFIRVIL</b><small>HOUSEHOLD SHOWCASE</small></span>
        </a>
        <div>
          <span class="selector-build-state"><i class="${fallback ? 'is-amber' : ''}"></i>${escapeHtml(catalog.exportId)}</span>
          <button type="button" id="selector-open-storage">저장 관리</button>
        </div>
      </header>
      <main class="household-selector-main">
        <section class="household-selector-intro">
          <p class="eyebrow">BUNDANG FIRST VILLAGE</p>
          <h1>분당퍼스트빌리지 세대 선택</h1>
          <p>동·층·호라인을 선택하면 해당 평형과 배치 방향의 검수 쇼케이스를 엽니다.</p>
          <div class="household-legend" aria-label="평형 색상 범례">
            <span class="unit-51a"><i></i>51A</span><span class="unit-55a"><i></i>55A</span><span class="unit-55b"><i></i>55B</span><span class="unit-59a"><i></i>59A</span><span class="is-pilotis"><i>×</i>필로티</span>
          </div>
        </section>
        <div id="household-building-rows" class="household-building-rows">${buildingRows(columns)}</div>
      </main>
      <aside class="household-selection-dock" aria-live="polite">
        <div><small>선택 세대</small><b id="household-selection-summary">동·층·호를 선택해 주세요.</b><span id="household-selection-source">세대 정보는 저장되거나 전송되지 않습니다.</span></div>
        <button type="button" id="household-enter" disabled>선택한 세대 쇼케이스 보기</button>
      </aside>
      ${storageDialogMarkup()}
    </div>`;

    const rows = mount.querySelector<HTMLElement>('#household-building-rows');
    const summary = mount.querySelector<HTMLElement>('#household-selection-summary');
    const source = mount.querySelector<HTMLElement>('#household-selection-source');
    const enter = mount.querySelector<HTMLButtonElement>('#household-enter');
    if (!rows || !summary || !source || !enter) throw new Error('세대 선택 화면을 구성하지 못했습니다.');

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
      summary.textContent = `${selected.buildingId}동 ${selected.householdNumber}호 · ${selected.unitType} · ${selected.planVariant}형 · ${facing}`;
      source.textContent = selected.confidence === 'pvp-authoritative' ? 'PVP 단지 배치 확정 기준' : '단지 배치도 코어·외벽 방향 기준';
      enter.disabled = false;
    };

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

    const onResize = (): void => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const nextColumns = buildingColumnCount();
        if (nextColumns === columns) return;
        columns = nextColumns;
        rows.innerHTML = buildingRows(columns);
        paintSelection();
      });
    };
    window.addEventListener('resize', onResize);

    enter.addEventListener('click', () => {
      if (!selected) return;
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(resizeFrame);
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
  });
}
