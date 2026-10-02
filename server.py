#!/usr/bin/env python3
"""
Dev server for the rehearsal poll — the local stand-in for apps_script.gs.
Serves this folder like `python3 -m http.server` AND answers the same two
endpoints the Apps Script web app does, so the page needs no changes:

    GET  /data.json?what=gigs   -> {"gigs": [...]}
    GET  /data.json?gig=<id>    -> {"gigs": [...], "responses": [...]}
    POST /submit                -> body is one person's JSON (must include "gig")

Gigs are read from gigs.json (the local mirror of the Sheet's "gigs" tab).
Responses go to responses.json, keyed by gig id — the local equivalent of
one tab per gig. Both files sit next to this script. responses.json is
gitignored and is recreated on the first submission.

Run:   python3 server.py 8000
Phone on the same wifi:  http://$(ipconfig getifaddr en0):8000/
"""
import json, os, sys, tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "responses.json")
GIGS = os.path.join(HERE, "gigs.json")


def read_json(path, fallback):
    if os.path.exists(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return fallback


def read_data():
    """{"<gig id>": [payload, ...], ...}"""
    d = read_json(DATA, {})
    return d if isinstance(d, dict) else {}


def read_gigs():
    g = read_json(GIGS, {"gigs": []}).get("gigs", [])
    return [x for x in g if x.get("active", True)]


def write_data(data):
    tmp = tempfile.NamedTemporaryFile("w", dir=HERE, suffix=".tmp", delete=False)
    json.dump(data, tmp, indent=1)
    tmp.close()
    os.replace(tmp.name, DATA)      # atomic: readers never see a half-written file


class Handler(SimpleHTTPRequestHandler):
    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path != "/data.json":
            return SimpleHTTPRequestHandler.do_GET(self)
        q = parse_qs(u.query)
        out = {"gigs": read_gigs()}
        if q.get("what", [""])[0] != "gigs":
            gig = q.get("gig", [""])[0]
            if gig:
                out["responses"] = read_data().get(gig, [])
        return self._json(out)

    def do_POST(self):
        if urlparse(self.path).path != "/submit":
            return self._json({"error": "not found"}, 404)
        try:
            n = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return self._json({"error": "bad json"}, 400)

        name = str(payload.get("name", "")).strip()
        gig = str(payload.get("gig", "")).strip()
        if not name:
            return self._json({"error": "name required"}, 400)
        if not gig:
            return self._json({"error": "gig required"}, 400)

        data = read_data()
        rows = data.get(gig, [])
        key = name.lower()
        # upsert within this gig only: a re-submit under the same name replaces
        rows = [r for r in rows if str(r.get("name", "")).strip().lower() != key]
        rows.append(payload)
        data[gig] = rows
        write_data(data)
        return self._json({"ok": True, "count": len(rows)})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print("Serving on http://0.0.0.0:%d" % port)
    print("  gigs:      %s" % GIGS)
    print("  responses: %s" % DATA)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
