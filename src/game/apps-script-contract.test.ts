import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const HEADERS = ['동', '타입', '닉네임', '상태'];
const REQUEST_HEADERS = ['요청ID', '요청일시', '동', '타입', '닉네임', '심사결정', '처리결과', '처리일시'];
const OPERATOR_TEST_CODE = 'test-only-random-code-123'; // Synthetic fixture, never a deployed credential.

class FakeSheet {
  writes: unknown[][] = [];
  failWrites = false;
  constructor(public data: string[][], public name = '인증명단') {}
  getLastRow() { return this.data.length; }
  getName() { return this.name; }
  getRange(row: number, col: number, count = 1, width = 1) {
    const sheet = this;
    return {
      getDisplayValues: () => Array.from({ length: count }, (_, i) => Array.from({ length: width }, (_, j) => sheet.data[row + i - 1]?.[col + j - 1] || '')),
      setNumberFormat() { return this; },
      setValues(values: unknown[][]) {
        if (sheet.failWrites) throw new Error('simulated failure');
        sheet.writes.push(...values);
        values.forEach((valuesRow, i) => valuesRow.forEach((v, j) => {
          sheet.data[row + i - 1] ||= [];
          const text = String(v);
          sheet.data[row + i - 1][col + j - 1] = text.startsWith("'") ? text.slice(1) : text;
        }));
        return this;
      },
      setValue(value: unknown) { return this.setValues([[value]]); },
    };
  }
  deleteRow(row: number) { this.data.splice(row - 1, 1); }
  copyTo(book: { sheets: Map<string, FakeSheet> }) {
    const copy = new FakeSheet(this.data.map(row => [...row]));
    return { setName(name: string) { copy.name = name; book.sheets.set(name, copy); return copy; } };
  }
}

function fixture(memberRows: string[][] = [], requestRows: string[][] = []) {
  const members = new FakeSheet([HEADERS, ...memberRows]);
  const requests = new FakeSheet([REQUEST_HEADERS, ...requestRows], '가입요청');
  const sheets = new Map([['인증명단', members], ['가입요청', requests]]);
  const book = { sheets, getSheetByName: (name: string) => sheets.get(name), getId: () => 'synthetic-book' };
  const properties = new Map([['BUNFIRVIL_SPREADSHEET_ID', 'synthetic-book'], ['BUNFIRVIL_OPERATOR_CODE_SHA256', createHash('sha256').update(OPERATOR_TEST_CODE).digest('hex')]]);
  const cache = new Map<string, string>();
  let sequence = 0;
  const context = {
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (value: string) => ({ getContent: () => value, setMimeType() { return this; } }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => properties.get(key) }) },
    CacheService: { getScriptCache: () => ({ get: (key: string) => cache.get(key), put: (key: string, value: string) => cache.set(key, value), remove: (key: string) => cache.delete(key) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => book, flush() {}, getUi: () => ({ ButtonSet: { YES_NO: 'yes-no' }, Button: { YES: 'yes' }, alert: () => 'yes' }) },
    Utilities: { getUuid: () => 'id-' + ++sequence, DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_: string, value: string) => [...createHash('sha256').update(value).digest()] },
  };
  runInNewContext(readFileSync(resolve(process.cwd(), 'backend/apps-script/Code.gs'), 'utf8'), context);
  const service = context as unknown as Record<string, (...args: any[]) => any>;
  const request = (overrides: Record<string, unknown> = {}) => ({ action: 'verifyHousehold', buildingId: '105', unitType: '55A', nickname: '이웃', ...overrides });
  const output = (result: { getContent(): string }) => JSON.parse(result.getContent());
  return { service, request, output, members, requests, sheets, properties };
}

