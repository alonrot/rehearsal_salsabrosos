# rehearsal_salsabrosos

Mobile-friendly availability poll for Los Salsabrosos rehearsals — a replacement for
when2meet. Everyone paints the half-hour blocks they're free on a set of candidate
dates; the page overlays everyone's answers so the best slot is obvious.

Live: _(Netlify URL goes here)_

## Layout

| file             | what it is                                                       |
|------------------|------------------------------------------------------------------|
| `index.html`     | the whole app — HTML, CSS and JS in one file, no build step       |
| `server.py`      | local dev server: serves the folder **and** stores submissions    |
| `apps_script.gs` | the production backend, pasted into a Google Sheet's Apps Script |
| `sync.sh`        | copies `../rehearsal.html` over `index.html` before a commit      |
| `netlify.toml`   | tells Netlify there is no build — publish the repo root           |

`responses.json` is local dev state and is gitignored; in production the data
lives in the Google Sheet.

## Editing a poll

Everything you change per poll is in the `CONFIG` block near the top of the
`<script>` in `index.html`:

```js
const CONFIG = {
  dates: ["2026-10-07", "..."],   // the candidate dates
  startHour: 9, endHour: 23,      // vertical range of the grid
  slotMinutes: 30,                // granularity
  apiBase: "",                    // "" = server.py · or the Apps Script /exec URL
  pollMs: 2000                    // >= 8000 when apiBase is Apps Script
};
```

## Local testing

```bash
python3 server.py 8000
```

Then open <http://localhost:8000/>. With `apiBase: ""` the page reads
`GET /data.json` and writes `POST /submit`, both handled by `server.py`, which
persists to `responses.json`.

To test from your phone on the same wifi, find your Mac's LAN address
(`ipconfig getifaddr en0`) and open `http://<that-address>:8000/`.

## The two backends

`index.html` talks to one of two interchangeable backends, chosen by `CONFIG.apiBase`:

- **`""`** → same-origin `server.py`. Dev only; Netlify cannot run Python.
- **an Apps Script `/exec` URL** → both GET and POST go there instead.

Both speak the same shape: `GET` returns `{responses:[...]}`, `POST` takes one
person's JSON and upserts it by name (re-submitting under the same name replaces
the previous answer rather than adding a row).

The POST deliberately sends `Content-Type: text/plain;charset=utf-8`. That keeps it a
CORS-"simple" request so the browser skips the preflight `OPTIONS` — which matters
because Apps Script web apps don't answer `OPTIONS`. Apps Script still receives the
raw JSON in `e.postData.contents`. **Don't change it to `application/json`** or
submissions will start failing from the deployed site while still working locally.

## Deploying

Netlify is connected to this repo's `master` branch and redeploys on every push.
Since there's no build step, a push is live in a few seconds.

```bash
./sync.sh                      # pull in the latest ../rehearsal.html
git add -A && git commit -m "..."
git push
```
