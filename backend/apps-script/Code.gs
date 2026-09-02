var VERIFICATION_SCHEMA_VERSION = 1;
var VERIFICATION_SHEET_NAME = '인증명단';
var VERIFICATION_HEADERS = ['동', '타입', '닉네임', '상태'];
var LEGACY_VERIFICATION_HEADERS = ['동', '호수', '닉네임'];
var VERIFICATION_STATUSES = ['요청', '인증됨', '운영자'];
var VERIFICATION_MAX_DATA_ROWS = 5000;

function setupVerificationSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Google Sheet의 확장 프로그램 → Apps Script에서 실행해 주세요.');

  var sheet = spreadsheet.getSheetByName(VERIFICATION_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(VERIFICATION_SHEET_NAME);
  var currentHeaders = sheet.getRange(1, 1, 1, VERIFICATION_HEADERS.length).getDisplayValues()[0];
  var isEmpty = currentHeaders.every(function (value) { return String(value).trim() === ''; });
  var isLegacy = sameValues_(currentHeaders.slice(0, 3), LEGACY_VERIFICATION_HEADERS)
    && String(currentHeaders[3]).trim() === '';
  if (isEmpty) {
    sheet.getRange(1, 1, 1, VERIFICATION_HEADERS.length).setValues([VERIFICATION_HEADERS]);
  } else if (isLegacy && sheet.getLastRow() < 2) {
    sheet.getRange(1, 1, 1, VERIFICATION_HEADERS.length).setValues([VERIFICATION_HEADERS]);
  } else if (isLegacy) {
    throw new Error('기존 동 | 호수 | 닉네임 데이터가 있습니다. 백업 후 B열을 타입, D열을 상태로 직접 전환한 다음 다시 실행해 주세요.');
  } else if (!sameValues_(currentHeaders, VERIFICATION_HEADERS)) {
    throw new Error('인증명단 탭의 A1:D1은 동 | 타입 | 닉네임 | 상태여야 합니다.');
  }
  sheet.setFrozenRows(1);
  sheet.getRange('D2:D').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(VERIFICATION_STATUSES, true).setAllowInvalid(false).build()
  );

  PropertiesService.getScriptProperties().setProperties({
    BUNFIRVIL_SPREADSHEET_ID: spreadsheet.getId(),
    BUNFIRVIL_VERIFICATION_SHEET: VERIFICATION_SHEET_NAME,
  }, true);
  return { ok: true, sheetName: VERIFICATION_SHEET_NAME, headers: VERIFICATION_HEADERS.slice(), statuses: VERIFICATION_STATUSES.slice() };
}

function doGet() {
  return jsonOutput_({ schemaVersion: VERIFICATION_SCHEMA_VERSION, ok: false, verified: false, operator: false, code: 'method_not_allowed' });
}

function doPost(event) {
  try {
    var request = parseVerificationRequest_(event);
    if (!request) return invalidRequest_();
    var properties = PropertiesService.getScriptProperties();
    var spreadsheetId = properties.getProperty('BUNFIRVIL_SPREADSHEET_ID');
    var sheetName = properties.getProperty('BUNFIRVIL_VERIFICATION_SHEET') || VERIFICATION_SHEET_NAME;
    if (!spreadsheetId) return serviceUnavailable_();

    var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
    if (!sheet || !sameValues_(sheet.getRange(1, 1, 1, 4).getDisplayValues()[0], VERIFICATION_HEADERS)) return serviceUnavailable_();
    return request.action === 'requestHouseholdVerification'
      ? requestVerification_(sheet, request)
      : verifyRequest_(sheet, request);
  } catch (error) {
    console.error('[bunfirvil-verification] request failed', error && error.stack ? error.stack : error);
    return serviceUnavailable_();
  }
}

function verifyRequest_(sheet, request) {
  var match = matchingVerificationRow_(sheet, request);
  return verificationOutput_(match ? normalizeStatus_(match[3]) : '');
}

