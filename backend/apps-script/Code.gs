var VERIFICATION_SCHEMA_VERSION = 1;
var VERIFICATION_SHEET_NAME = '인증명단';
var VERIFICATION_HEADERS = ['동', '타입', '닉네임', '상태'];
var VERIFICATION_STATUSES = ['인증됨', '운영자', '중지'];
var REQUEST_SHEET_NAME = '가입요청';
var REQUEST_HEADERS = ['요청ID', '요청일시', '동', '타입', '닉네임', '심사결정', '처리결과', '처리일시'];
var REQUEST_MAX_ROWS = 5000;
var REQUEST_MAX_PENDING = 300;

function setupVerificationSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Google Sheet의 확장 프로그램 → Apps Script에서 실행해 주세요.');
  var members = ensureSheet_(book, VERIFICATION_SHEET_NAME, VERIFICATION_HEADERS);
  var requests = ensureSheet_(book, REQUEST_SHEET_NAME, REQUEST_HEADERS);
  members.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(VERIFICATION_STATUSES, true).setAllowInvalid(false).build());
  requests.getRange('F2:F').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['대기', '승인', '반려'], true).setAllowInvalid(false).build());
  // Preserve the operator digest and unrelated script properties.
  PropertiesService.getScriptProperties().setProperties({
    BUNFIRVIL_SPREADSHEET_ID: book.getId(), BUNFIRVIL_VERIFICATION_SHEET: VERIFICATION_SHEET_NAME,
  }, false);
  var exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'onRegistrationDecisionEdit';
  });
  if (!exists) ScriptApp.newTrigger('onRegistrationDecisionEdit').forSpreadsheet(book).onEdit().create();
  return { ok: true, sheets: [VERIFICATION_SHEET_NAME, REQUEST_SHEET_NAME] };
}

function ensureSheet_(book, name, headers) {
  var sheet = book.getSheetByName(name) || book.insertSheet(name);
  var current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (current.every(function (v) { return !String(v).trim(); })) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  else if (!sameValues_(current, headers)) throw new Error(name + ' 헤더를 확인하세요: ' + headers.join(' | ') + '. 기존 데이터는 변경하지 않았습니다.');
  sheet.setFrozenRows(1);
  return sheet;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('분퍼빌 회원 관리')
    .addItem('초기 설치 / 드롭다운 준비', 'setupVerificationSheet')
    .addItem('운영자 인증코드 설정', 'configureOperatorCode')
    .addItem('기존 요청 분리 (백업 후 이동)', 'migrateLegacyRequests')
    .addItem('미처리 승인 / 반려 재처리', 'processPendingDecisions').addToUi();
}

function configureOperatorCode() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('운영자 인증코드', '비밀번호 관리자에서 생성한 16~128자 무작위 코드를 입력하세요. 닉네임과 다르게 설정하고 공유 링크·GitHub에는 넣지 마세요. Sheet 운영자들이 이 코드를 사용합니다.', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var code = answer.getResponseText().trim();
  if (code.length < 16 || code.length > 128) throw new Error('인증코드는 16~128자여야 합니다.');
  PropertiesService.getScriptProperties().setProperty('BUNFIRVIL_OPERATOR_CODE_SHA256', digest_(code));
  ui.alert('해시만 저장했습니다. 다음 인증부터 새 코드를 사용하세요. 이미 열린 인증 세션은 탭 종료 전까지 유지될 수 있습니다.');
}

function verificationBook_() {
  var id = PropertiesService.getScriptProperties().getProperty('BUNFIRVIL_SPREADSHEET_ID');
  if (!id) throw new Error('setup required');
  return SpreadsheetApp.openById(id);
}
function doGet() { return serviceError_('method_not_allowed'); }

