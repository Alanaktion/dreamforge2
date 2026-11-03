"""Serves the SvelteKit single-page app build.

``npm run build`` writes a static build (adapter-static) to ``build/``: hashed assets under
``_app/immutable`` and an ``index.html`` fallback. Any GET that is not an API route and not a
file in the build gets ``index.html``, and SvelteKit's client router takes it from there.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse

NOT_BUILT = (
    "<!doctype html><title>DreamForge</title><p>The frontend has not been built. Run "
    "<code>npm run build</code>, or use the Vite dev server (<code>npm run dev</code>) "
    "during development.</p>"
)


def mount_spa(app: FastAPI, build_dir: Path) -> None:
    build_dir = build_dir.resolve()
    index = build_dir / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str, request: Request):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not found")
        if path:
            candidate = (build_dir / path).resolve()
            if candidate.is_relative_to(build_dir) and candidate.is_file():
                headers = (
                    {"Cache-Control": "public, max-age=31536000, immutable"}
                    if path.startswith("_app/immutable/")
                    else {"Cache-Control": "public, max-age=3600"}
                )
                return FileResponse(candidate, headers=headers)
        if not index.is_file():
            return HTMLResponse(NOT_BUILT, status_code=503)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
