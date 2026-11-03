from conftest import make_client


def test_spa_fallback_and_assets(env):
    build = env / "build"
    (build / "_app" / "immutable").mkdir(parents=True)
    (build / "index.html").write_text("<html>app</html>")
    (build / "_app" / "immutable" / "x.js").write_text("js")
    (env / "secret.txt").write_text("nope")
    with make_client() as client:
        deep = client.get("/projects/abc/settings")
        assert deep.status_code == 200 and deep.text == "<html>app</html>"
        asset = client.get("/_app/immutable/x.js")
        assert asset.text == "js" and "immutable" in asset.headers["cache-control"]
        assert client.get("/../secret.txt").text != "nope"
        assert client.get("/api/nope").status_code == 404
        assert client.post("/api/nope", json={}).status_code == 404
        missing = client.get("/_app/immutable/gone.js")
        assert missing.status_code == 404 and "html" not in missing.headers["content-type"]
        assert client.get("/favicon-old.png").status_code == 404
        assert client.get("/healthz").json() == {"status": "ok"}
        assert client.get("/api/healthz").json() == {"status": "ok"}


def test_unbuilt_frontend_explains_itself(client):
    res = client.get("/")
    assert res.status_code == 503 and "npm run build" in res.text
