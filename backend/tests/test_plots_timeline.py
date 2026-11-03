import json
from datetime import date

from conftest import add_user
from test_entities import folder, new_entity
from test_projects import create
from test_stories import new_story, story_url

from dreamforge_api.services import writing


def plots_url(project_id):
    return f"/api/projects/{project_id}/plotlines"


def commenter(admin, project_id):
    invite = admin.post(f"/api/projects/{project_id}/invites", json={"role": "commenter"}).json()
    reader = add_user(admin, "c@example.test", "commenter")
    reader.post(f"/api/invites/{invite['token']}/accept", json={})
    return reader


# --- Plotlines ------------------------------------------------------------------------------


def test_plotline_from_template_and_beats(admin, env):
    project_id = create(admin)
    story = new_story(admin, project_id)
    res = admin.post(
        plots_url(project_id),
        json={"title": " Arc ", "storyId": story["storyId"], "template": "save_the_cat"},
    )
    assert res.status_code == 201, res.text
    plotline = res.json()
    assert plotline["title"] == "Arc" and plotline["template"] == "save_the_cat"
    assert len(plotline["beats"]) == 15 and plotline["beats"][0]["title"] == "Opening Image"
    url = f"{plots_url(project_id)}/{plotline['id']}"

    # The file keeps the old camelCase layout.
    raw = json.loads((folder(env, project_id) / "plotlines" / f"{plotline['id']}.json").read_text())
    assert raw["storyId"] == story["storyId"] and raw["beats"][0]["sceneId"] is None

    listing = admin.get(plots_url(project_id)).json()
    assert [p["id"] for p in listing["plotlines"]] == [plotline["id"]]
    assert listing["stories"] == [{"id": story["storyId"], "title": "Saga"}]

    detail = admin.get(url).json()
    assert detail["chapters"][0]["scenes"][0]["id"] == story["sceneId"]

    first, second = plotline["beats"][0]["id"], plotline["beats"][1]["id"]
    linked = admin.patch(f"{url}/beats/{first}", json={"sceneId": story["sceneId"]}).json()
    assert linked["beats"][0]["sceneId"] == story["sceneId"]
    assert linked["beats"][0]["title"] == "Opening Image"
    renamed = admin.patch(f"{url}/beats/{first}", json={"title": "Hook"}).json()
    assert renamed["beats"][0] == {
        "id": first,
        "title": "Hook",
        "sceneId": story["sceneId"],
        "sortOrder": 0,
    }
    unlinked = admin.patch(f"{url}/beats/{first}", json={"sceneId": None}).json()
    assert unlinked["beats"][0]["sceneId"] is None

    added = admin.post(f"{url}/beats", json={"title": "Coda"})
    assert added.status_code == 201 and added.json()["beats"][-1]["title"] == "Coda"
    assert admin.post(f"{url}/beats", json={"title": " "}).status_code == 400

    # Beats the order leaves out keep their place after the listed ones.
    ordered = admin.put(f"{url}/beats/order", json={"ids": [second, first]}).json()
    ids = [b["id"] for b in ordered["beats"]]
    assert ids[:2] == [second, first] and len(ids) == 16

    after = admin.delete(f"{url}/beats/{second}").json()
    assert second not in [b["id"] for b in after["beats"]]
    assert admin.delete(f"{url}/beats/{second}").status_code == 404
    assert admin.patch(f"{url}/beats/nope", json={"title": "X"}).status_code == 404
    assert admin.patch(f"{url}/beats/{first}", json={}).status_code == 400

    assert admin.patch(url, json={"title": "Main arc"}).json()["title"] == "Main arc"
    assert admin.delete(url).status_code == 200
    assert admin.get(url).status_code == 404
    assert admin.delete(url).status_code == 404


