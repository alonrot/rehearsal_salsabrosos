/**
 * Salsabrosos rehearsal scheduler — Google Apps Script backend.
 * Same API shape as server.py: GET -> {responses:[...]}, POST JSON -> saves (one row per person).
 *
 * Setup (one time, ~10 min):
 *   1. sheets.new  ->  Extensions -> Apps Script, paste this file.
 *   2. Deploy -> New deployment -> Web app
 *        Execute as: Me        Who has access: Anyone
 *   3. Copy the /exec URL into CONFIG.apiBase in rehearsal.html,
 *      and set CONFIG.pollMs to 8000 or more (Apps Script has daily quotas).
 */
const SHEET_NAME = "responses";

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = JSON.parse(e.postData.contents);
    const name = String(p.name || "").trim();
    if (!name) return json_({ error: "name required" });
    const sh = sheet_();
    const rows = sh.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim().toLowerCase() === name.toLowerCase()) sh.deleteRow(i + 1);
    }
    sh.appendRow([name, p.tz || "", p.submittedAt || new Date().toISOString(),
                  JSON.stringify(p.availability || {})]);
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  const rows = sheet_().getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    out.push({ name: rows[i][0], tz: rows[i][1], submittedAt: rows[i][2],
               availability: JSON.parse(rows[i][3] || "{}") });
  }
  return json_({ responses: out });
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); sh.appendRow(["name","tz","submittedAt","availability_json"]); }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
