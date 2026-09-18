/**
 * TOPIK I Listening Result Logger - Step27A
 * Server-side Google Apps Script only.
 */

const RESULT_LOGGER_VERSION = 'step27a-20260918';
const DEVELOPER_PHONE = '12345678';

const SHEET_STUDENTS = 'Students';
const SHEET_ALL_RESULTS = 'All_Results';
const SHEET_ATTEMPT_INDEX = 'Attempt_Index';

const RESULT_HEADERS = [
  'recorded_at',
  'attempt_id',
  'student_phone',
  'student_name',
  'result_type',
  'generated_exam_mode',
  'generated_exam_round',
  'generated_exam_label',
  'test_name',
  'test_scope',
  'started_at',
  'submitted_at',
  'duration_seconds',
  'total_questions',
  'answered_count',
  'correct_count',
  'wrong_count',
  'unanswered_count',
  'earned_points',
  'total_possible_points',
  'section_score_100',
  'source_rounds',
  'correct_question_numbers',
  'wrong_question_numbers',
  'unanswered_question_numbers',
  'client_version'
];

const STUDENT_HEADERS = [
  'student_phone',
  'current_name',
  'first_seen',
  'last_seen',
  'attempt_count',
  'last_result_type',
  'last_exam_label',
  'last_score_100'
];

const INDEX_HEADERS = [
  'attempt_id',
  'student_phone',
  'recorded_at',
  'all_results_row'
];

function setupResultWorkbook() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No active spreadsheet. Bind this Apps Script project to the target spreadsheet first.');
  }

  PropertiesService.getScriptProperties().setProperty('RESULT_SPREADSHEET_ID', ss.getId());

  const students = ensureSheet_(ss, SHEET_STUDENTS, STUDENT_HEADERS);
  const allResults = ensureSheet_(ss, SHEET_ALL_RESULTS, RESULT_HEADERS);
  const index = ensureSheet_(ss, SHEET_ATTEMPT_INDEX, INDEX_HEADERS);

  students.setFrozenRows(1);
  allResults.setFrozenRows(1);
  index.setFrozenRows(1);

  try {
    index.hideSheet();
  } catch (err) {}

  autoResizeSafe_(students, STUDENT_HEADERS.length);
  autoResizeSafe_(allResults, RESULT_HEADERS.length);

  return {
    ok: true,
    version: RESULT_LOGGER_VERSION,
    spreadsheet_id: ss.getId(),
    sheets: [SHEET_STUDENTS, SHEET_ALL_RESULTS, SHEET_ATTEMPT_INDEX],
    developer_phone_excluded: DEVELOPER_PHONE
  };
}

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'health').toLowerCase();

  if (action === 'health') {
    return jsonOutput_({
      ok: true,
      service: 'TOPIK1_RESULT_LOGGER',
      version: RESULT_LOGGER_VERSION,
      ready: !!PropertiesService.getScriptProperties().getProperty('RESULT_SPREADSHEET_ID')
    });
  }

  return jsonOutput_({
    ok: false,
    error: 'unsupported_action',
    version: RESULT_LOGGER_VERSION
  });
}

function doPost(e) {
  try {
    const payload = parseIncomingPayload_(e);
    const response = logResult_(payload);
    return jsonOutput_(response);
  } catch (err) {
    return jsonOutput_({
      ok: false,
      error: 'server_error',
      message: String(err && err.message ? err.message : err),
      version: RESULT_LOGGER_VERSION
    });
  }
}

