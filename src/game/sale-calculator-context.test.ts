import { describe, expect, it } from 'vitest';
import {
  SALE_CALCULATOR_CONTEXT_SESSION_KEY,
  clearSaleCalculatorContext,
  readSaleCalculatorHouseholdContext,
  readSaleCalculatorLaunchContext,
  saleCalculatorPriceFloorBand,
  writeSaleCalculatorHouseholdContext,
  writeSaleCalculatorLaunchContext,
} from './sale-calculator-context';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe('분양가 계산기 세션 컨텍스트', () => {
  it.each([
    [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5+'], [25, '5+'],
  ] as const)('실제 %s층은 가격 구간 %s으로 변환한다', (floor, expected) => {
    expect(saleCalculatorPriceFloorBand(floor)).toBe(expected);
  });

  it('0층·음수·소수 층은 가격 구간으로 변환하거나 저장하지 않는다', () => {
    const storage = new MemoryStorage();
    expect(() => saleCalculatorPriceFloorBand(0)).toThrow();
    expect(() => saleCalculatorPriceFloorBand(-1)).toThrow();
    expect(writeSaleCalculatorHouseholdContext('55A', 1.5, storage)).toBeNull();
    expect(storage.getItem(SALE_CALCULATOR_CONTEXT_SESSION_KEY)).toBeNull();
  });

  it('인증 세대에서는 타입과 가격 층 구간만 저장한다', () => {
    const storage = new MemoryStorage();
    writeSaleCalculatorHouseholdContext('55B', 19, storage);

    expect(readSaleCalculatorHouseholdContext(storage)).toEqual({ schemaVersion: 1, unitType: '55B', priceFloorBand: '5+' });
    const raw = storage.getItem(SALE_CALCULATOR_CONTEXT_SESSION_KEY) || '';
    expect(raw).not.toMatch(/105|1903|피치|19/);
    expect(raw).toBe('{"schemaVersion":1,"unitType":"55B","priceFloorBand":"5+"}');
  });

  it('옵션 스냅샷과 동일 출처 복귀 URL만 기록하고 외부 URL은 거부한다', () => {
    const storage = new MemoryStorage();
    writeSaleCalculatorHouseholdContext('55B', 5, storage);
    expect(writeSaleCalculatorLaunchContext({
      schemaVersion: 1,
      applicantRoute: 'pre-subscription',
      optionIds: ['design-wall', 'design-wall', 'minus-option'],
      returnUrl: '/bunfirvil/?map=bundang-first-village-55b-prototype&variant=B',
    }, storage)).toEqual({
      schemaVersion: 1,
      unitType: '55B',
      priceFloorBand: '5+',
      applicantRoute: 'pre-subscription',
      optionIds: ['design-wall', 'minus-option'],
      returnUrl: '/bunfirvil/?map=bundang-first-village-55b-prototype&variant=B',
    });
    expect(readSaleCalculatorLaunchContext(storage)?.optionIds).toEqual(['design-wall', 'minus-option']);
    expect(storage.getItem(SALE_CALCULATOR_CONTEXT_SESSION_KEY)).not.toMatch(/105|1903|피치/);
    expect(writeSaleCalculatorLaunchContext({
      schemaVersion: 1,
      applicantRoute: 'main-subscription',
      optionIds: ['design-wall'],
      returnUrl: 'https://example.test/',
    }, storage)).toBeNull();
    expect(writeSaleCalculatorLaunchContext({
      schemaVersion: 1,
      applicantRoute: 'main-subscription',
      optionIds: [],
      returnUrl: '/bunfirvil/',
    }, storage)).toBeNull();
  });

  it('세대 다시 선택 시 계산기 세션 항목을 제거한다', () => {
    const storage = new MemoryStorage();
    writeSaleCalculatorHouseholdContext('51A', 4, storage);
    writeSaleCalculatorLaunchContext({
      schemaVersion: 1,
      applicantRoute: 'main-subscription',
      optionIds: ['floor-wide'],
      returnUrl: '/bunfirvil/',
    }, storage);
    clearSaleCalculatorContext(storage);
    expect(storage.getItem(SALE_CALCULATOR_CONTEXT_SESSION_KEY)).toBeNull();
  });

  it('지원하지 않는 타입과 개인정보가 섞인 컨텍스트를 거부한다', () => {
    const storage = new MemoryStorage();
    expect(writeSaleCalculatorHouseholdContext('84A', 5, storage)).toBeNull();
    storage.setItem(SALE_CALCULATOR_CONTEXT_SESSION_KEY, JSON.stringify({
      schemaVersion: 1, unitType: '55A', priceFloorBand: '5+', buildingId: '105', householdNumber: '1903', nickname: '피치',
    }));
    expect(readSaleCalculatorHouseholdContext(storage)).toEqual({ schemaVersion: 1, unitType: '55A', priceFloorBand: '5+' });
    expect(storage.getItem(SALE_CALCULATOR_CONTEXT_SESSION_KEY)).toBe('{"schemaVersion":1,"unitType":"55A","priceFloorBand":"5+"}');
  });

  it('복귀 URL은 쇼케이스 경로와 허용된 쿼리만 남긴다', () => {
    const storage = new MemoryStorage();
    writeSaleCalculatorHouseholdContext('55A', 5, storage);
    expect(writeSaleCalculatorLaunchContext({
      schemaVersion: 1,
      applicantRoute: 'main-subscription',
      optionIds: ['design-wall'],
      returnUrl: '/bunfirvil/?map=bundang-first-village-55a-prototype&actor=200&variant=A&nickname=피치#105-1903',
    }, storage)?.returnUrl).toBe('/bunfirvil/?map=bundang-first-village-55a-prototype&actor=200&variant=A');
    expect(storage.getItem(SALE_CALCULATOR_CONTEXT_SESSION_KEY)).not.toMatch(/피치|105|1903/u);
  });

  it('개인정보처럼 보이는 옵션 ID와 알 수 없는 맵은 거부하고 원문을 제거한다', () => {
    const storage = new MemoryStorage();
    storage.setItem(SALE_CALCULATOR_CONTEXT_SESSION_KEY, JSON.stringify({
      schemaVersion: 1,
      unitType: '55A',
      priceFloorBand: '5+',
      applicantRoute: 'main-subscription',
      optionIds: ['피치'],
      returnUrl: '/bunfirvil/?map=105-1903',
    }));
    expect(readSaleCalculatorLaunchContext(storage)).toBeNull();
    expect(storage.getItem(SALE_CALCULATOR_CONTEXT_SESSION_KEY)).toBeNull();
  });
});
