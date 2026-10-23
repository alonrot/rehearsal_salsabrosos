/**
 * Salsabrosos rehearsal scheduler — Google Apps Script backend.
 *
 * SHEET LAYOUT
 *   "gigs"        the registry of polls. One row per gig:
 *                   id | label | dates | active | startHour | endHour |
 *                   (unused) | youtube | sheets | details
 *                 - id      permanent; also becomes the name of that gig's
 *                           response tab, so keep it simple (letters, digits,
 *                           spaces, dashes). Sheets forbids : \ / ? * [ ]
 *                 - label   what shows on the button; safe to rename any time
 *                 - dates   comma-separated ISO dates, e.g. 2026-10-07,2026-10-10
 *                 - active  FALSE (or a checkbox unticked) hides the button
 *                 - startHour / endHour  optional; blank falls back to the page
 *                 - youtube  OPTIONAL playlist URL - shown as a tappable card
 *                 - sheets   OPTIONAL sheet-music folder URL - shown as a card
 *                 - details  OPTIONAL free text: venue, address, load-in, dress code.
 *                            Blank lines separate paragraphs; URLs become links.
 *   "<gig id>"    one tab per gig, created on that gig's first submission:
 *                   name | tz | submittedAt | availability_json | instrument
 *                   | (unused) | song | key
 *                 Columns G/H are the SETLIST for this gig: one song per row from
 *                 row 2, H free text (key, "horns out", ...) shown as a dim note.
 *                 They are independent of the response rows in A:E, which is why
 *                 doPost() overwrites a row in place and never deletes or appends -
 *                 either would drag the setlist out of alignment.
 *                 A row is created the moment someone adds themselves on the Gig
 *                 Details tab, before any availability exists. That row IS the
 *                 roster: one record per person per gig, so a name can never be
 *                 on the roster and in the responses under two spellings.
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
const HEADERS = ["name", "tz", "submittedAt", "availability_json", "instrument"];

/** Run this once from the editor. Safe to re-run — it won't clobber an existing tab. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(GIGS_SHEET)) return "gigs tab already exists — nothing changed";
  const sh = ss.insertSheet(GIGS_SHEET, 0);
  sh.appendRow(["id", "label", "dates", "active", "startHour", "endHour", "",
                "youtube", "sheets", "details"]);
  sh.appendRow([
    "RCR Oct 30",
    "RCR Oct 30",
    "2026-10-07,2026-10-10,2026-10-11,2026-10-14,2026-10-17," +
    "2026-10-18,2026-10-21,2026-10-24,2026-10-25,2026-10-28",
    true, 9, 23, "", "", "", ""
  ]);
  sh.setFrozenRows(1);
  sh.getRange("D2:D").insertCheckboxes();
  sh.autoResizeColumns(1, 10);
  return "gigs tab created";
}

/**
 * Create the response tab for every active gig that doesn't have one yet.
 * Run from the editor (Run ▸ newGigTabs) after adding rows to "gigs" — a tab is
 * otherwise only born on that gig's first submission, which is too late to type
 * the setlist into columns G/H. Safe to re-run; it never touches an existing tab.
 */
function newGigTabs() {
  const made = [];
  readGigs_().forEach(function (g) {
    if (SpreadsheetApp.getActiveSpreadsheet().getSheetByName(g.id)) return;
    respSheet_(g.id);
    made.push(g.id);
  });
  const msg = made.length ? "created: " + made.join(", ") : "every active gig already has a tab";
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, "newGigTabs", 8);
  return msg;
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const out = { gigs: readGigs_() };
  if (p.what !== "gigs" && p.gig) {
    const gigId = String(p.gig);
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(gigId);
    out.responses = sh ? readResponses_(sh) : [];
    const setlist = sh ? readSetlist_(sh) : [];
    for (let i = 0; setlist.length && i < out.gigs.length; i++)
      if (out.gigs[i].id === gigId) { out.gigs[i].setlist = setlist; break; }
  }
  return json_(out);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = JSON.parse(e.postData.contents);
    const name = String(p.name || "").trim();
    const gig = String(p.gig || "").trim();
    var inst = String(p.instrument || "").trim();
    if (!name) return json_({ error: "name required" });
    if (!gig) return json_({ error: "gig required" });

    const sh = respSheet_(gig);
    const last = sh.getLastRow();
    const rows = last > 1 ? sh.getRange(2, 1, last - 1, 5).getValues() : [];

    // One record per person per gig, overwritten IN PLACE. Never deleteRow() or
    // appendRow(): the setlist sits in G:H of this same tab and getLastRow()
    // counts it, so either would misalign the songs or strand the response rows.
    var row = 0, dupes = [];
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toLowerCase() !== name.toLowerCase()) continue;
      if (row) { dupes.push(i + 2); continue; }
      // a plain availability submit carries no instrument - keep the stored one
      if (!inst) inst = String(rows[i][4] || "").trim();
      row = i + 2;
    }
    if (!row) {                                  // reuse a blank name cell, else grow
      for (var j = 0; j < rows.length && !row; j++)
        if (!String(rows[j][0] == null ? "" : rows[j][0]).trim()) row = j + 2;
      if (!row) row = Math.max(last, 1) + 1;
    }

    sh.getRange(row, 1, 1, 5).setValues([[
      name,
      p.tz || "",
      p.submittedAt || new Date().toISOString(),
      JSON.stringify(p.availability || {}),
      inst
    ]]);
    // older tabs may still carry a duplicate spelling; blank it, don't delete it
    for (var k = 0; k < dupes.length; k++) sh.getRange(dupes[k], 1, 1, 5).clearContent();
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
    if (rows[i][7]) g.youtube = String(rows[i][7]).trim();
    if (rows[i][8]) g.sheets = String(rows[i][8]).trim();
    if (rows[i][9]) g.details = String(rows[i][9]);
    out.push(g);
  }
  return out;
}

/** Setlist for one gig: column G = song, column H = key or note, from row 2 down. */
function readSetlist_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 7, last - 1, 2).getValues();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const title = String(rows[i][0] == null ? "" : rows[i][0]).trim();
    if (!title) continue;
    out.push({ title: title, note: String(rows[i][1] == null ? "" : rows[i][1]).trim() });
  }
  return out;
}

function readResponses_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];                        // a hand-made or empty tab
  const rows = sh.getRange(1, 1, last, 5).getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    let av = {};
    try { av = JSON.parse(rows[i][3] || "{}"); } catch (err) { av = {}; }
    out.push({
      name: rows[i][0],
      tz: rows[i][1],
      submittedAt: rows[i][2] instanceof Date ? rows[i][2].toISOString() : rows[i][2],
      availability: av,
      instrument: String(rows[i][4] || "").trim()
    });
  }
  return out;
}

function respSheet_(gigId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(gigId);
  if (!sh) {
    sh = ss.insertSheet(gigId);
    sh.getRange(1, 1, 1, 8).setValues([HEADERS.concat(["", "song", "key"])]);
    sh.setFrozenRows(1);
  } else if (!sh.getRange(1, 1).getValue()) {   // a tab someone added by hand
    sh.getRange(1, 1, 1, 8).setValues([HEADERS.concat(["", "song", "key"])]);
    sh.setFrozenRows(1);
  } else {                                      // migrate tabs made before these columns
    if (!sh.getRange(1, 5).getValue()) sh.getRange(1, 5).setValue("instrument");
    if (!sh.getRange(1, 7).getValue()) sh.getRange(1, 7).setValue("song");
    if (!sh.getRange(1, 8).getValue()) sh.getRange(1, 8).setValue("key");
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