function logResult_(payload) {
  const action = String(payload.action || 'log_result').toLowerCase();
  if (action !== 'log_result') {
    return { ok: false, error: 'unsupported_action', version: RESULT_LOGGER_VERSION };
  }

  const result = payload.result && typeof payload.result === 'object'
    ? payload.result
    : payload;

  const phone = normalizePhone_(result.student_phone || payload.student_phone || '');
  const name = String(result.student_name || payload.student_name || '').trim();

  if (!phone) {
    return { ok: false, error: 'missing_phone', version: RESULT_LOGGER_VERSION };
  }

  if (phone === DEVELOPER_PHONE) {
    return {
      ok: true,
      skipped: true,
      reason: 'developer_phone',
      phone: phone,
      version: RESULT_LOGGER_VERSION
    };
  }

  const ss = getWorkbook_();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const allResults = ensureSheet_(ss, SHEET_ALL_RESULTS, RESULT_HEADERS);
    const students = ensureSheet_(ss, SHEET_STUDENTS, STUDENT_HEADERS);
    const index = ensureSheet_(ss, SHEET_ATTEMPT_INDEX, INDEX_HEADERS);

    const attemptId = String(
      payload.attempt_id ||
      result.attempt_id ||
      buildAttemptId_(phone, result)
    ).trim();

    if (isDuplicateAttempt_(index, allResults, attemptId)) {
      return {
        ok: true,
        duplicate: true,
        attempt_id: attemptId,
        phone: phone,
        version: RESULT_LOGGER_VERSION
      };
    }

    const recordedAt = new Date();
    const summary = buildSummary_(result, {
      recordedAt: recordedAt,
      attemptId: attemptId,
      phone: phone,
      name: name,
      clientVersion: String(payload.client_version || result.client_version || '')
    });

    const allRow = appendObjectRow_(allResults, RESULT_HEADERS, summary);

    const studentSheetName = makeStudentSheetName_(phone);
    const studentSheet = ensureSheet_(ss, studentSheetName, RESULT_HEADERS);
    studentSheet.setFrozenRows(1);
    appendObjectRow_(studentSheet, RESULT_HEADERS, summary);

    upsertStudentMaster_(students, summary);

    index.appendRow([
      attemptId,
      phone,
      recordedAt,
      allRow
    ]);

    return {
      ok: true,
      stored: true,
      attempt_id: attemptId,
      phone: phone,
      student_sheet: studentSheetName,
      all_results_row: allRow,
      version: RESULT_LOGGER_VERSION
    };
  } finally {
    lock.releaseLock();
  }
}

function buildSummary_(result, meta) {
  const items = Array.isArray(result.items) ? result.items : [];
  const correctNums = [];
  const wrongNums = [];
  const unansweredNums = [];

  items.forEach(function(item) {
    const q = Number(item.question_number);
    if (!Number.isFinite(q)) return;

    const unanswered = item.student_answer === null ||
      item.student_answer === undefined ||
      item.student_answer === '';

    if (unanswered) unansweredNums.push(q);
    else if (item.is_correct === true) correctNums.push(q);
    else wrongNums.push(q);
  });

  const startedAt = String(result.started_at || '');
  const submittedAt = String(result.submitted_at || '');

  return {
    recorded_at: meta.recordedAt,
    attempt_id: meta.attemptId,
    student_phone: meta.phone,
    student_name: meta.name,
    result_type: classifyResultType_(result),
    generated_exam_mode: String(result.generated_exam_mode || ''),
    generated_exam_round: String(result.generated_exam_round || ''),
    generated_exam_label: String(result.generated_exam_label || ''),
    test_name: String(result.test_name || ''),
    test_scope: String(result.test_scope || ''),
    started_at: startedAt,
    submitted_at: submittedAt,
    duration_seconds: durationSeconds_(startedAt, submittedAt),
    total_questions: toNumberOrBlank_(result.total_questions),
    answered_count: toNumberOrBlank_(result.answered_count),
    correct_count: toNumberOrBlank_(result.correct_count),
    wrong_count: toNumberOrBlank_(result.wrong_count),
    unanswered_count: toNumberOrBlank_(result.unanswered_count),
    earned_points: toNumberOrBlank_(result.earned_points),
    total_possible_points: toNumberOrBlank_(result.total_possible_points),
    section_score_100: toNumberOrBlank_(result.section_score_100),
    source_rounds: getSourceRounds_(result),
    correct_question_numbers: correctNums.join(','),
    wrong_question_numbers: wrongNums.join(','),
    unanswered_question_numbers: unansweredNums.join(','),
    client_version: meta.clientVersion
  };
}

function classifyResultType_(result) {
  const mode = String(result.generated_exam_mode || '').toLowerCase();
  const label = String(result.generated_exam_label || '').toLowerCase();
  const name = String(result.test_name || '').toLowerCase();
  const scope = String(result.test_scope || '').toLowerCase();
  const text = [mode, label, name, scope].join(' ');

  if (text.indexOf('wrong-review') >= 0 || text.indexOf('오답') >= 0) return 'WRONG_REVIEW';

  if (text.indexOf('question-practice') >= 0 ||
      text.indexOf('문항 선택') >= 0 ||
      text.indexOf('문항 연습') >= 0 ||
      text.indexOf('유형 연습') >= 0) {
    return 'QUESTION_PRACTICE';
  }

  const isLevel = text.indexOf('level') >= 0 || text.indexOf('레벨') >= 0;
  const isRandom = text.indexOf('random') >= 0 || text.indexOf('랜덤') >= 0;

  if (isLevel && isRandom) return 'LEVEL_RANDOM';
  if (isLevel) return 'LEVEL_FIXED';
  if (isRandom) return 'FULL_RANDOM';
  return 'FULL_FIXED';
}

