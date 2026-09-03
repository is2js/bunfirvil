import './styles/game.css';
import { ShowcaseApp } from './game/app';

const mount = document.querySelector<HTMLElement>('#app');

if (!mount) {
  throw new Error('Missing #app mount point');
}

const app = new ShowcaseApp(mount);

app.start().catch((error: unknown) => {
  console.error(error);
  mount.innerHTML = `
    <main class="fatal-shell">
      <p class="eyebrow">BUNFIRVIL / STATIC SHOWCASE</p>
      <h1>렌더링 랩을 시작하지 못했습니다.</h1>
      <p>${error instanceof Error ? error.message : '알 수 없는 초기화 오류가 발생했습니다.'}</p>
      <button type="button" onclick="window.location.reload()">다시 불러오기</button>
    </main>
  `;
});

window.addEventListener('pagehide', (event: PageTransitionEvent) => {
  if (event.persisted) app.suspend();
  else app.destroy();
});

window.addEventListener('pageshow', (event: PageTransitionEvent) => {
  if (event.persisted) app.resume();
});
