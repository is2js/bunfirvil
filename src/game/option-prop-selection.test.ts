import { describe, expect, it } from 'vitest';
import { associateOptionSources, optionRepresentativeProp } from './option-prop-selection';

describe('좌하단 옵션과 인게임 구성요소 연동', () => {
  it('시스템에어컨 여러 대를 하나의 선택 옵션으로 묶는다', () => {
    const props = associateOptionSources([
      { id: 'inspection-55A-system-ac-1', assetId: 'ceiling-cassette-air-conditioner', anchorId: 'options.systemAirConditioner.living' },
      { id: 'inspection-55A-system-ac-2', assetId: 'ceiling-cassette-air-conditioner', anchorId: 'options.systemAirConditioner.bedroom-1' },
    ], ['system-ac-2-general']);
    expect(props.map((prop) => prop.sourceOptionId)).toEqual(['system-ac-2-general', 'system-ac-2-general']);
    expect(optionRepresentativeProp(props, 'system-ac-2-general')?.id).toBe('inspection-55A-system-ac-1');
  });

  it('식탁일체형 아일랜드의 본체와 식탁을 같은 옵션으로 묶는다', () => {
    const props = associateOptionSources([
      { id: 'inspection-55B-kitchen-island', assetId: 'island-counter-modern', installationRole: 'kitchen-island' },
      { id: 'inspection-55B-kitchen-island-dining-table', assetId: 'dining-table-four-seat', installationRole: 'kitchen-island-dining-extension' },
    ], ['island-counter-dining-integrated']);
    expect(props.every((prop) => prop.sourceOptionId === 'island-counter-dining-integrated')).toBe(true);
  });
});