def test_plotline_needs_a_story_and_valid_ids(admin):
    project_id = create(admin)
    res = admin.post(plots_url(project_id), json={"title": "Arc", "storyId": "missing"})
    assert res.status_code == 400
    story = new_story(admin, project_id)
    assert (
        admin.post(plots_url(project_id), json={"title": "", "storyId": story["storyId"]})
    ).status_code == 400
    assert (
        admin.post(
            plots_url(project_id),
            json={"title": "A", "storyId": story["storyId"], "template": "bogus"},
        )
    ).status_code == 422
    freeform = admin.post(
        plots_url(project_id), json={"title": "A", "storyId": story["storyId"], "template": None}
    ).json()
    assert freeform["beats"] == [] and freeform["template"] is None
    assert admin.get(f"{plots_url(project_id)}/..%2Fx").status_code in (400, 404)


def test_old_plotline_beats_get_ids(admin, env):
    project_id = create(admin)
    directory = folder(env, project_id) / "plotlines"
    directory.mkdir()
    file = directory / "old.json"
    file.write_text(json.dumps({"id": "old", "title": "Old", "beats": [{"title": "A"}]}))
    detail = admin.get(f"{plots_url(project_id)}/old").json()
    beat_id = detail["plotline"]["beats"][0]["id"]
    assert beat_id and detail["chapters"] == []  # no story: no scenes to link
    assert json.loads(file.read_text())["beats"][0]["id"] == beat_id


def test_commenter_reads_plotlines_only(admin):
    project_id = create(admin)
    story = new_story(admin, project_id)
    plotline = admin.post(
        plots_url(project_id), json={"title": "Arc", "storyId": story["storyId"]}
    ).json()
    reader = commenter(admin, project_id)
    assert reader.get(plots_url(project_id)).json()["role"] == "commenter"
    url = f"{plots_url(project_id)}/{plotline['id']}"
    assert reader.get(url).status_code == 200
    assert reader.post(f"{url}/beats", json={"title": "X"}).status_code == 403
    assert reader.delete(url).status_code == 403


# --- Timeline -------------------------------------------------------------------------------


def test_timeline_events_and_calendar(admin, env):
    project_id = create(admin)
    hero = new_entity(admin, project_id, "characters", "Hero")
    url = f"/api/projects/{project_id}/timeline"

    page = admin.get(url).json()
    assert page["timeline"]["calendar"]["name"] == "Gregorian"
    assert page["timeline"]["events"] == []
    assert [e["name"] for e in page["entities"]] == ["Hero"]

    late = admin.post(f"{url}/events", json={"year": 300, "title": "Fall"})
    assert late.status_code == 201, late.text
    assert late.json()["era"] == "CE" and late.json()["significance"] == "minor"
    early = admin.post(
        f"{url}/events",
        json={
            "year": -5,
            "month": 3,
            "day": 1,
            "era": "BCE",
            "title": "Founding",
            "significance": "major",
            "entityIds": [hero["id"], hero["id"]],
        },
    ).json()
    assert early["entityIds"] == [hero["id"]]

    events = admin.get(url).json()["timeline"]["events"]
    assert [e["title"] for e in events] == ["Founding", "Fall"]  # sorted by date
    raw = json.loads((folder(env, project_id) / "timeline.json").read_text())
    assert raw["events"][0]["entityIds"] == [hero["id"]]  # old camelCase layout

    changed = admin.patch(f"{url}/events/{early['id']}", json={"month": None, "title": "Rise"})
    assert changed.json()["month"] is None and changed.json()["day"] == 1
    assert changed.json()["title"] == "Rise"
    assert admin.patch(f"{url}/events/{early['id']}", json={"title": " "}).status_code == 400
    assert admin.patch(f"{url}/events/{early['id']}", json={"year": None}).status_code == 400
    assert admin.patch(f"{url}/events/nope", json={"title": "X"}).status_code == 404

    assert admin.post(f"{url}/events", json={"title": "No year"}).status_code == 422
    assert admin.post(f"{url}/events", json={"year": 1, "title": " "}).status_code == 400
    bad = {"year": 1, "title": "X", "significance": "epic"}
    assert admin.post(f"{url}/events", json=bad).status_code == 422

    assert admin.delete(f"{url}/events/{early['id']}").status_code == 200
    assert admin.delete(f"{url}/events/{early['id']}").status_code == 404

    calendar = admin.put(
        f"{url}/calendar", json={"name": "Shire", "months": [" Afteryule ", "", "Solmath"]}
    ).json()
    assert calendar["name"] == "Shire" and calendar["months"] == ["Afteryule", "Solmath"]
    kept = admin.put(f"{url}/calendar", json={"name": ""}).json()
    assert kept["name"] == "Custom" and kept["months"] == ["Afteryule", "Solmath"]

    reader = commenter(admin, project_id)
    assert reader.get(url).status_code == 200
    assert reader.post(f"{url}/events", json={"year": 1, "title": "X"}).status_code == 403
    assert reader.put(f"{url}/calendar", json={"name": "X"}).status_code == 403


