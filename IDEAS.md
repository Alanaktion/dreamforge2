# Ideas

These are things not yet implemented but worth eventually adding. When something is implemented, it should be removed from this document.

## Brainstorming & Quick Ideation

The app is strong at storing structured data but has few tools for _generating_ it. The goal: a blank entity page should never feel blank.

### Brainstorm deck follow-ups

**Files:** `src/lib/brainstorm.ts`, `src/lib/components/BrainstormDeck.svelte`

- User-editable decks per project (stored as `project/prompts/<type>.json`) so writers can add their own questionnaires; prompts could also target custom fields
- Selectable question sets: Proust questionnaire, Bernhardt-style character interview, "30 questions for your villain", location sensory checklist
- Weighted "contrast roll" across decks (one virtue + one flaw + one quirk), and lock individual chips before re-rolling
- More chip categories (speech patterns, fears, desires, habits) and suggestion chips for text prompts
- "Reset answered" to revisit a whole deck, and a list of past answers per prompt

### Random tables and name generation

- Generic random tables (name syllables, occupations, weather, rumors, tavern names, plot hooks) as JSON, user-extendable per project
- Name generator per culture/species: define syllable lists or example names on the culture entity, generate names from them (Markov chain over examples, no dependency needed)

### Quick capture

- Global "Quick idea" shortcut (in `CommandPalette.svelte` and `KeyboardShortcuts.svelte`) that creates a note with one line of text and no navigation
- Inbox view for unsorted quick notes with "convert to character / location / ..." (conversion already exists note → scene; generalize it in `backend/src/dreamforge_api/services/conversion.py`)
- Mention an unknown name with `@` in the editor → offer "create character named X" as a stub entity with `status: draft`

### Entity templates for all types

**Files:** `backend/src/dreamforge_api/services/starter.py`, `src/routes/projects/[id]/[type]/+page.ts`

