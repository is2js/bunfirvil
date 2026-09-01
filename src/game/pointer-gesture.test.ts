import { describe, expect, it } from 'vitest';
import { isMapPanDrag, MAP_PAN_DRAG_THRESHOLD_PX } from './pointer-gesture';

describe('메인 맵 포인터 제스처', () => {
  it('짧은 클릭 흔들림은 선택으로, 임계값 이상의 이동은 화면 드래그로 분류한다', () => {
    expect(isMapPanDrag(100, 100, 103, 104)).toBe(false);
    expect(isMapPanDrag(100, 100, 100 + MAP_PAN_DRAG_THRESHOLD_PX, 100)).toBe(true);
  });
});
