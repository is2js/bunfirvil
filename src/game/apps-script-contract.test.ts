import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface AppsScriptContract {
  normalizeBuilding_(value: unknown): string;
  normalizeUnitType_(value: unknown): string;
  normalizeNickname_(value: unknown): string;
  normalizeStatus_(value: unknown): string;
  matchesVerificationRow_(row: unknown[], request: Record<string, string>): boolean;
}

function loadAppsScriptContract(): AppsScriptContract {
  const source = readFileSync(resolve(process.cwd(), 'backend/apps-script/Code.gs'), 'utf8');
  const context: Record<string, unknown> = { console };
  runInNewContext(source, context, { filename: 'backend/apps-script/Code.gs' });
  return context as unknown as AppsScriptContract;
}

describe('Google Apps Script verification contract', () => {
  const service = loadAppsScriptContract();

  it('normalizes the new sheet contract', () => {
    expect(service.normalizeBuilding_(' ０１０５동 ')).toBe('105');
    expect(service.normalizeUnitType_(' ５５ａ ')).toBe('55A');
    expect(service.normalizeNickname_(' Ａbc 이웃 ')).toBe('Abc 이웃');
    expect(service.normalizeStatus_(' 운영자 ')).toBe('운영자');
    expect(service.normalizeStatus_('승인')).toBe('');
  });

  it('requires an exact non-empty building, type, and nickname match', () => {
    const request = { buildingId: '105', unitType: '55A', nickname: '피치' };
    expect(service.matchesVerificationRow_(['105동', '55a', ' 피치 ', '인증됨'], request)).toBe(true);
    expect(service.matchesVerificationRow_(['105', '55B', '피치', '인증됨'], request)).toBe(false);
    expect(service.matchesVerificationRow_(['', '', '', ''], request)).toBe(false);
  });
});
