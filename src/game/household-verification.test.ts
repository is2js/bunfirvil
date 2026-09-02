import { describe, expect, it, vi } from 'vitest';
import {
  HOUSEHOLD_VERIFICATION_SESSION_KEY,
  HouseholdVerificationError,
  clearHouseholdVerificationSession,
  normalizeHouseholdBuilding,
  normalizeHouseholdNickname,
  normalizeHouseholdNumber,
  parseHouseholdVerificationConfig,
  readHouseholdVerificationSession,
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
  it('normalizes suffixes and Unicode while preserving nickname case and internal spaces', () => {
    expect(normalizeHouseholdBuilding(' ０１０５동 ')).toBe('105');
    expect(normalizeHouseholdNumber(' ０２５０１호 ')).toBe('2501');
    expect(normalizeHouseholdNickname('  Ａbc 이웃  ')).toBe('Abc 이웃');
    expect(normalizeHouseholdNickname('Abc 이웃')).not.toBe(normalizeHouseholdNickname('abc이웃'));
  });

  it('accepts only a bounded HTTPS runtime configuration', () => {
    expect(parseHouseholdVerificationConfig(config)).toEqual(config);
    expect(() => parseHouseholdVerificationConfig({ ...config, endpoint: 'http://example.test/exec' }))
      .toThrow(HouseholdVerificationError);
    expect(() => parseHouseholdVerificationConfig({ ...config, endpoint: 'https://example.test/exec' }))
      .toThrow(HouseholdVerificationError);
    expect(() => parseHouseholdVerificationConfig({ ...config, enabled: false }))
      .toThrow(HouseholdVerificationError);
    expect(() => parseHouseholdVerificationConfig({ ...config, timeoutMs: 999 }))
      .toThrow(HouseholdVerificationError);
  });

  it('posts the normalized triple without putting it in the endpoint URL', async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(String(input)).toBe(config.endpoint);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({ 'Content-Type': 'text/plain;charset=UTF-8' });
      expect(JSON.parse(String(init?.body))).toEqual({
        schemaVersion: 1,
        action: 'verifyHousehold',
        buildingId: '105',
        householdNumber: '2501',
        nickname: '돌범이웃',
      });
      return new Response(JSON.stringify({ schemaVersion: 1, ok: true, verified: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await expect(verifyHousehold(config, {
      buildingId: '105동',
      householdNumber: '2501호',
      nickname: ' 돌범이웃 ',
    }, fetchMock)).resolves.toEqual({ schemaVersion: 1, ok: true, verified: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('fails closed for an invalid response and a timeout', async () => {
    const invalidFetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    await expect(verifyHousehold(config, {
      buildingId: '105', householdNumber: '2501', nickname: '돌범이웃',
    }, invalidFetch)).rejects.toMatchObject({ code: 'invalid-response' });

    const serverErrorFetch = vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1, ok: false, verified: false, code: 'service_unavailable',
    }), { status: 200 })) as unknown as typeof fetch;
    await expect(verifyHousehold(config, {
      buildingId: '105', householdNumber: '2501', nickname: '돌범이웃',
    }, serverErrorFetch)).rejects.toMatchObject({ code: 'network' });

    const timeoutFetch = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    await expect(verifyHousehold({ ...config, timeoutMs: 10 }, {
      buildingId: '105', householdNumber: '2501', nickname: '돌범이웃',
    }, timeoutFetch)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('stores only a provider marker and timestamp for the current tab', () => {
    const storage = new MemoryStorage();
    writeHouseholdVerificationSession(storage, 1_789_000_000_000);
    const raw = storage.getItem(HOUSEHOLD_VERIFICATION_SESSION_KEY) || '';
    expect(raw).toBe('{"schemaVersion":1,"provider":"google-apps-script","verifiedAt":1789000000000}');
    expect(raw).not.toMatch(/105|2501|돌범/);
    expect(readHouseholdVerificationSession(storage)).toEqual({
      schemaVersion: 1,
      provider: 'google-apps-script',
      verifiedAt: 1_789_000_000_000,
    });
    clearHouseholdVerificationSession(storage);
    expect(readHouseholdVerificationSession(storage)).toBeNull();
  });
});
