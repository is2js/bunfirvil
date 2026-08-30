import { loadCatalog } from './manage/catalog';
import { InteriorEditor } from './manage/interior-editor';
import { loadReview } from './manage/review-store';

async function start(): Promise<void> {
  const status = document.getElementById('editorStatus');
  try {
    const catalog = await loadCatalog();
    const editor = new InteriorEditor(catalog, (mapId) => loadReview(mapId, catalog).review.selectedOptionIds);
    await editor.initialize();
    document.documentElement.dataset.interiorAdminReady = 'true';
  } catch (error) {
    if (status) status.textContent = error instanceof Error ? error.message : '인테리어 관리자 초기화에 실패했습니다.';
  }
}

void start();
