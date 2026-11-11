/**
 * TOPIK I listening: dedicated audio issue intake.
 * Install in a NEW Apps Script project, not the existing student-results project.
 * Script property SPREADSHEET_ID must identify the independent error spreadsheet.
 * Deploy as Web App, Execute as me; who has access: Anyone (public training site).
 * Accepts only a minimal anonymous allow-listed schema, never student personal data.
 */
const CONFIG = Object.freeze({
  spreadsheetProperty: "SPREADSHEET_ID",
  sheetName: "오디오오류기록",
  maxPayloadChars: 6500,
  allowedTypes: ["buffering_timeout", "playback_not_progressing", "media_error"],
  headerLength: 19
});

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function sanitizedText_(value, max) {
  const s = String(value == null ? "" : value).slice(0, max);
  // Never permit user input to be interpreted by Sheets as a formula.
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function finiteNumber_(value, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : "";
}
function bool_(value) {
  return value === true ? "true" : value === false ? "false" : "";
}
function parseIssue_(issue) {
  if (!issue || typeof issue !== "object" || Array.isArray(issue)) return null;
  const type = String(issue.type || "");
  if (!CONFIG.allowedTypes.includes(type)) return null;
  const eventId = String(issue.event_id || "");
  if (!/^[a-zA-Z0-9._-]{8,150}$/.test(eventId)) return null;
  const ts = String(issue.timestamp || "");
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(ts)) return null;
  const errorCode = issue.media_error && typeof issue.media_error === "object"
    ? issue.media_error.code : "";
  return [
    new Date(), eventId, sanitizedText_(ts, 40), type,
    sanitizedText_(issue.exam, 80),
    sanitizedText_(issue.question, 32),
    sanitizedText_(issue.audio_file, 160),
    finiteNumber_(issue.position_seconds, 28800),
    finiteNumber_(issue.duration_seconds, 28800),
    finiteNumber_(issue.ready_state, 4),
    finiteNumber_(issue.network_state, 3),
    bool_(issue.paused), bool_(issue.ended), bool_(issue.document_hidden),
    sanitizedText_(issue.browser, 24), bool_(issue.online),
    finiteNumber_(errorCode, 4),
    sanitizedText_(issue.session, 120),
    sanitizedText_(issue.schema, 40)
  ];
}
function doPost(e) {
  try {
    const raw = (e && e.parameter && e.parameter.payload) || "";
    if (typeof raw !== "string" || raw.length > CONFIG.maxPayloadChars) {
      return jsonResponse_({ok:false,error:"invalid_payload"});
    }
    const parsed = JSON.parse(raw);
    if (parsed.action !== "log_audio_issue") return jsonResponse_({ok:false,error:"invalid_action"});
    const row = parseIssue_(parsed.issue);
    if (!row) return jsonResponse_({ok:false,error:"invalid_issue"});

    const docId = PropertiesService.getScriptProperties().getProperty(CONFIG.spreadsheetProperty);
    if (!docId) return jsonResponse_({ok:false,error:"receiver_not_configured"});
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(8000)) return jsonResponse_({ok:false,error:"busy"});
    try {
      const ss = SpreadsheetApp.openById(docId);
      const sheet = ss.getSheetByName(CONFIG.sheetName);
      if (!sheet) return jsonResponse_({ok:false,error:"sheet_missing"});
      const last = sheet.getLastRow();
      if (last > 1) {
        const found = sheet.getRange(2,2,last-1,1)
          .createTextFinder(row[1]).matchEntireCell(true).findNext();
        if (found) return jsonResponse_({ok:true,duplicate:true});
      }
      if (row.length !== CONFIG.headerLength) throw new Error("internal_schema_error");
      sheet.appendRow(row);
      return jsonResponse_({ok:true,recorded:true});
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error("[TOPIKAudioIssueIntake]", String(err));
    return jsonResponse_({ok:false,error:"server_error"});
  }
}
// Deliberately do not expose rows or configuration via GET.
function doGet() {
  return jsonResponse_({service:"topik1-listening-audio-issues",version:"20261111",public_records:false});
}
