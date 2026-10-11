"""Vercel function for the matchmaker. vercel.json rewrites /mm/* here; the app's routes live at the root, so the
prefix is stripped before FastAPI sees the path."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from matchmaker.vercel_app import app as matchmaker_app  # noqa: E402

PREFIXES = ("/api/mm", "/mm")


async def app(scope, receive, send):
    if scope["type"] in ("http", "websocket"):
        path = scope.get("path", "")
        for prefix in PREFIXES:
            if path == prefix or path.startswith(prefix + "/"):
                stripped = path[len(prefix):] or "/"
                scope = {**scope, "path": stripped, "raw_path": stripped.encode()}
                break
    await matchmaker_app(scope, receive, send)
