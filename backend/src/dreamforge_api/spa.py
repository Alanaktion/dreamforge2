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

    @app.api_route(
        "/api/{rest:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        include_in_schema=False,
    )
    def api_not_found(rest: str):
        raise HTTPException(404, "Not found")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str, request: Request):
        if path:
            candidate = (build_dir / path).resolve()
            if candidate.is_relative_to(build_dir) and candidate.is_file():
                headers = (
                    {"Cache-Control": "public, max-age=31536000, immutable"}
                    if path.startswith("_app/immutable/")
                    else {"Cache-Control": "public, max-age=3600"}
                )
                return FileResponse(candidate, headers=headers)
            # A missing asset (e.g. a stale tab asking for an old chunk) is a 404, not the app
            # shell: HTML served as JavaScript only produces a confusing MIME error.
            if path.startswith("_app/") or "." in path.rsplit("/", 1)[-1]:
                raise HTTPException(404, "Not found")
        if not index.is_file():
            return HTMLResponse(NOT_BUILT, status_code=503)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
