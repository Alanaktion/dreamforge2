"""Starter presets and the sample world for new projects, ported from src/lib/server/starter.ts.

Each runs right after ``projects.create_project``; the caller deletes the project if one
fails part way, so a half-seeded project is never left behind.
"""

from sqlmodel import Session

from ..models import Project
from . import plots, relations, stories, timelines
from .entities import create_entity
from .members import project_path

SAMPLE_WORLD_NAME = "Sample: The Salt Coast"
SAMPLE_WORLD_DESCRIPTION = (
    "A small example world to explore. Delete it from Settings when you are done."
)

# The note templates the presets use (the full list is in src/lib/noteTemplates.ts).
NOTE_TEMPLATES = {
    "location-description": """## Overview

General description of the location, its purpose, and significance.

## Geography & Climate

Terrain, weather patterns, and natural features.

## Atmosphere

What does it feel like to be here? Sounds, smells, sights, and mood.

## Notable Features

Distinctive landmarks, architecture, or points of interest.

## Inhabitants

Who lives here or frequents this place?

## History

Key historical events associated with this location.

## Notes

Any additional details.
""",
    "chapter-plan": """## Chapter Overview

**Working Title:**
**POV Character:**
**Timeframe:**
**Locations:**

## Scenes

### Scene 1
- **Setting:**
- **Characters:**
- **Purpose:**
- **Summary:**

### Scene 2
- **Setting:**
- **Characters:**
- **Purpose:**
- **Summary:**

### Scene 3
- **Setting:**
- **Characters:**
- **Purpose:**
- **Summary:**

## Chapter Notes

Themes, symbolism, or notes on continuity.

## Questions to Resolve

- What needs to happen before the next chapter?
- What loose ends should be addressed?
""",
    "worldbuilding-note": """## Concept

What is this worldbuilding element?

## Rules / Mechanics

How does it work? What are the limitations or constraints?

## Impact on World

How does this element affect society, culture, or history?

## Inspiration

References, real-world parallels, or media that inspired this idea.

## Questions

Open questions or aspects to develop further.

## Notes

Any additional thoughts.
""",
}


def _note(db: Session, project: Project, name: str, template: str) -> None:
    create_entity(db, project, "note", name, body=NOTE_TEMPLATES[template])


def _story(project: Project, title: str, chapter: str, description: str | None = None):
    """A story with one chapter and one scene. Returns (story, chapter)."""
    base = project_path(project)
    story = stories.create_story(base, project.id, title, description)
    first = stories.create_chapter(base, project.id, story["id"], chapter)
    return story, first


def apply_preset(db: Session, project: Project, preset: str) -> None:
    base = project_path(project)
    if preset == "novel":
        story, chapter = _story(project, "Untitled novel", "Chapter 1")
        stories.create_scene(base, project.id, story["id"], chapter["id"])
        plots.create_plotline(base, project.id, "Main plot", story["id"], "save_the_cat")
        _note(db, project, "Story bible", "worldbuilding-note")
    elif preset == "series":
        story, chapter = _story(project, "Book 1", "Chapter 1")
        stories.create_scene(base, project.id, story["id"], chapter["id"])
        plots.create_plotline(base, project.id, "Series arc", story["id"], "heros_journey")
        _note(db, project, "Series bible", "worldbuilding-note")
        _note(db, project, "Book 1 chapter plan", "chapter-plan")
    elif preset == "campaign":
        create_entity(
            db,
            project,
            "note",
            "Campaign overview",
            body="## Premise\n\n## Factions\n\n## Open threads\n\n## House rules\n",
        )
        story, chapter = _story(project, "Session log", "Session 1", "One chapter per session.")
        stories.create_scene(base, project.id, story["id"], chapter["id"], "Recap")
        _note(db, project, "Starting town", "location-description")


def _mention(entity_type: str, entity_id: str, label: str) -> str:
    return f"[@{label}](mention://{entity_type}/{entity_id})"


