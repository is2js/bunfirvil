import { describe, expect, it } from 'vitest';
import { centeredScrollTop } from './palette-scroll';

describe('palette centered scroll', () => {
  it('선택 카드를 중앙으로 옮기고 처음·끝 범위를 넘지 않는다', () => {
    expect(centeredScrollTop({
      scrollTop: 120, viewportTop: 100, viewportHeight: 300, contentHeight: 1200,
      itemTop: 550, itemHeight: 100,
    })).toBe(470);
    expect(centeredScrollTop({
      scrollTop: 0, viewportTop: 100, viewportHeight: 300, contentHeight: 1200,
      itemTop: 110, itemHeight: 100,
    })).toBe(0);
    expect(centeredScrollTop({
      scrollTop: 850, viewportTop: 100, viewportHeight: 300, contentHeight: 1200,
      itemTop: 500, itemHeight: 100,
    })).toBe(900);
  });
});