function doPost(event) {
  try {
    var request = parseVerificationRequest_(event);
    if (!request) return serviceError_('invalid_request');
    var book = verificationBook_();
    var members = book.getSheetByName(PropertiesService.getScriptProperties().getProperty('BUNFIRVIL_VERIFICATION_SHEET') || VERIFICATION_SHEET_NAME);
    var requests = book.getSheetByName(REQUEST_SHEET_NAME);
    if (!members || !requests || !sameValues_(members.getRange(1, 1, 1, 4).getDisplayValues()[0], VERIFICATION_HEADERS)
      || !sameValues_(requests.getRange(1, 1, 1, 8).getDisplayValues()[0], REQUEST_HEADERS)) return serviceError_('service_unavailable');
    return request.action === 'requestHouseholdVerification'
      ? requestVerification_(members, request, requests) : verifyRequest_(members, request, requests);
  } catch (_) {
    // Do not log request contents, nicknames, credentials, or sheet rows.
    return serviceError_('service_unavailable');
  }
}

function rows_(sheet, width) {
  return sheet && sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getDisplayValues() : [];
}
function matchingOperatorRow_(sheet, nickname) {
  return rows_(sheet, 4).filter(function (row) {
    return normalizeNickname_(row[2]) === nickname && normalizeStatus_(row[3]) === '운영자';
  })[0] || null;
}
function memberStatus_(sheet, request) {
  var matches = rows_(sheet, 4).filter(function (row) {
    return normalizeBuilding_(row[0]) === request.buildingId && normalizeNickname_(row[2]) === request.nickname
      && (request.action === 'verifyShareViewer' || normalizeUnitType_(row[1]) === request.unitType);
  });
  if (matches.some(function (row) { return normalizeStatus_(row[3]) === '중지'; })) return '중지';
  if (matches.some(function (row) { return normalizeStatus_(row[3]) === '인증됨'; })) return '인증됨';
  return '';
}

function operatorOutput_(request) {
  var expected = PropertiesService.getScriptProperties().getProperty('BUNFIRVIL_OPERATOR_CODE_SHA256');
  if (!expected) return verificationOutput_('', request, 'operator_setup_required');
  var cache = CacheService.getScriptCache();
  var key = 'operator-attempt:' + digest_(request.nickname);
  var attempts = Number(cache.get(key) || 0);
  if (!request.operatorCode || attempts >= 6) return verificationOutput_('', request, 'operator_code_required');
  if (!constantEqual_(digest_(request.operatorCode), expected)) {
    cache.put(key, String(attempts + 1), 600);
    return verificationOutput_('', request, 'operator_code_required');
  }
  cache.remove(key);
  return verificationOutput_('운영자', request);
}

function verifyRequest_(members, request, requests) {
  if (matchingOperatorRow_(members, request.nickname)) return operatorOutput_(request);
  var status = memberStatus_(members, request);
  if (status) return verificationOutput_(status, request);
  var queued = matchingRequest_(requests, request);
  return verificationOutput_(queued ? (queued[5] === '반려' ? '반려' : '요청') : '', request);
}

function requestVerification_(members, request, requests) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return serviceError_('service_unavailable');
  try {
    if (matchingOperatorRow_(members, request.nickname)) return operatorOutput_(request);
    var status = memberStatus_(members, request);
    if (status) return verificationOutput_(status, request);
    var queued = matchingRequest_(requests, request);
    if (queued) return verificationOutput_(queued[5] === '반려' ? '반려' : '요청', request);
    if (!requests) return serviceError_('service_unavailable');
    var rows = rows_(requests, 8);
    if (rows.length >= REQUEST_MAX_ROWS || rows.filter(function (row) { return row[5] === '대기'; }).length >= REQUEST_MAX_PENDING) return serviceError_('request_capacity');
    var cache = CacheService.getScriptCache();
    var key = 'registration:' + digest_(request.nickname);
    if (cache.get(key)) return serviceError_('rate_limited');
    appendLiteralRow_(requests, [Utilities.getUuid(), new Date().toISOString(), request.buildingId, request.unitType, request.nickname, '대기', '', '']);
    SpreadsheetApp.flush();
    cache.put(key, '1', 60);
    return verificationOutput_('요청', request);
  } finally { lock.releaseLock(); }
}

function matchingRequest_(sheet, request) {
  return rows_(sheet, 8).filter(function (row) {
    return normalizeBuilding_(row[2]) === request.buildingId && normalizeNickname_(row[4]) === request.nickname
      && (request.action === 'verifyShareViewer' || normalizeUnitType_(row[3]) === request.unitType);
  })[0] || null;
}