# --- Dashboard and writing goal -------------------------------------------------------------


def test_dashboard_stats_and_getting_started(admin, env):
    project_id = create(admin)
    url = f"/api/projects/{project_id}/dashboard"
    empty = admin.get(url).json()
    assert empty["stats"]["totalEntities"] == 0 and empty["stats"]["lastScene"] is None
    assert empty["gettingStarted"] == {
        "character": False,
        "scene": False,
        "relation": False,
        "mention": False,
    }
    assert empty["progress"]["dailyGoal"] == 500

    hero = new_entity(admin, project_id, "characters", "Hero")
    story = new_story(admin, project_id)
    scene_url = (
        f"{story_url(project_id, story['storyId'])}/chapters/{story['chapterId']}"
        f"/scenes/{story['sceneId']}"
    )
    res = admin.patch(
        scene_url,
        json={"body": f"Enter [Hero](mention://character/{hero['id']}) now.", "overwrite": True},
    )
    assert res.status_code == 200, res.text

    data = admin.get(url).json()
    stats = data["stats"]
    assert stats["entityCounts"]["character"] == 1 and stats["totalEntities"] == 1
    assert (stats["storyCount"], stats["chapterCount"], stats["sceneCount"]) == (1, 1, 1)
    assert stats["wordCount"] == 3
    assert stats["lastScene"]["sceneId"] == story["sceneId"]
    assert stats["lastScene"]["title"] == "Scene 1"
    assert {r["kind"] for r in stats["recent"]} == {"entity", "scene"}
    hrefs = [r["href"] for r in stats["recent"]]
    assert f"/projects/{project_id}/characters/{hero['id']}" in hrefs
    assert data["gettingStarted"] == {
        "character": True,
        "scene": True,
        "relation": False,
        "mention": True,
    }
    assert data["progress"]["todayWords"] == 3

    # A damaged relations file or writing log hides those numbers, not the page.
    (folder(env, project_id) / "relations.json").write_text("{nope")
    (folder(env, project_id) / "writing-log.json").write_text("{nope")
    damaged = admin.get(url)
    assert damaged.status_code == 200
    assert damaged.json()["gettingStarted"]["relation"] is False


def test_daily_goal(admin, env):
    project_id = create(admin)
    url = f"/api/projects/{project_id}/writing"
    assert admin.get(url).json()["dailyGoal"] == 500
    res = admin.put(f"{url}/goal", json={"goal": 750.4})
    assert res.status_code == 200 and res.json()["dailyGoal"] == 750
    assert writing.read_log(folder(env, project_id))["dailyGoal"] == 750
    assert admin.put(f"{url}/goal", json={"goal": -1}).status_code == 400
    assert admin.put(f"{url}/goal", json={"goal": 1e9}).status_code == 400

    writing.record_words(folder(env, project_id), project_id, 120, date.today())
    assert admin.get(url).json()["todayWords"] == 120

    reader = commenter(admin, project_id)
    assert reader.get(url).status_code == 200
    assert reader.put(f"{url}/goal", json={"goal": 10}).status_code == 403
