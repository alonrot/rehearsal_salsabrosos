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

| id | label | dates | active | startHour | endHour | people |
|---|---|---|---|---|---|---|
| `RCR Oct 30` | `RCR Oct 30` | `2026-10-07,2026-10-10,…` | ☑ | 9 | 23 | `Alon MV, Skye, …` |

- `id` is permanent and also becomes the name of that gig's response tab, so keep it
  simple. Sheets forbids `: \ / ? * [ ]` in tab names.
- `label` is the button text; rename it freely.
- `active` unticked hides the button without deleting the answers.
- `startHour` / `endHour` are optional; blank falls back to the page defaults.
- `people` is optional: a comma-separated roster. Those names show as buttons
  immediately (dimmed until that person answers), so you can also see who is
  still missing. Blank is fine — the buttons then build themselves from whoever
  has answered.

## Who are you?

Nobody types their name twice. The page shows a button per known person; tapping
one loads that person's saved grid, and the row collapses to a single chip
afterwards (remembered per gig in `localStorage`). The free-text field is hidden
behind **+ I'm new**.

Typing is still possible, and guarded: a name that differs only by case resolves
silently to the existing one, and a near-match (`anu` when `Anushka S` exists,
or a second `John`) asks *"is that you?"* with an explicit way to say no. It
never merges two people on its own, and Submit is disabled until that question is
answered. This is what stopped `Skye Ocaranza` and `Skye` becoming two rows.

**Adding a gig is one new row.** No code change, no deploy. Responses for it land in a
new tab named after the `id`, created on the first submission.

For local testing, mirror the same gig into `gigs.json`.

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
