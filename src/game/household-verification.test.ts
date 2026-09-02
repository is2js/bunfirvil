import { describe, expect, it, vi } from 'vitest';
import {
  HOUSEHOLD_VERIFICATION_SESSION_KEY,
  HouseholdVerificationError,
  clearHouseholdVerificationSession,
  householdVerificationIsOperator,
  normalizeHouseholdBuilding,
  normalizeHouseholdNickname,
  normalizeHouseholdUnitType,
  parseHouseholdVerificationConfig,
  readHouseholdVerificationSession,
  requestHouseholdVerification,
  verifyHousehold,
  writeHouseholdVerificationSession,
  type HouseholdVerificationConfigV1,
} from './household-verification';

const config: HouseholdVerificationConfigV1 = {
  schemaVersion: 1,
  enabled: true,
  provider: 'google-apps-script',
  endpoint: 'https://script.google.com/macros/s/test-bunfirvil/exec',
  timeoutMs: 8_000,
};

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe('household Google Sheet verification', () => {
  it('normalizes building, unit type, and nickname without storing household details', () => {
    expect(normalizeHouseholdBuilding(' ０１０５동 ')).toBe('105');
    expect(normalizeHouseholdUnitType(' ５５ａ ')).toBe('55A');
    expect(normalizeHouseholdNickname('  Ａbc 이웃  ')).toBe('Abc 이웃');
    expect(normalizeHouseholdNickname('Abc 이웃')).not.toBe(normalizeHouseholdNickname('abc이웃'));
  });

  it('accepts only a bounded HTTPS runtime configuration', () => {
    expect(parseHouseholdVerificationConfig(config)).toEqual(config);
    expect(() => parseHouseholdVerificationConfig({ ...config, endpoint: 'http://example.test/exec' })).toThrow(HouseholdVerificationError);
    expect(() => parseHouseholdVerificationConfig({ ...config, timeoutMs: 999 })).toThrow(HouseholdVerificationError);
  });

  it('posts the normalized triple without floor or household number', async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        schemaVersion: 1,
        action: 'verifyHousehold',
        buildingId: '105',
        unitType: '55A',
        nickname: '피치',
      });
      return new Response(JSON.stringify({ schemaVersion: 1, ok: true, verified: true, operator: false, requested: false, status: 'verified' }));
    }) as unknown as typeof fetch;
    await expect(verifyHousehold(config, { buildingId: '105동', unitType: '55a', nickname: ' 피치 ' }, fetchMock))
      .resolves.toMatchObject({ verified: true, operator: false, status: 'verified' });
  });

  it('uses a separate request action and keeps a requested response unverified', async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).action).toBe('requestHouseholdVerification');
      return new Response(JSON.stringify({ schemaVersion: 1, ok: true, verified: false, operator: false, requested: true, status: 'requested' }));
    }) as unknown as typeof fetch;
    await expect(requestHouseholdVerification(config, { buildingId: '105', unitType: '55A', nickname: '피치' }, fetchMock))
      .resolves.toMatchObject({ verified: false, requested: true, status: 'requested' });
  });

  it('fails closed for an invalid response', async () => {
    const invalidFetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    await expect(verifyHousehold(config, { buildingId: '105', unitType: '55A', nickname: '피치' }, invalidFetch))
      .rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('stores only provider, timestamp, and role for the current tab', () => {
    const storage = new MemoryStorage();
    writeHouseholdVerificationSession('operator', storage, 1_789_000_000_000);
    const raw = storage.getItem(HOUSEHOLD_VERIFICATION_SESSION_KEY) || '';
    expect(raw).toBe('{"schemaVersion":1,"provider":"google-apps-script","verifiedAt":1789000000000,"role":"operator"}');
    expect(raw).not.toMatch(/105|55A|2501|피치/);
    expect(householdVerificationIsOperator(storage)).toBe(true);
    expect(readHouseholdVerificationSession(storage)?.role).toBe('operator');
    clearHouseholdVerificationSession(storage);
    expect(readHouseholdVerificationSession(storage)).toBeNull();
  });
});
