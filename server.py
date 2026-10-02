#!/usr/bin/env python3
"""
Dev server for rehearsal.html — serves the folder like `python3 -m http.server`
AND stores availability submissions in responses.json (next to this file).

Run:   python3 server.py 8000
"""
import json, os, sys, tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "responses.json")


def read_data():
    if os.path.exists(DATA):
        try:
            with open(DATA) as f:
                return json.load(f)
        except Exception:
            pass
    return {"responses": []}


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
        if self.path.split("?")[0] == "/data.json":
            return self._json(read_data())
        return SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        if self.path.split("?")[0] != "/submit":
            return self._json({"error": "not found"}, 404)
        try:
            n = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return self._json({"error": "bad json"}, 400)
        name = str(payload.get("name", "")).strip()
        if not name:
            return self._json({"error": "name required"}, 400)

        data = read_data()
        key = name.lower()
        # one record per person: a re-submit under the same name replaces
        data["responses"] = [r for r in data["responses"]
                             if str(r.get("name", "")).strip().lower() != key]
        data["responses"].append(payload)

        tmp = tempfile.NamedTemporaryFile("w", dir=HERE, suffix=".tmp", delete=False)
        json.dump(data, tmp, indent=1)
        tmp.close()
        os.replace(tmp.name, DATA)          # atomic: readers never see a half-written file
        return self._json({"ok": True, "count": len(data["responses"])})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print("Serving on http://0.0.0.0:%d  —  data file: %s" % (port, DATA))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
