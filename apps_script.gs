/**
 * Salsabrosos rehearsal scheduler — Google Apps Script backend.
 *
 * SHEET LAYOUT
 *   "gigs"        the registry of polls. One row per gig:
 *                   id | label | dates | active | startHour | endHour
 *                 - id      permanent; also becomes the name of that gig's
 *                           response tab, so keep it simple (letters, digits,
 *                           spaces, dashes). Sheets forbids : \ / ? * [ ]
 *                 - label   what shows on the button; safe to rename any time
 *                 - dates   comma-separated ISO dates, e.g. 2026-10-07,2026-10-10
 *                 - active  FALSE (or a checkbox unticked) hides the button
 *                 - startHour / endHour  optional; blank falls back to the page
 *   "<gig id>"    one tab per gig, created on that gig's first submission:
 *                   name | tz | submittedAt | availability_json
 *
 * SETUP
 *   Run setup() once from this editor (Run ▸ setup). It creates the "gigs" tab
 *   with headers and the first gig. After that, adding a gig is a new row —
 *   no code change and no Netlify deploy.
 *
 * DEPLOY
 *   Deploy ▸ Manage deployments ▸ pencil ▸ Version: New version ▸ Deploy.
 *   That keeps the same /exec URL. "New deployment" mints a NEW url instead.
 *   Execute as: Me.   Who has access: Anyone.
 *
 * API (same shape as server.py)
 *   GET  ?what=gigs        -> {gigs:[...]}
 *   GET  ?gig=<id>         -> {gigs:[...], responses:[...]}
 *   POST {name, gig, ...}  -> upsert by name within that gig
 */

const GIGS_SHEET = "gigs";
const HEADERS = ["name", "tz", "submittedAt", "availability_json"];

/** Run this once from the editor. Safe to re-run — it won't clobber an existing tab. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(GIGS_SHEET)) return "gigs tab already exists — nothing changed";
  const sh = ss.insertSheet(GIGS_SHEET, 0);
  sh.appendRow(["id", "label", "dates", "active", "startHour", "endHour"]);
  sh.appendRow([
    "RCR Oct 30",
    "RCR Oct 30",
    "2026-10-07,2026-10-10,2026-10-11,2026-10-14,2026-10-17," +
    "2026-10-18,2026-10-21,2026-10-24,2026-10-25,2026-10-28",
    true, 9, 23
  ]);
  sh.setFrozenRows(1);
  sh.getRange("D2:D").insertCheckboxes();
  sh.autoResizeColumns(1, 6);
  return "gigs tab created";
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const out = { gigs: readGigs_() };
  if (p.what !== "gigs" && p.gig) out.responses = readResponses_(String(p.gig));
  return json_(out);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = JSON.parse(e.postData.contents);
    const name = String(p.name || "").trim();
    const gig = String(p.gig || "").trim();
    if (!name) return json_({ error: "name required" });
    if (!gig) return json_({ error: "gig required" });

    const sh = respSheet_(gig);
    const rows = sh.getDataRange().getValues();
    // upsert: drop any existing row for this person in THIS gig, then append
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]).trim().toLowerCase() === name.toLowerCase()) sh.deleteRow(i + 1);
    }
    sh.appendRow([
      name,
      p.tz || "",
      p.submittedAt || new Date().toISOString(),
      JSON.stringify(p.availability || {})
    ]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function readGigs_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GIGS_SHEET);
  if (!sh) return [];
  const rows = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][0] || "").trim();
    if (!id) continue;
    if (!truthy_(rows[i][3])) continue;                       // active column
    const g = {
      id: id,
      label: String(rows[i][1] || "").trim() || id,
      dates: String(rows[i][2] || "").split(",").map(s => s.trim()).filter(Boolean)
    };
    if (rows[i][4] !== "" && rows[i][4] != null) g.startHour = Number(rows[i][4]);
    if (rows[i][5] !== "" && rows[i][5] != null) g.endHour = Number(rows[i][5]);
    out.push(g);
  }
  return out;
}

function readResponses_(gigId) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(gigId);
  if (!sh) return [];                                          // no submissions yet
  const rows = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    let av = {};
    try { av = JSON.parse(rows[i][3] || "{}"); } catch (err) { av = {}; }
    out.push({
      name: rows[i][0],
      tz: rows[i][1],
      submittedAt: rows[i][2] instanceof Date ? rows[i][2].toISOString() : rows[i][2],
      availability: av
    });
  }
  return out;
}

function respSheet_(gigId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(gigId);
  if (!sh) {
    sh = ss.insertSheet(gigId);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Sheets gives booleans from checkboxes and strings from typed text. Blank = active. */
function truthy_(v) {
  if (v === "" || v == null) return true;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return !(s === "false" || s === "no" || s === "0");
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
