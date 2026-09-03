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
  matchingOperatorRow_(sheet: FakeSheet, nickname: string): unknown[] | null;
  verifyRequest_(sheet: FakeSheet, request: Record<string, string>): { getContent(): string };
  requestVerification_(sheet: FakeSheet, request: Record<string, string>): { getContent(): string };
}

interface FakeSheet {
  getLastRow(): number;
  getRange(row: number, column: number, rowCount: number, columnCount: number): { getDisplayValues(): unknown[][] };
  appendRow(row: unknown[]): void;
}

function fakeSheet(rows: unknown[][]): FakeSheet & { appended: unknown[][] } {
  const appended: unknown[][] = [];
  return {
    appended,
    getLastRow: () => rows.length + 1,
    getRange: (_row, _column, rowCount) => ({ getDisplayValues: () => rows.slice(0, rowCount).map((row) => [...row]) }),
    appendRow: (row) => { appended.push([...row]); },
  };
}

function loadAppsScriptContract(): AppsScriptContract {
  const source = readFileSync(resolve(process.cwd(), 'backend/apps-script/Code.gs'), 'utf8');
  const context: Record<string, unknown> = {
    console,
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (value: string) => ({ getContent: () => value, setMimeType() { return this; } }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
  };
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

  it('authenticates an operator nickname globally while preserving exact regular matching', () => {
    const sheet = fakeSheet([
      ['105', '55A', '피치', '운영자'],
      ['101', '55A', '일반이웃', '인증됨'],
    ]);
    const globalOperator = JSON.parse(service.verifyRequest_(sheet, {
      buildingId: '112', unitType: '51A', nickname: '피치',
    }).getContent());
    expect(globalOperator).toMatchObject({ verified: true, operator: true, status: 'operator' });

    const wrongRegularUnit = JSON.parse(service.verifyRequest_(sheet, {
      buildingId: '112', unitType: '51A', nickname: '일반이웃',
    }).getContent());
    expect(wrongRegularUnit).toMatchObject({ verified: false, operator: false, status: 'not_found' });
  });

  it('does not append a request row for an existing global operator', () => {
    const sheet = fakeSheet([['105', '55A', '피치', '운영자']]);
    const result = JSON.parse(service.requestVerification_(sheet, {
      buildingId: '101', unitType: '55B', nickname: '피치',
    }).getContent());
    expect(result).toMatchObject({ verified: true, operator: true, status: 'operator' });
    expect(sheet.appended).toEqual([]);
  });

  it('never grants access to a requested row', () => {
    const sheet = fakeSheet([['105', '55A', '대기이웃', '요청']]);
    const result = JSON.parse(service.verifyRequest_(sheet, {
      buildingId: '105', unitType: '55A', nickname: '대기이웃',
    }).getContent());
    expect(result).toMatchObject({ verified: false, operator: false, status: 'requested' });
  });
});
