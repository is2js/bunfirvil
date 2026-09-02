var VERIFICATION_SCHEMA_VERSION = 1;
var VERIFICATION_SHEET_NAME = '인증명단';
var VERIFICATION_HEADERS = ['동', '호수', '닉네임'];
var VERIFICATION_MAX_DATA_ROWS = 5000;

/**
 * Google Sheet에 바인딩한 뒤 편집기에서 한 번 실행합니다.
 * 현재 Sheet ID를 Script Properties에 기록하고 인증명단 탭/헤더를 준비합니다.
 */
function setupVerificationSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Google Sheet의 확장 프로그램 → Apps Script에서 실행해 주세요.');

  var sheet = spreadsheet.getSheetByName(VERIFICATION_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(VERIFICATION_SHEET_NAME);

  var currentHeaders = sheet.getRange(1, 1, 1, VERIFICATION_HEADERS.length).getDisplayValues()[0];
  var isEmpty = currentHeaders.every(function (value) { return String(value).trim() === ''; });
  if (isEmpty) {
    sheet.getRange(1, 1, 1, VERIFICATION_HEADERS.length).setValues([VERIFICATION_HEADERS]);
    sheet.setFrozenRows(1);
  } else if (!sameValues_(currentHeaders, VERIFICATION_HEADERS)) {
    throw new Error('인증명단 탭의 A1:C1은 동 | 호수 | 닉네임이어야 합니다.');
  }

  PropertiesService.getScriptProperties().setProperties({
    BUNFIRVIL_SPREADSHEET_ID: spreadsheet.getId(),
    BUNFIRVIL_VERIFICATION_SHEET: VERIFICATION_SHEET_NAME,
  }, true);

  return {
    ok: true,
    sheetName: VERIFICATION_SHEET_NAME,
    headers: VERIFICATION_HEADERS.slice(),
  };
}

function doGet() {
  return jsonOutput_({
    schemaVersion: VERIFICATION_SCHEMA_VERSION,
    ok: false,
    verified: false,
    code: 'method_not_allowed',
  });
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
    if (!sheet) return serviceUnavailable_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return verifiedOutput_(false);

    var rowCount = Math.min(lastRow - 1, VERIFICATION_MAX_DATA_ROWS);
    var values = sheet.getRange(2, 1, rowCount, 3).getDisplayValues();
    var verified = values.some(function (row) {
      return matchesVerificationRow_(row, request);
    });
    return verifiedOutput_(verified);
  } catch (error) {
    console.error('[bunfirvil-verification] request failed', error && error.stack ? error.stack : error);
    return serviceUnavailable_();
  }
}

function parseVerificationRequest_(event) {
  if (!event || !event.postData || typeof event.postData.contents !== 'string') return null;
  var payload;
  try {
    payload = JSON.parse(event.postData.contents);
  } catch (error) {
    return null;
  }
  if (!payload
    || payload.schemaVersion !== VERIFICATION_SCHEMA_VERSION
    || payload.action !== 'verifyHousehold') return null;

  var buildingId = normalizeBuilding_(payload.buildingId);
  var householdNumber = normalizeHousehold_(payload.householdNumber);
  var nickname = normalizeNickname_(payload.nickname);
  if (!/^(10[1-9]|11[0-2])$/.test(buildingId)
    || !/^\d{3,4}$/.test(householdNumber)
    || nickname.length < 1
    || nickname.length > 20) return null;

  return {
    buildingId: buildingId,
    householdNumber: householdNumber,
    nickname: nickname,
  };
}

function normalizeUnicode_(value) {
  var text = String(value == null ? '' : value);
  return typeof text.normalize === 'function' ? text.normalize('NFKC') : text;
}

function normalizeBuilding_(value) {
  return normalizeUnicode_(value).trim().replace(/\s*동\s*$/, '').replace(/^0+(?=\d)/, '');
}

function normalizeHousehold_(value) {
  return normalizeUnicode_(value).trim().replace(/\s*호\s*$/, '').replace(/^0+(?=\d)/, '');
}

function normalizeNickname_(value) {
  return normalizeUnicode_(value).trim();
}

function matchesVerificationRow_(row, request) {
  if (!row || !request || row.length < 3) return false;
  var buildingId = normalizeBuilding_(row[0]);
  var householdNumber = normalizeHousehold_(row[1]);
  var nickname = normalizeNickname_(row[2]);
  if (!buildingId || !householdNumber || !nickname) return false;
  return buildingId === request.buildingId
    && householdNumber === request.householdNumber
    && nickname === request.nickname;
}

function sameValues_(left, right) {
  return left.length === right.length && left.every(function (value, index) {
    return String(value).trim() === right[index];
  });
}

function verifiedOutput_(verified) {
  return jsonOutput_({
    schemaVersion: VERIFICATION_SCHEMA_VERSION,
    ok: true,
    verified: verified === true,
  });
}

function invalidRequest_() {
  return jsonOutput_({
    schemaVersion: VERIFICATION_SCHEMA_VERSION,
    ok: false,
    verified: false,
    code: 'invalid_request',
  });
}

function serviceUnavailable_() {
  return jsonOutput_({
    schemaVersion: VERIFICATION_SCHEMA_VERSION,
    ok: false,
    verified: false,
    code: 'service_unavailable',
  });
}

function jsonOutput_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