describe('Google Apps Script requests and membership', () => {
  it('requires the operator code even when a public nickname matches globally', () => {
    const f = fixture([['105', '55A', '운영예시', '운영자']]);
    const request = f.request({ buildingId: '112', unitType: '51A', nickname: '운영예시' });
    expect(f.output(f.service.verifyRequest_(f.members, request, f.requests))).toMatchObject({ verified: false, code: 'operator_code_required' });
    expect(f.output(f.service.verifyRequest_(f.members, { ...request, operatorCode: 'wrong' }, f.requests))).toMatchObject({ verified: false });
    expect(f.output(f.service.verifyRequest_(f.members, { ...request, operatorCode: OPERATOR_TEST_CODE }, f.requests))).toMatchObject({ verified: true, operator: true, operatorVerified: true, authRevision: 2 });
    f.properties.delete('BUNFIRVIL_OPERATOR_CODE_SHA256');
    expect(f.output(f.service.verifyRequest_(f.members, request, f.requests))).toMatchObject({ verified: false, code: 'operator_setup_required' });
  });

  it('does not append requests or elevate roles through operator nickname registration', () => {
    const f = fixture([['105', '55A', '운영예시', '운영자']]);
    const response = f.output(f.service.requestVerification_(f.members, f.request({ nickname: '운영예시', operator: true }), f.requests));
    expect(response).toMatchObject({ verified: false, operator: false });
    expect(f.requests.getLastRow()).toBe(1);
  });

  it('separates exact own-household authentication from cross-type read-only membership', () => {
    const f = fixture([['105', '55A', '이웃', '인증됨']]);
    expect(f.output(f.service.verifyRequest_(f.members, f.request({ unitType: '59A' }), f.requests)).verified).toBe(false);
    expect(f.output(f.service.verifyRequest_(f.members, f.request({ action: 'verifyShareViewer', unitType: '' }), f.requests))).toMatchObject({ verified: true, operator: false, scope: 'share' });
    expect(f.output(f.service.verifyRequest_(f.members, f.request({ action: 'verifyShareViewer', buildingId: '106' }), f.requests)).verified).toBe(false);
  });

  it('ignores duplicate pending rows and reads approved members past row 5000', () => {
    const f = fixture([['105', '55A', '이웃', '요청'], ...Array.from({ length: 5000 }, () => ['', '', '', '']), ['105', '55A', '이웃', '인증됨']]);
    expect(f.output(f.service.verifyRequest_(f.members, f.request(), f.requests)).verified).toBe(true);
    f.members.data.push(['105', '55A', '이웃', '중지']);
    expect(f.output(f.service.verifyRequest_(f.members, f.request(), f.requests)).verified).toBe(false);
  });

  it('writes requests only into the queue, deduplicates and stores formulas as text', () => {
    const f = fixture();
    const request = f.request({ action: 'requestHouseholdVerification', nickname: '=1+1' });
    const first = f.output(f.service.requestVerification_(f.members, request, f.requests));
    expect(first).toMatchObject({ requested: true, verified: false });
    expect(f.requests.writes[0][4]).toBe("'=1+1");
    expect(f.requests.data[1][4]).toBe('=1+1');
    f.service.requestVerification_(f.members, request, f.requests);
    expect(f.requests.getLastRow()).toBe(2);
    expect(f.members.getLastRow()).toBe(1);
    expect(f.output(f.service.verifyRequest_(f.members, request, f.requests)).verified).toBe(false);
  });

  it('approves idempotently and does not claim success when member writing failed', () => {
    const f = fixture([], [['r1', '', '105', '55A', '이웃', '승인', '', '']]);
    f.members.failWrites = true;
    f.service.processPendingDecisions();
    expect(f.requests.data[1][6]).toContain('처리 실패');
    expect(f.members.getLastRow()).toBe(1);
    f.members.failWrites = false;
    f.service.processPendingDecisions();
    expect(f.members.data[1]).toEqual(['105', '55A', '이웃', '인증됨']);
    expect(f.requests.data[1][6]).toBe('승인 완료');
    // Retry after a lost success marker must not duplicate the member.
    f.requests.data[1][6] = '';
    f.service.processPendingDecisions();
    expect(f.members.getLastRow()).toBe(2);
  });

  it('never promotes an operator or reactivates a suspended member through approval', () => {
    for (const status of ['운영자', '중지']) {
      const f = fixture([['105', '55A', '이웃', status]], [['r1', '', '105', '55A', '이웃', '승인', '', '']]);
      f.service.processPendingDecisions();
      expect(f.requests.data[1][6]).toContain('처리 실패');
      expect(f.members.data[1][3]).toBe(status);
    }
  });

  it('keeps rejection on resubmission and enforces queue capacity', () => {
    const rejected = fixture([], [['r1', '', '105', '55A', '이웃', '반려', '반려 완료', '']]);
    expect(rejected.output(rejected.service.requestVerification_(rejected.members, rejected.request(), rejected.requests))).toMatchObject({ verified: false, status: 'rejected' });
    const full = fixture([], Array.from({ length: 300 }, (_, i) => [String(i), '', '105', '55A', '대기' + i, '대기', '', '']));
    expect(full.output(full.service.requestVerification_(full.members, full.request(), full.requests))).toMatchObject({ ok: false, code: 'request_capacity' });
  });

  it('backs up legacy requests before moving and leaves all approved members intact', () => {
    const f = fixture([['105', '55A', '이웃', '요청'], ['106', '59A', '회원예시', '인증됨']]);
    f.service.migrateLegacyRequests();
    expect(f.sheets.size).toBe(3);
    expect([...f.sheets.keys()].some(name => name.startsWith('인증백업-'))).toBe(true);
    expect(f.requests.data[1].slice(2, 6)).toEqual(['105', '55A', '이웃', '대기']);
    expect(f.members.data).toEqual([HEADERS, ['106', '59A', '회원예시', '인증됨']]);
    f.service.migrateLegacyRequests();
    expect(f.requests.getLastRow()).toBe(2);
  });

  it('validates normalization, request size and control characters', () => {
    const f = fixture();
    expect(f.service.normalizeBuilding_(' ０１０５동 ')).toBe('105');
    expect(f.service.normalizeUnitType_(' ５５ａ ')).toBe('55A');
    expect(f.service.normalizeNickname_(' Ａbc 이웃 ')).toBe('Abc 이웃');
    const parse = (p: object) => f.service.parseVerificationRequest_({ postData: { contents: JSON.stringify({ schemaVersion: 1, ...f.request(), ...p }) } });
    expect(parse({ nickname: 'bad\nname' })).toBeNull();
    expect(parse({ nickname: 'x'.repeat(3000) })).toBeNull();
    expect(parse({ action: 'approveMember' })).toBeNull();
    expect(parse({ action: 'verifyShareViewer', unitType: '' })).toMatchObject({ unitType: '' });
  });
});
