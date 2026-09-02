import './styles/game.css';
import { BUNDANG_HOUSEHOLD_CATALOG } from './game/household-catalog';
import {
  bindHouseholdStorageControls,
  householdBuildingRows,
  householdShellHeader,
  householdStorageDialogMarkup,
} from './game/household-selector';
import { guardOperatorPage } from './shared/operator-access';

const operatorAccess = guardOperatorPage('전체 동·호 현황');
const mount = operatorAccess ? document.querySelector<HTMLElement>('#householdOverview') : null;

if (operatorAccess && !mount) throw new Error('Missing #householdOverview mount point');

function columnCount(): number {
  return window.matchMedia('(min-width: 900px)').matches ? 4 : 3;
}

let columns = columnCount();
let resizeFrame = 0;

if (mount) {
mount.innerHTML = `<div class="household-selector-shell household-overview-shell app-shell">
  ${householdShellHeader('HOUSEHOLD CATALOG V1', false, true)}
  <main class="household-selector-main">
    <section class="household-selector-intro">
      <div class="household-selector-intro-copy">
        <p class="eyebrow">HOUSEHOLD OVERVIEW</p>
        <h1>분당퍼스트빌리지 전체 동·호 현황</h1>
        <p>101~112동의 평형과 필로티를 한 화면에서 확인합니다. 정회원 가입과 동·호별 지표는 추후 이 페이지에 확장할 수 있습니다.</p>
      </div>
      <div class="household-legend" aria-label="평형 색상 범례">
        <span class="unit-51a"><i></i>51A</span><span class="unit-55a"><i></i>55A</span><span class="unit-55b"><i></i>55B</span><span class="unit-59a"><i></i>59A</span><span class="is-pilotis"><i>×</i>필로티</span>
      </div>
    </section>
    <div id="household-overview-rows" class="household-building-rows">${householdBuildingRows(BUNDANG_HOUSEHOLD_CATALOG.buildings, columns, false)}</div>
  </main>
  ${householdStorageDialogMarkup()}
</div>`;

const rows = mount.querySelector<HTMLElement>('#household-overview-rows');
bindHouseholdStorageControls(mount);

window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const nextColumns = columnCount();
    if (!rows || nextColumns === columns) return;
    columns = nextColumns;
    rows.innerHTML = householdBuildingRows(BUNDANG_HOUSEHOLD_CATALOG.buildings, columns, false);
  });
});
}
