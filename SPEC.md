# DreamForge — Feature Spec & Architecture

> Open-source, self-hosted web app for worldbuilding and fiction writing.
> Inspired by [Lore Forge](https://loreforge.com/) but stripped of bloat, pricing tiers, and proprietary lock-in.
> This doc covers the feature surface, data model, and implementation notes.

---

## 1. Product Vision

A self-hosted, open-source web application for **fiction writers** and **worldbuilders**. No pricing tiers, no proprietary lock-in.

- **Free & open source** — everything is available to everyone.
- **Self-hosted** — run it yourself; your data stays yours.
- **Markdown-first** — all content is Markdown under the hood, exported as Markdown. No DOCX.
- **Extensible** — plugins, custom entity types, API access.

---

## 2. Core Concepts

### 2.1 Project

A project is the top-level container — one world / book universe.

- Stores data as a folder of Markdown files + JSON metadata on disk.
- Pinnable to the top of the project list.
- Has a unique ID for cross-project reference.
- No online/offline toggle — it's all local by design.

### 2.2 Story

Inside a project, stories are the narrative layer.

- Stories → Chapters → Scenes (three-level hierarchy).
- Multiple stories per project (for series).
- Each scene can track: narrator, participants, time, place.
- Drag-and-drop reordering of chapters and scenes.
- Convert notes ↔ scenes in one click.

### 2.3 Lore Entities (Modules)

Projects contain multiple entity types, each with its own module/page:

| Module            | Description                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| **Characters**    | Custom stats, motivations, traits, backstory, personality types, attached images.               |
| **Organizations** | Governments, corporations, religions, guilds. Members, leaders, ownership tracking.             |
| **Locations**     | Geology, ecosystem, land ownership, hierarchical placement (contained within another location). |
| **Cultures**      | Languages, rituals/ceremonies, value systems, mythos, custom stats/descriptions.                |
| **Species**       | Fantasy races, alien species, flora/fauna — anything that influences the world.                 |
| **Items**         | Valuable/persistent objects (artifacts, weapons, McGuffins). References to owners/characters.   |
| **Notes**         | Per-story or project-wide notes. Easy referencing and editing via sidebar.                      |
| **Relations**     | Graph-based relationship mapping (who hates who, org↔org links, etc.).                          |
| **Images**        | Attached media per entity. Concept art, character portraits, reference photos.                  |
| **Templates**     | Pre-built entity schemas and story structures (stored as Markdown).                             |

### 2.4 Plot Module

- Outline stories using proven structures: Hero's Journey, Save the Cat, Snowflake Method, etc.
- Create multiple plotlines per story.
- Track which chapters/scenes use which plot beats.
- Modify or create custom templates (stored as Markdown).
- Freeform mode available.

### 2.5 Summaries Module

- Bird's-eye view of chapters and scenes.
- Plot threads per scene (setup + payoff tracking).
- Develop story through chapter/scene summaries.
- Create, delete, and rearrange via drag-and-drop.

---

## 3. Editor Features

- **Markdown editor** with live preview (split-pane or toggle).
- **Customizable toolbar** — let users pick what they need.
- **Zen mode** — distraction-free writing (no sidebar, no chrome).
- **Custom background images** for scenes and notes.
- **Note templates** — pre-built note structures stored as Markdown.
- **Spellcheck** toggle; custom language selection.
- **Copy chapter as Markdown or HTML** to clipboard (for episodic web publishing).

---

## 4. Cross-Entity Features

### 4.1 Omnipresent Sidebar

- Bookmark any entity for fast reference while working on anything else.
- Available across all modules.
- Bookmarks are stored as a simple list of entity IDs, exportable alongside projects.

### 4.2 Tagging & Search

- All entities are **taggable** and **searchable**.
- Status dots indicate completion/work-in-progress state.

### 4.3 Cross-Entity References

- Characters linked to scenes (narrator + participants).
- Items linked to characters/organizations that possess them.
- Locations hierarchically nested within other locations.
- Story mentions via `@Mentions` with hover pop-up detail cards.

### 4.4 Import & Duplicate

- Import entities from other projects into the current project.
- Duplicate any entity within a project.

---

## 5. Data Storage & Format

### 5.1 Local File System

- **Markdown files** stored in a user-selected data folder.
- Each entity = one `.md` file with frontmatter (YAML) for metadata.
- Relational data (links between entities) stored in a `relations.json` or similar index.
- Users can edit the files directly — the app is just a nicer interface.

### 5.2 Backups

- **Automatic backups**: zip files of the entire project folder.
  - On-exit backup toggle.
  - Scheduled interval backups (configurable, e.g., every 2 hours).
  - Retention count (oldest deleted first).
  - Backup folder location configurable (recommended: different drive or cloud sync folder).
- Since data is just Markdown files, `rsync` / `git` / `borg` / restic all work natively for backup.

### 5.3 Export

| Scope        | Format                    | Details                                                                                                      |
| ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Project**  | ZIP of `.md` files        | Each entity → separate Markdown file with frontmatter. Selective export via checkboxes.                      |
| **Story**    | Single `.md` or PDF       | Author name, chapter title format/alignment/subtitle, scene delimiter, title page toggle, table of contents. |
| **Chapter**  | `.md` or clipboard (HTML) | Per-chapter export dialog.                                                                                   |
| **Plotline** | `.md`                     | Direct export.                                                                                               |

All exports are plain Markdown — no proprietary format lock-in.

---

## 6. UI / UX

- **Light and dark themes**.
- **Monochrome mode** toggle (greyscale).
- **Configurable corner radius** for UI elements.
- **Minimal, distraction-free interface** — editor stays out of the way.
- **Drag-and-drop** reordering throughout (chapters, scenes, entities).
- **Responsive** design for mobile/tablet access.

---

## 7. Architecture & Tech Stack

### Recommended Stack

| Layer                 | Technology                                   | Rationale                                                                         |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| **Framework**         | Next.js or SvelteKit                         | SSR for SEO-friendly landing pages, API routes for backend.                       |
| **Database**          | SQLite (via SQLModel, FastAPI backend)       | Zero-config, file-based, perfect for self-hosted. No external DB needed.          |
| **Storage**           | Local filesystem (Markdown + JSON)           | Data lives in a folder; users can `git` it, `rsync` it, whatever.                 |
| **Auth**              | Session cookies (basic) or OAuth2 (optional) | Simple password auth for single-user installs; optional SSO for team/self-hosted. |
| **Editor**            | Tiptap (ProseMirror-based)                   | Extensible Markdown editor with custom blocks, tables, mentions.                  |
| **Graph / Relations** | D3.js or vis.js                              | Force-directed graph rendering for relationship mapping.                          |
| **Export**            | markdown-it + jsPDF                          | Markdown export; optional PDF generation via jsPDF or pandoc.                     |
| **Deployment**        | Docker image + systemd                       | One-command deploy. Docker Compose for convenience.                               |

### Data Model Sketch

```
Project/
├── project.json              # metadata, settings, bookmarks
├── characters/
│   └── <id>.md               # frontmatter + body (Markdown)
├── organizations/
│   └── <id>.md
├── locations/
│   └── <id>.md
├── cultures/
│   └── <id>.md
├── species/
│   └── <id>.md
├── items/
│   └── <id>.md
├── notes/
│   ├── _story/               # per-story notes
│   │   └── <id>.md
│   └── _project/             # project-wide notes
│       └── <id>.md
├── stories/
│   └── <story-id>/
│       ├── story.json        # metadata, plotlines
│       ├── chapters/
│       │   └── <ch-id>/
│       │       ├── chapter.md
│       │       └── scenes/
│       │           └── <sc-id>.md
│       └── plotlines/
│           └── <pl-id>.md
├── images/                   # attached media
├── relations.json            # cross-entity link index
└── templates/                # reusable schemas (Markdown + JSON)
```

### Markdown File Format Example

Characters (`characters/wizard.md`):

```yaml
---
id: wizard
name: Elara Voss
type: character
tags: [mage, antagonist]
created: 2026-01-15
modified: 2026-06-10
stats:
  power: 9
  wisdom: 8
  charm: 3
relationships:
  - target: king_alaric
    type: enemy
  - target: forest_of_whispers
    type: home
---
Elara Voss is a powerful mage who serves as the primary antagonist...

> **Motivation:** Restore her family's honor by reclaiming the throne.
> **Traits:** Proud, ruthless, secretly lonely.
```

Scene (`stories/book1/chapters/3/scenes/first_encounter.md`):

```yaml
---
id: first_encounter
chapter: ch3
time: 'Nightfall'
place: forest_of_whispers
narrator: elara
participants: [elara, king_alaric]
plotThreads:
  - setup: elara's_exile
    payoff: null
---
The trees parted before her like a curtain...
```

### Deployment

- **Docker image** — `docker run` with volume mount for data folder.
- **Single binary** alternative (Go/Rust) for minimal installs.
- No external services required — everything runs locally.
- Optional: email-based invite system for multi-user self-hosted setups.

---

## 8. Roadmap / Phases

### Phase 1 — MVP

- Project CRUD + data folder management
- All lore entity modules (Characters, Organizations, Locations, Cultures, Species, Items, Notes)
- Relations graph viewer
- Stories → Chapters → Scenes with drag-and-drop
- Markdown editor with live preview per scene
- Tagging + search
- Image attachment per entity
- Bookmark sidebar
- Export to Markdown ZIP (project, story, chapter)
- Local backups (on-exit + scheduled)

### Phase 2 — Polish

- Plot module with templates
- Summaries module
- Note → Scene conversion
- Markdown editor: tables, highlighting, text colors
- @Mentions hover cards
- Zen mode
- Custom backgrounds, note templates, custom menus
- Spellcheck + language selection
- PDF export (via pandoc or jsPDF)

### Phase 3 — Extensibility

- Plugin system (custom entity types, export formats)
- API (REST or GraphQL) for programmatic access
- CLI tool for power users (`dreamforge export`, `dreamforge import`, etc.)
- Custom entity type definitions (user-defined schemas)
- Import from other tools (Notion, Obsidian, Scrivener)

### Phase 4 — Advanced

- New modules: Structures, Pantheons, Timelines, Maps, To-do, Project Tracking
- Import/duplicate entities across projects
- Trash bin / undo deletions
- Image export in project exports
- Real-time collaboration (WebSocket + CRDT)
- Global search & replace
- Share projects/stories online (optional, self-hosted sharing)

---

## 9. Key Design Decisions

| Decision       | Choice                                      | Why                                                                               |
| -------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| Storage format | Markdown + YAML frontmatter                 | Human-readable, git-friendly, no vendor lock-in                                   |
| Database       | SQLite                                      | Zero-config, file-based, perfect for self-hosted; Markdown is the source of truth |
| Auth model     | Single-user by default, optional multi-user | Most users run this alone; keep it simple                                         |
| Export         | Markdown first, PDF second                  | No DOCX — Markdown is the open standard                                           |
| Sync           | None (local-only)                           | Self-hosted means you control your own sync (git, syncthing, etc.)                |
| Plugin system  | Yes                                         | Let the community extend without bloating the core                                |

---

_Generated from loreforge.com on 2026-06-19. Pivoted to open-source, Markdown-first, self-hosted._
