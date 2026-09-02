import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface AppsScriptContract {
  normalizeBuilding_(value: unknown): string;
  normalizeHousehold_(value: unknown): string;
  normalizeNickname_(value: unknown): string;
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

  it('normalizes only documented suffixes, outer whitespace, and Unicode width', () => {
    expect(service.normalizeBuilding_(' ０１０５동 ')).toBe('105');
    expect(service.normalizeHousehold_(' ０２５０１호 ')).toBe('2501');
    expect(service.normalizeNickname_(' Ａbc 이웃 ')).toBe('Abc 이웃');
  });

  it('requires an exact non-empty three-column match', () => {
    const request = { buildingId: '105', householdNumber: '2501', nickname: '돌범이웃' };
    expect(service.matchesVerificationRow_(['105동', '2501호', ' 돌범이웃 '], request)).toBe(true);
    expect(service.matchesVerificationRow_(['105', '2501', '돌범 이웃'], request)).toBe(false);
    expect(service.matchesVerificationRow_(['105', '2501', '돌범이웃 '], { ...request, nickname: '돌범이웃 ' })).toBe(false);
    expect(service.matchesVerificationRow_(['', '', ''], request)).toBe(false);
  });
});
