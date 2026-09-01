import { describe, expect, it } from 'vitest';
import { highlightedMessageParts } from './highlighted-message';

describe('option confirmation highlighted message', () => {
  it('선행 옵션 이름만 강조 조각으로 분리한다', () => {
    expect(highlightedMessageParts(
      '전체 침실 인피니티 도어를 선택하려면 디자인 월(거실/복도면)이 필요합니다.',
      '디자인 월(거실/복도면)',
    )).toEqual({
      before: '전체 침실 인피니티 도어를 선택하려면 ',
      highlight: '디자인 월(거실/복도면)',
      after: '이 필요합니다.',
    });
  });
});