function requestVerification_(sheet, request) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return serviceUnavailable_();
  try {
    var match = matchingVerificationRow_(sheet, request);
    if (match) {
      var existingStatus = normalizeStatus_(match[3]);
      if (!existingStatus) {
        sheet.getRange(match.__rowNumber, 4).setValue('요청');
        existingStatus = '요청';
      }
      return verificationOutput_(existingStatus, true);
    }
    sheet.appendRow([request.buildingId, request.unitType, request.nickname, '요청']);
    return verificationOutput_('요청', true);
  } finally {
    lock.releaseLock();
  }
}

function matchingVerificationRow_(sheet, request) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var rowCount = Math.min(lastRow - 1, VERIFICATION_MAX_DATA_ROWS);
  var values = sheet.getRange(2, 1, rowCount, 4).getDisplayValues();
  for (var index = 0; index < values.length; index += 1) {
    if (matchesVerificationRow_(values[index], request)) {
      values[index].__rowNumber = index + 2;
      return values[index];
    }
  }
  return null;
}

function parseVerificationRequest_(event) {
  if (!event || !event.postData || typeof event.postData.contents !== 'string') return null;
  var payload;
  try { payload = JSON.parse(event.postData.contents); } catch (error) { return null; }
  if (!payload || payload.schemaVersion !== VERIFICATION_SCHEMA_VERSION
    || ['verifyHousehold', 'requestHouseholdVerification'].indexOf(payload.action) < 0) return null;

  var buildingId = normalizeBuilding_(payload.buildingId);
  var unitType = normalizeUnitType_(payload.unitType);
  var nickname = normalizeNickname_(payload.nickname);
  if (!/^(10[1-9]|11[0-2])$/.test(buildingId)
    || ['51A', '55A', '55B', '59A'].indexOf(unitType) < 0
    || nickname.length < 1 || nickname.length > 20) return null;
  return { action: payload.action, buildingId: buildingId, unitType: unitType, nickname: nickname };
}

function normalizeUnicode_(value) {
  var text = String(value == null ? '' : value);
  return typeof text.normalize === 'function' ? text.normalize('NFKC') : text;
}

function normalizeBuilding_(value) {
  return normalizeUnicode_(value).trim().replace(/\s*동\s*$/, '').replace(/^0+(?=\d)/, '');
}

function normalizeUnitType_(value) {
  return normalizeUnicode_(value).trim().replace(/\s+/g, '').toUpperCase();
}

function normalizeNickname_(value) { return normalizeUnicode_(value).trim(); }

function normalizeStatus_(value) {
  var status = normalizeUnicode_(value).trim();
  return VERIFICATION_STATUSES.indexOf(status) >= 0 ? status : '';
}

function matchesVerificationRow_(row, request) {
  if (!row || !request || row.length < 3) return false;
  var buildingId = normalizeBuilding_(row[0]);
  var unitType = normalizeUnitType_(row[1]);
  var nickname = normalizeNickname_(row[2]);
  return Boolean(buildingId && unitType && nickname)
    && buildingId === request.buildingId
    && unitType === request.unitType
    && nickname === request.nickname;
}

function sameValues_(left, right) {
  return left.length === right.length && left.every(function (value, index) { return String(value).trim() === right[index]; });
}

function verificationOutput_(status, requested) {
  var normalizedStatus = normalizeStatus_(status);
  return jsonOutput_({
    schemaVersion: VERIFICATION_SCHEMA_VERSION,
    ok: true,
    verified: normalizedStatus === '인증됨' || normalizedStatus === '운영자',
    operator: normalizedStatus === '운영자',
    requested: requested === true,
    status: normalizedStatus === '운영자' ? 'operator' : normalizedStatus === '인증됨' ? 'verified' : normalizedStatus === '요청' ? 'requested' : 'not_found',
  });
}

function invalidRequest_() {
  return jsonOutput_({ schemaVersion: VERIFICATION_SCHEMA_VERSION, ok: false, verified: false, operator: false, code: 'invalid_request' });
}

function serviceUnavailable_() {
  return jsonOutput_({ schemaVersion: VERIFICATION_SCHEMA_VERSION, ok: false, verified: false, operator: false, code: 'service_unavailable' });
}

function jsonOutput_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