function getSourceRounds_(result) {
  const rounds = {};

  []
    .concat(result.random_source_rounds || [])
    .concat(result.generated_exam_source_rounds || [])
    .concat(
      result.random_generation && Array.isArray(result.random_generation.source_rounds)
        ? result.random_generation.source_rounds
        : []
    )
    .forEach(function(value) {
      const s = String(value || '').trim();
      if (s) rounds[s] = true;
    });

  (Array.isArray(result.items) ? result.items : []).forEach(function(item) {
    const s = String(item.source_round || '').trim();
    if (s) rounds[s] = true;
  });

  if (String(result.generated_exam_round || '').trim()) {
    rounds[String(result.generated_exam_round).trim()] = true;
  }

  return Object.keys(rounds).sort().join(',');
}

function upsertStudentMaster_(sheet, summary) {
  const phone = summary.student_phone;
  const lastRow = sheet.getLastRow();
  let row = 0;

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (let i = 0; i < values.length; i++) {
      if (normalizePhone_(values[i][0]) === phone) {
        row = i + 2;
        break;
      }
    }
  }

  const now = summary.recorded_at;
  const examLabel = summary.generated_exam_label || summary.test_name || summary.test_scope || '';
  const score100 = summary.section_score_100;

  if (!row) {
    sheet.appendRow([
      phone,
      summary.student_name,
      now,
      now,
      1,
      summary.result_type,
      examLabel,
      score100
    ]);
    return;
  }

  const currentAttempts = Number(sheet.getRange(row, 5).getValue() || 0);

  sheet.getRange(row, 1, 1, STUDENT_HEADERS.length).setValues([[
    phone,
    summary.student_name || sheet.getRange(row, 2).getDisplayValue(),
    sheet.getRange(row, 3).getValue() || now,
    now,
    currentAttempts + 1,
    summary.result_type,
    examLabel,
    score100
  ]]);
}

function isDuplicateAttempt_(indexSheet, allResultsSheet, attemptId) {
  if (!attemptId) return false;
  if (findExactInColumn_(indexSheet, 1, attemptId)) return true;

  const attemptColumn = RESULT_HEADERS.indexOf('attempt_id') + 1;
  return attemptColumn > 0 && findExactInColumn_(allResultsSheet, attemptColumn, attemptId);
}

function findExactInColumn_(sheet, column, value) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const range = sheet.getRange(2, column, lastRow - 1, 1);
  const finder = range.createTextFinder(String(value)).matchEntireCell(true);
  return !!finder.findNext();
}

function appendObjectRow_(sheet, headers, obj) {
  const row = headers.map(function(key) {
    return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : '';
  });

  sheet.appendRow(row);
  return sheet.getLastRow();
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  const width = Math.max(1, headers.length);

  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }

  const currentHeaders = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  const mismatch = headers.some(function(header, i) {
    return String(currentHeaders[i] || '') !== header;
  });

  if (mismatch) {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
    sheet.getRange(1, 1, 1, width).setFontWeight('bold');
  }

  return sheet;
}

function makeStudentSheetName_(phone) {
  return ('S_' + normalizePhone_(phone)).slice(0, 99);
}

function getWorkbook_() {
  const id = PropertiesService.getScriptProperties().getProperty('RESULT_SPREADSHEET_ID');
  if (!id) throw new Error('RESULT_SPREADSHEET_ID is not configured. Run setupResultWorkbook() once.');
  return SpreadsheetApp.openById(id);
}

function buildAttemptId_(phone, result) {
  const raw = [
    phone,
    String(result.submitted_at || ''),
    String(result.generated_exam_mode || ''),
    String(result.generated_exam_round || ''),
    String(result.generated_exam_label || result.test_name || '')
  ].join('|');

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );

  const hex = digest.map(function(b) {
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');

  return 'A_' + hex.slice(0, 24);
}

function normalizePhone_(value) {
  return String(value || '').replace(/\D/g, '');
}

function durationSeconds_(startedAt, submittedAt) {
  if (!startedAt || !submittedAt) return '';

  const start = new Date(startedAt);
  const end = new Date(submittedAt);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

function toNumberOrBlank_(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

function parseIncomingPayload_(e) {
  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(String(e.parameter.payload));
  }

  const raw = String(
    e && e.postData && typeof e.postData.contents !== 'undefined'
      ? e.postData.contents
      : ''
  ).trim();

  if (raw) return JSON.parse(raw);
  throw new Error('Empty request payload.');
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function autoResizeSafe_(sheet, columns) {
  try {
    sheet.autoResizeColumns(1, columns);
  } catch (err) {}
}