def create_sample_world(db: Session, project: Project) -> None:
    base = project_path(project)

    def entity(entity_type: str, name: str, body: str, **fields) -> str:
        return create_entity(db, project, entity_type, name, fields, body)["id"]

    maren = entity(
        "character",
        "Maren Holt",
        "Keeper of the Drowned Light. Patient, stubborn, and better with tides than people.",
        age="34",
        tags=["protagonist"],
        motivations="Keep the lamp lit and learn why the ships stopped coming home.",
    )
    tobiah = entity(
        "character",
        "Tobiah Venn",
        "A charming smuggler who owes Maren a favour he would rather forget.",
        tags=["smuggler"],
        secrets="He knows where the missing cargo went.",
    )
    ilse = entity(
        "character",
        "Ilse Varga",
        "Harbourmaster of Greyhaven. Keeps the peace by keeping secrets.",
        tags=["antagonist"],
    )
    greyhaven = entity(
        "location", "Greyhaven", "A fog-bound port town built on salt trade and old debts."
    )
    light = entity(
        "location",
        "The Drowned Light",
        "A lighthouse on a tidal island. At high water the stairs vanish into the sea.",
    )
    wardens = entity(
        "organization",
        "The Tidewardens",
        "An old order of lamp keepers that most people think disbanded.",
    )
    entity(
        "note",
        "How to use this sample",
        "This project shows how the pieces fit together. Open a character, read a scene, look "
        "at the Relations graph and the Timeline. Delete the project from its Settings page "
        "when you are done.",
    )

    for source, target, kind, label in (
        (maren, tobiah, "ally", "reluctant allies"),
        (maren, ilse, "enemy", None),
        (maren, wardens, "member_of", None),
        (light, greyhaven, "related_to", "guards the harbour of"),
    ):
        relations.add_relation(project.id, base, source, target, kind, label)

    story = stories.create_story(
        base, project.id, "The Long Tide", "Ships are vanishing off the Salt Coast."
    )
    one = stories.create_chapter(base, project.id, story["id"], "The Lamp")
    two = stories.create_chapter(base, project.id, story["id"], "The Harbour")
    first = stories.create_scene(
        base,
        project.id,
        story["id"],
        one["id"],
        "Low water",
        {"narrator": "Maren Holt", "place": "The Drowned Light", "participants": [maren]},
        f"{_mention('character', maren, 'Maren Holt')} counted the ships twice. Four had "
        f"sailed from {_mention('location', greyhaven, 'Greyhaven')} at dawn, and only three "
        "lights answered hers across the water.\n\nShe trimmed the wick and waited for the "
        "tide to turn.",
    )
    second = stories.create_scene(
        base,
        project.id,
        story["id"],
        two["id"],
        "Debts",
        {"narrator": "Maren Holt", "place": "Greyhaven", "participants": [maren, tobiah, ilse]},
        f"{_mention('character', tobiah, 'Tobiah Venn')} was waiting on the quay, which was "
        'never a good sign.\n\n"You owe me," Maren said.\n\n"I owe everyone," he said. '
        '"Get in line."',
    )

    plot = plots.create_plotline(base, project.id, "Main plot", story["id"], "save_the_cat")
    for index, scene in ((0, first), (3, second)):
        if len(plot["beats"]) > index:
            plots.update_beat(
                base, project.id, plot["id"], plot["beats"][index]["id"], {"sceneId": scene["id"]}
            )

    for fields in (
        {
            "year": 812,
            "month": None,
            "day": None,
            "era": "",
            "title": "The Tidewardens are disbanded",
            "description": "The order loses its charter after the Long Storm.",
            "significance": "major",
            "entityIds": [wardens],
        },
        {
            "year": 840,
            "month": 3,
            "day": 2,
            "era": "",
            "title": "The first ship vanishes",
            "description": "A salt barge leaves Greyhaven and never arrives.",
            "significance": "major",
            "entityIds": [greyhaven, ilse],
        },
    ):
        timelines.add_event(base, project.id, fields)