function onRegistrationDecisionEdit(event) {
  if (!event || !event.range || event.range.getSheet().getName() !== REQUEST_SHEET_NAME
    || event.range.getColumn() > 6 || event.range.getLastColumn() < 6 || event.range.getLastRow() < 2) return;
  var book = verificationBook_();
  if (event.source.getId() !== book.getId()) return;
  var requests = book.getSheetByName(REQUEST_SHEET_NAME);
  for (var row = Math.max(2, event.range.getRow()); row <= event.range.getLastRow(); row++) {
    var result = requests.getRange(row, 7).getDisplayValues()[0][0];
    // Successful approval is immutable history. Revoke in the member sheet.
    if (result === '승인 완료') requests.getRange(row, 6).setValue('승인');
    else requests.getRange(row, 7, 1, 2).setValues([['', '']]);
  }
  processPendingDecisions();
}

function processPendingDecisions() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('다른 처리가 진행 중입니다. 잠시 후 재처리하세요.');
  try {
    var book = verificationBook_();
    var requests = book.getSheetByName(REQUEST_SHEET_NAME);
    var members = book.getSheetByName(VERIFICATION_SHEET_NAME);
    rows_(requests, 8).forEach(function (row, index) {
      if (['승인', '반려'].indexOf(row[5]) < 0 || row[6] === '승인 완료' || row[6] === row[5] + ' 완료') return;
      try {
        if (row[5] === '승인') approveRequest_(members, row);
        SpreadsheetApp.flush();
        requests.getRange(index + 2, 7, 1, 2).setValues([[row[5] + ' 완료', new Date().toISOString()]]);
      } catch (_) {
        requests.getRange(index + 2, 7).setValue('처리 실패: 요청 내용 또는 기존 회원 상태를 확인 후 재처리하세요.');
      }
    });
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}

function approveRequest_(members, row) {
  var request = parseVerificationRequest_({ postData: { contents: JSON.stringify({ schemaVersion: 1, action: 'verifyHousehold', buildingId: row[2], unitType: row[3], nickname: row[4] }) } });
  if (!row[0] || !request) throw new Error('invalid request row');
  // Approval cannot create/promote an operator or undo a suspension.
  if (matchingOperatorRow_(members, request.nickname)) throw new Error('reserved operator');
  var status = memberStatus_(members, request);
  if (status === '중지') throw new Error('suspended');
  if (status === '인증됨') return;
  appendLiteralRow_(members, [request.buildingId, request.unitType, request.nickname, '인증됨']);
}

function migrateLegacyRequests() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('기존 요청 분리', '인증명단을 백업한 뒤 상태가 요청인 행만 가입요청으로 옮깁니다. 인증됨·운영자·중지 행은 유지합니다. 계속할까요?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('다른 작업이 진행 중입니다.');
  try {
    var book = verificationBook_();
    var members = book.getSheetByName(VERIFICATION_SHEET_NAME);
    var requests = book.getSheetByName(REQUEST_SHEET_NAME);
    if (!requests) throw new Error('초기 설치를 먼저 실행하세요.');
    var pending = rows_(members, 4).map(function (row, index) { return { row: row, index: index + 2 }; })
      .filter(function (item) { return normalizeStatus_(item.row[3]) === '요청'; });
    if (!pending.length) return;
    pending.forEach(function (item) {
      if (!parseVerificationRequest_({ postData: { contents: JSON.stringify({ schemaVersion: 1, action: 'verifyHousehold', buildingId: item.row[0], unitType: item.row[1], nickname: item.row[2] }) } })) throw new Error('기존 요청 데이터에 오류가 있습니다. 이동하지 않았습니다.');
    });
    if (requests.getLastRow() - 1 + pending.length > REQUEST_MAX_ROWS) throw new Error('가입요청 보관 한도를 초과합니다. 먼저 백업·정리하세요.');
    members.copyTo(book).setName('인증백업-' + new Date().getTime());
    pending.reverse().forEach(function (item) {
      var request = { buildingId: normalizeBuilding_(item.row[0]), unitType: normalizeUnitType_(item.row[1]), nickname: normalizeNickname_(item.row[2]) };
      if (!matchingRequest_(requests, request)) appendLiteralRow_(requests, [Utilities.getUuid(), new Date().toISOString(), request.buildingId, request.unitType, request.nickname, '대기', '', '']);
      SpreadsheetApp.flush();
      // Delete only after durable destination write. Retrying cannot duplicate it.
      members.deleteRow(item.index);
    });
  } finally { lock.releaseLock(); }
}