- Templates currently only apply to notes (`templates: entityType === 'note' ? getNoteTemplates() : []`). Offer body templates for every type (character profile, location description already exist but aren't selectable for characters/locations)
- User-defined templates stored as Markdown files in `project/templates/<type>/`
- "Save this entity as a template" action
- Template could also prefill tags and custom-field values

### Contrast / foil helpers

- "Generate a foil" for a character: suggests opposite traits and creates a linked draft with a `rival`/`foil` relation
- "What's missing?" panel: highlights empty fields, entities with no relations, locations with no inhabitants, characters never used in a scene

## Incomplete Implementations of Current Features

### Scenes use free-text names instead of entity references

**Files:** `src/lib/types/index.ts` (`Scene`), `backend/src/dreamforge_api/services/backlinks.py`, `src/routes/projects/[id]/stories/[storyId]/+page.svelte`

- `narrator`, `place` are plain strings; backlinks match them by `entity.name`, so renaming an entity silently breaks the link
- `participants` accepts both IDs and names
- Switch to `EntityPicker` for narrator (character) and place (location), store IDs, and migrate existing name values on read

### Scene time is disconnected from the world calendar

- `Scene.time` is free text, while the timeline has a structured calendar (`backend/src/dreamforge_api/services/timelines.py`)
- Allow a scene to reference a timeline date or event; show scenes on the timeline and enable "story order vs. chronological order" views

### Timelines

**Files:** `backend/src/dreamforge_api/services/timelines.py`, `src/routes/projects/[id]/timelines/`

- Only one timeline per project; add multiple timelines/lanes (per region, per faction, per story)
- Per-entity filtering exists in data (`entityIds`) but entity pages don't show "Events involving this entity" — add to the entity page and to backlinks
- Calendar only models month names; add days-per-month, weekdays, leap rules, multiple eras with offsets, and moons/seasons
- Date ranges (wars, reigns, lifespans) instead of single points
- Character birth/death fields that drive age calculation at any event date ("How old is Ayla during the Siege?")
- Timeline data is a single JSON file; consider per-event Markdown files for consistency with the Markdown-first model and so events can have rich bodies

### Relations

**Files:** `src/lib/relationTypes.ts`, `backend/src/dreamforge_api/services/relations.py`, `src/lib/components/RelationGraph.svelte`

- Relation types are a fixed hardcoded list; allow per-project custom relation types (with color and dash style in the graph)
- No inverse pairs: `parent` ↔ `child`, `mentor` ↔ `student`, `leader_of` ↔ `led_by` should display correctly from both sides
- Relations can't carry a time span ("allies until year 412") or a strength/sentiment score
- Family tree view (generational layout) derived from `parent`/`child`/`sibling`/`lover` relations
- Graph filters: by relation type, by entity type, by tag, focus on N hops from a selected entity
- Relation-matrix view: characters × characters grid showing how each feels about the others

### Entity fields

**Files:** `src/lib/entityFields.ts`, `backend/src/dreamforge_api/services/custom_fields.py`

- Built-in character fields are thin (no age, appearance, goals, fears, flaws, voice/speech, arc). Add a richer default set, grouped into collapsible sections
- Custom fields lack a `select` / `multiselect` type with predefined options (e.g. alignment, social class) and a `rating` / slider type (e.g. "Bravery 1–10")
- `FieldDef` has an `image` type but custom fields don't expose it
- No field groups/sections or field reordering UI in settings (`sortOrder` exists in the schema)
- `organization.members` duplicates what `member_of` relations express; unify, or have one derive from the other
- `location.parentLocation` exists but there's no hierarchy view (world → continent → region → city → building) or breadcrumb on location pages

### Tags

- `Tag` type (with `color`) exists in `src/lib/types/index.ts` but there is no tags table or management UI
- Add project-level tag management: rename/merge tags across all entities, assign colors, tag cloud / browse-by-tag page

### Plot structure

**Files:** `backend/src/dreamforge_api/services/plots.py`

- Only three hardcoded templates; add Three-Act, Seven-Point, Kishōtenketsu, Freytag's Pyramid, Fichtean Curve, and user-defined templates
- Scene `plotThreads` track setup/payoff but nothing reports unresolved setups; add a "dangling threads" report per story
- Beats could carry a target percentage of the manuscript and show whether the linked scene lands near it
- Character arc tracker: per-character beats (want vs. need, lie they believe, turning points) linked to scenes

### Story export

**Files:** `src/routes/projects/[id]/stories/[storyId]/export/+server.ts`

- Export currently produces print-ready HTML only. Add native formats:
  - PDF via `puppeteer` (HTML → PDF, reusing the current HTML) or `pandoc` in the Docker image
  - EPUB (zip of XHTML + OPF, archiver is already a dependency)
  - DOCX in standard manuscript format for submissions
  - Plain Markdown (single file) for use in other tools
- Title page (author name, date), auto-generated table of contents, chapter title format/alignment

### Manuscript-aware consistency checks

- Detect entity names appearing in scene text without a mention link and offer to link them (auto-linker)
- Flag scenes where a character appears after their death date or at two places at the same timeline date
- Alias/nickname list per entity so mentions, search, and auto-linking catch "Liz" for "Elizabeth"

## Custom Entity Types

**Files:** `backend/src/dreamforge_api/services/custom_types.py`, `src/lib/components/DynamicEntityForm.svelte`

`EntityType` is a closed union, and `ENTITY_DIRS`, `ENTITY_PATTERNS` (watcher), `ENTITY_LABELS`, and `ENTITY_PLURAL` are all hardcoded. Useful types missing today: religion, magic system, language, event, faction, deity, vehicle, creature, technology.

### Schema definition

Stored as JSON in `templates/entity-schemas/`:

```json
{
  "type": "religion",
  "label": "Religion",
  "plural": "Religions",
  "fields": [
    { "key": "deities", "label": "Deities", "type": "entityRef", "entityType": "character" },
    { "key": "tenets", "label": "Core Tenets", "type": "textarea" },
    { "key": "followers", "label": "Followers Count", "type": "number" },
    { "key": "holyText", "label": "Holy Text", "type": "markdown" }
  ]
}
```

### Dynamic form rendering

- `DynamicEntityForm.svelte` reads the schema and renders appropriate inputs
- Registers the new type in the entity system
- Custom types appear alongside built-in types in the project dashboard, sidebar, and command palette
- Custom types are stored as `.md` files in a directory named after the type

## Specialized Worldbuilding Modules

### Maps

- Upload map images (world, region, city, dungeon) — can reuse the image library in `backend/src/dreamforge_api/services/images.py`
- Pin entities to map locations (x, y coordinates); clicking a pin opens the entity
- Link a map to a location entity so nested maps drill down (world → city map)
- Multiple layers (terrain, political, climate), region polygons, distance ruler with custom scale
- Zoom and pan viewer
- Stored as `project/maps/` — one folder per map with image + pins.json

### Languages / conlang helper

- Lexicon per language (word, meaning, part of speech, notes), stored as Markdown table or JSON
- Phonology settings (consonants, vowels, syllable structure) feed the name generator
- Inline glossary: hover a conlang word in the editor to see its meaning

### Magic / technology systems

- Structured rules sheet: source, cost, limitations, who can use it, known exceptions
- "Rule check" list attached to scenes that use the system

### Economy, politics, demographics

- Currency definitions with conversion rates
- Faction power / territory tracker over time (ties into timelines)
- Population and demographic breakdown per location, rolled up through the location hierarchy

### Family trees & lineages

- Dedicated tree view generated from relations (see Relations above)
- Houses/dynasties as organizations with generational layout

### To-Do / Open Questions

- Per-project or per-story task tracking
- Fields: title, linked entity, due date, priority, status
- "Open question" type specifically for unresolved lore ("Where did the dragons go?"), surfaced on the linked entity page
- Kanban-style board or list view
- Stored as `project/todo.json`

## Navigation & Viewing

- Wiki-style reading mode for the whole world: rendered entity pages with an infobox (image + key fields) and inline links, no edit chrome
- Hover cards on `@mentions` showing image, type, and a short summary
- Random entity / "rediscover" button on the dashboard to resurface forgotten lore
- Entity comparison view (two characters side by side)
- Corkboard view for scenes (index cards with summary, drag to reorder) alongside the current list
- Version history per entity/scene (git-backed or snapshot files), with diff and restore

## Import from Other Tools

**Files:** `backend/src/dreamforge_api/services/importers/`

Per-type CSV import already exists (`src/routes/projects/[id]/[type]/import-csv/`).

### Importers

| Tool           | Approach                                                          |
| -------------- | ----------------------------------------------------------------- |
| **Notion**     | Parse Markdown export (unzip → parse frontmatter)                 |
| **Obsidian**   | Read `.md` files directly; convert `[[wikilinks]]` to `@mentions` |
| **Scrivener**  | Parse `.scrivx` index file + `.rtf` content files                 |
| **WorldAnvil** | JSON export format (if available) or HTML scrape                  |
| **Campfire**   | JSON export format                                                |

### Import Pipeline

1. User uploads a file or points to a directory
2. Importer detects source format
3. Parses into intermediate format (normalized entity objects)
4. Shows preview with field mapping
5. On confirm, creates entities and writes Markdown files

### Project ZIP re-import

- The project export (`src/routes/projects/[id]/export/+server.ts`) produces a ZIP, but there is no way to import it back as a new project (backup/restore, moving between instances)

## Cross-Project Import / Duplicate

**Files:** `backend/src/dreamforge_api/services/import_project.py`, `src/routes/projects/[id]/import/`

### Import entities from another project

- Pick entities from another project (multi-select with preview)
- Choose target project
- Copy Markdown files + update relations
- Re-map entity IDs if collisions occur
- Retain all frontmatter, tags, images

### Shared worlds

- Series support: multiple story projects referencing one shared world project without copying

## Real-Time Collaboration

**Files:** `backend/src/dreamforge_api/services/collab.py`, `src/lib/components/CollabCursor.svelte`

Members and comments exist; editing is still last-write-wins.

### Architecture

- WebSocket server (same port via SvelteKit's WebSocket support, or separate `ws` server)
- CRDT via Y.js for conflict-free concurrent editing
- Each document (scene) is a Y.js document
- Awareness: cursors, selections, online status

### Features

- Multiple users editing the same scene simultaneously
- See other users' cursors in the editor (colored labels)
- Per-scene lock (optional, for non-conflict mode)
- Conflict warning at minimum: detect that the file changed on disk (watcher or another user) since the editor loaded it

### Auth

- Same session cookie or API key for WebSocket auth
- User presence: show who's viewing/editing each scene

## Share Projects / Stories Online

**Files:** `src/routes/share/`, `backend/src/dreamforge_api/services/sharing.py`

### Optional self-hosted sharing

- Toggle: "Share this project" in project settings
- Generates a read-only public URL: `/share/<project-id>`
- Optional: password-protected sharing
- Optional: share individual stories (not the whole project)
- Per-entity "secret" flag / spoiler sections hidden from public view (GM notes vs. player-facing lore)

### Public view

- Read-only rendered view (Markdown → HTML)
- No edit controls, no sidebar
- Custom CSS for public view (different from editor view)
- Optional: embedded mode (`<iframe>` friendly)

### Sharing settings

- Enable/disable per project
- Password (optional)
- Expiration date (optional)
- Allowed sections (stories only, lore only, everything)
