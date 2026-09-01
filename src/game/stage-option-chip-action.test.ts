import { describe, expect, it } from 'vitest';
import { stageOptionChipActionFromPath } from './stage-option-chip-action';

describe('stage option chip click action', () => {
  it('본문과 바깥 span 테두리를 모두 옵션 선택으로 처리한다', () => {
    const chip = { dataset: { stageOptionSelect: 'system-ac-2-general' } };
    const body = { dataset: { stageOptionSelect: 'system-ac-2-general' } };
    expect(stageOptionChipActionFromPath([{}, body, chip])).toEqual({
      kind: 'select', optionId: 'system-ac-2-general',
    });
    expect(stageOptionChipActionFromPath([chip])).toEqual({
      kind: 'select', optionId: 'system-ac-2-general',
    });
  });

  it('X와 chip 선택 영역이 같은 경로에 있어도 삭제를 우선한다', () => {
    expect(stageOptionChipActionFromPath([
      { dataset: { stageOptionRemove: 'system-ac-2-general' } },
      { dataset: { stageOptionSelect: 'system-ac-2-general' } },
    ])).toEqual({ kind: 'remove', optionId: 'system-ac-2-general' });
  });
});
