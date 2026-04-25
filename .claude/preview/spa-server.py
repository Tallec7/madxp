#!/usr/bin/env python3
"""Tiny SPA-aware static server: falls back to /index.html for unknown paths."""
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4297
DIR = sys.argv[2] if len(sys.argv) > 2 else "."


class SPAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        full = os.path.join(DIR, path.lstrip("/"))
        if not os.path.exists(full) or os.path.isdir(full):
            if not path.startswith("/assets") and "." not in os.path.basename(path):
                self.path = "/index.html"
        return super().do_GET()


HTTPServer(("127.0.0.1", PORT), SPAHandler).serve_forever()
