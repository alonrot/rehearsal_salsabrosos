# rehearsal_salsabrosos

Mobile-friendly availability poll for Los Salsabrosos. Everyone paints the half-hour
blocks they're free on a set of candidate dates; the page overlays everyone's answers
so the best slot is obvious. Replaces when2meet.

**Live:** <https://salsabrosos-rehearsal.netlify.app>

## Layout

| file | what it is |
|---|---|
| `index.html` | the whole app — HTML, CSS and JS in one file. No build step. |
| `logo.png`, `maracas.png` | the images, served as real cacheable files (30-day cache) |
| `rehearsal.html` | working copy; `./sync.sh` copies it over `index.html` before a commit |
| `server.py` | local dev server — the stand-in for the Apps Script backend |
| `gigs.json` | local mirror of the Sheet's `gigs` tab (dev only) |
| `apps_script.gs` | the production backend, pasted into the Google Sheet |
| `netlify.toml` | no build; publish repo root; `no-cache` on index.html |

`responses.json` is local dev state and is gitignored. In production the data lives in
the Google Sheet.

## Gigs

Each gig is its own poll with its own candidate dates. The page shows one button per
gig below the logo; tapping one reloads with `?gig=<id>` and swaps the whole grid.
The last choice is remembered in `localStorage`.

**The gig list lives in the Sheet**, tab `gigs`:

| A id | B label | C dates | D active | E startHour | F endHour | G people | H youtube | I sheets | J details |
|---|---|---|---|---|---|---|---|---|---|
| `RCR Oct 30` | `RCR Oct 30` | `2026-10-07,…` | ☑ | 9 | 23 | `Alon MV, …` | playlist URL | Drive folder URL | free text |

**The script reads by column position, not by header text.** Leave G in place even if you
never use `people`, or youtube / sheets / details land in the wrong fields.

- `id` is permanent and also becomes the name of that gig's response tab, so keep it
  simple. Sheets forbids `: \ / ? * [ ]` in tab names.
- `label` is the button text; rename it freely.
- `active` unticked hides the button without deleting the answers.
- `startHour` / `endHour` are optional; blank falls back to the page defaults.
- `people` is optional: a comma-separated roster, with instruments in brackets —
  `Anushka S (lead singer), Daniel N (bass), karl d`. Those names show as buttons
  immediately (dimmed until that person answers), and Gig Details lists them as
  **Confirmed** / **Not yet**. Chips use only the name, so the brackets never affect
  matching against submitted rows. Blank is fine — the buttons then build themselves
  from whoever has answered.
  Note `boot()` must copy `gig.people` into `CONFIG.people`; without that line the
  whole column is silently dead.
- `youtube`, `sheets`, `details` feed the Gig Details tab — see below.

## Who are you? / seeing one person's slots

The name row is always visible and is the only view control — there is no Me/Everyone
toggle.

- **Tap a name** → that chip highlights, everyone else stays plain, and the grid shows
  that person's slots, read-only.
- **Tap another name** → switches straight to them.
- **Tap the highlighted name again**, or anywhere outside the calendar (the logo, the
  hint line, empty space) → deselects, back to everyone's heat map. Taps inside the
  grid are excluded so you can still tap a slot to see who's free, and the whole
  thing is disabled while editing so a stray tap can't drop half-painted work.
- **Edit availability** (bottom, only when someone is selected) → edit mode. The buttons
  become **Submit** and **Discard**, and the name chips freeze so a stray tap can't swap
  person mid-paint. Discard restores their saved grid and stays on them.

Painting is gated on edit mode, so simply viewing someone can never change their answer.
Nothing is remembered between visits: every load starts on the group overlay, so you
can't accidentally submit as the last person you were looking at.

Typing is still available behind **+ I'm new**, and guarded: a name differing only by
case resolves silently to the existing one, and a near-match (`anu` when `Anushka S`
exists, or a second `John`) asks *"is that you?"* with an explicit way to say no. It
never merges two people on its own, and Submit is disabled until that is answered.

Names someone introduces via **+ I'm new** are remembered per gig in `localStorage`, so
the chip survives a reload or tapping away even before they have painted anything. It is
local to that device — other people only see names that have actually been submitted.

## Rehearsal / Details

Under the gig row sit two tabs, right-aligned: **Gig Details** is the landing view and
**Rehearsal** is the availability grid. Gig Details is read-only, built from three
optional cells on the gig's row: `details` (free text —
a `Label: value` line becomes a spec row, a short bare line becomes a sub-heading, URLs
linkify), `youtube` (playlist URL) and `sheets` (sheet-music folder URL) — the last two
rendered as tappable cards. Leave them blank and the tab says there are no details yet.
Sheet content is HTML-escaped before rendering, and the card icons are inline SVG sized
in CSS: the `width`/`height` attributes alone let an svg collapse to ~2px in a flex row.

Switching back to Rehearsal re-runs `layout()`, because `#vp` has no measurable size
while it is `display:none` and the grid geometry is computed from its box.

## The two backends

`index.html` talks to one of two interchangeable backends, picked automatically by
hostname — localhost and LAN addresses use `server.py`, anything else uses Apps Script.
You never edit the file to switch.

```
GET  ?what=gigs   -> {gigs:[...]}
GET  ?gig=<id>    -> {gigs:[...], responses:[...]}
POST {gig, name, tz, submittedAt, availability}
```

Submissions upsert by name *within a gig*: re-submitting under the same name replaces
that person's answer rather than adding a row.

The POST deliberately sends `Content-Type: text/plain;charset=utf-8`. That keeps it a
CORS-"simple" request so the browser skips the preflight `OPTIONS` — which matters
because Apps Script web apps don't answer `OPTIONS`. Apps Script still receives the raw
JSON in `e.postData.contents`. **Don't change it to `application/json`** or submissions
will fail from the deployed site while still working locally.

## Loading

Apps Script takes ~2s per request, so the page is built to make **one** of them, not two.
`doGet` returns `{gigs, responses}` together, and `boot()` asks for the gig's responses in
the same call whenever it already knows the gig — from `?gig=` in the link, or the last
gig remembered in `localStorage`. Only a first-time visitor on a bare URL pays for a
second round trip.

The loading panel stays up until the grid actually has data in it. Removing it earlier
(which is what it used to do) left a fully drawn but **empty** calendar on screen for the
length of the responses fetch, which read as a bug.

`maracas.png` is `<link rel="preload">`ed and kept in the DOM while hidden, so it is
already cached when the name field reveals it.

## Local testing

```bash
python3 server.py 8000      # then http://localhost:8000/
```

From a phone on the same wifi: `ipconfig getifaddr en0`, then `http://<that-address>:8000/`.

## Deploying

```bash
./sync.sh
git add -A && git commit -m "..." && git push
```

Netlify redeploys in seconds. See the Band project doc for the full runbook.