function appendLiteralRow_(sheet, row) {
  // '=' is formula syntax in appendRow/setValues. Apostrophe forces literal text.
  var safe = row.map(function (value) { var text = String(value); return /^[=+\-@']/.test(text) ? "'" + text : text; });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([safe]);
}

function parseVerificationRequest_(event) {
  if (!event || !event.postData || typeof event.postData.contents !== 'string' || event.postData.contents.length > 2048) return null;
  var payload;
  try { payload = JSON.parse(event.postData.contents); } catch (_) { return null; }
  if (!payload || payload.schemaVersion !== 1 || ['verifyHousehold', 'verifyShareViewer', 'requestHouseholdVerification'].indexOf(payload.action) < 0) return null;
  var buildingId = normalizeBuilding_(payload.buildingId);
  var unitType = normalizeUnitType_(payload.unitType);
  var nickname = normalizeNickname_(payload.nickname);
  if (!/^(10[1-9]|11[0-2])$/.test(buildingId) || (payload.action !== 'verifyShareViewer' && ['51A', '55A', '55B', '59A'].indexOf(unitType) < 0)
    || Array.from(nickname).length < 1 || Array.from(nickname).length > 20 || /[\u0000-\u001f\u007f]/.test(nickname)) return null;
  return { action: payload.action, buildingId: buildingId, unitType: payload.action === 'verifyShareViewer' ? '' : unitType,
    nickname: nickname, operatorCode: typeof payload.operatorCode === 'string' && payload.operatorCode.length <= 128 ? payload.operatorCode.trim() : '' };
}

function normalizeUnicode_(value) { return String(value == null ? '' : value).normalize('NFKC'); }
function normalizeBuilding_(value) { return normalizeUnicode_(value).trim().replace(/\s*동\s*$/, '').replace(/^0+(?=\d)/, ''); }
function normalizeUnitType_(value) { return normalizeUnicode_(value).trim().replace(/\s+/g, '').toUpperCase(); }
function normalizeNickname_(value) { return normalizeUnicode_(value).trim(); }
function normalizeStatus_(value) {
  var status = normalizeUnicode_(value).trim();
  return VERIFICATION_STATUSES.concat(['요청', '반려']).indexOf(status) >= 0 ? status : '';
}
function matchesVerificationRow_(row, request) {
  return Boolean(row && request && normalizeNickname_(row[2])) && normalizeBuilding_(row[0]) === request.buildingId
    && normalizeUnitType_(row[1]) === request.unitType && normalizeNickname_(row[2]) === request.nickname;
}
function sameValues_(left, right) { return left.length === right.length && left.every(function (value, index) { return String(value).trim() === right[index]; }); }
function digest_(text) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8).map(function (n) { return ('0' + ((n + 256) % 256).toString(16)).slice(-2); }).join(''); }
function constantEqual_(left, right) {
  if (left.length !== right.length) return false;
  var diff = 0;
  for (var i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
function verificationOutput_(status, request, code) {
  return jsonOutput_({ schemaVersion: 1, authRevision: 2, ok: true,
    verified: status === '인증됨' || status === '운영자', operator: status === '운영자', operatorVerified: status === '운영자',
    requested: status === '요청', scope: request && request.action === 'verifyShareViewer' ? 'share' : 'playground',
    status: status === '운영자' ? 'operator' : status === '인증됨' ? 'verified' : status === '요청' ? 'requested' : status === '반려' ? 'rejected' : 'not_found',
    code: code || (status === '중지' ? 'membership_suspended' : undefined) });
}
function serviceError_(code) { return jsonOutput_({ schemaVersion: 1, authRevision: 2, ok: false, verified: false, operator: false, status: 'not_found', code: code }); }
function jsonOutput_(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }
