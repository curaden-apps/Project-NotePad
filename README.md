# Revolver — MVP Product & Technical Spec

Revolver is a zero-setup notes + tasks app that turns messy capture into an organized knowledge map using on-demand AI tagging and a visual graph.

## Target users

- Professionals who need fast capture without setup friction.
- Students/researchers who build up "note debt" and want hidden connections surfaced.
- Former Obsidian/Evernote users who want power without maintenance overhead.

## MVP core loop

1. User creates a note quickly (block editor + radial selector).
2. User taps **Analyze**.
3. AI returns suggested tags and related notes.
4. User accepts/rejects suggestions.
5. Note becomes connected and discoverable in Graph.
6. User manages tasks with nested todos and headshot completion.

## Product key: Revolver wheel + brand fit

- The Revolver wheel is the core interaction for fast block insertion and format changes.
- Wheel format (MVP): 8 outer actions + 1 central action.
- Style target: dark-first surfaces, warm accent highlights, radial/glow motif, restrained typography.

See full implementation guidance in `docs/MVP_IMPLEMENTATION_PLAN.md`.

## MVP feature scope

### 1) Editor & capture

- Block editor supports paragraph, heading, quote, code, bullet list, numbered list, todo, nested todo.
- Revolver radial selector for block type changes and quick insert.
- Basic note metadata: title, created date, edited date.

### 2) Organization

- Manual tags (add/remove)
- Manual links between notes

### 3) AI (on-demand only)

Analyze action returns:
- 2–5 suggested tags
- up to 5 ranked related notes
- exact/context matching reasons

### 4) Graph

- Nodes = notes + tags
- Edges = manual links + tag relationships + AI-related edges
- Filter by tag
- Click node to open note

### 5) Tasks

- Todo blocks + nested todos
- "Headshot complete" on parent todo completes all children
- Undo completion within a short time window

### 6) Search

- Full-text search across all notes
- Exact and context-aware matching passes

### 7) Cross-platform (MVP decision)

- Web app
- First packaged target: **Desktop via Electron**
- Account login + basic sync across devices

### 8) Export (MVP decision)

- Export single note as Markdown
- Export all notes as a **Markdown ZIP**

## Explicit non-goals

- Collaboration/sharing
- Advanced task management (due dates, reminders, calendar)
- Proactive AI "outsourced thinking"
- Complex template systems
- Large attachment management

## Acceptance criteria

- New user can create note, add todos, run Analyze, and see graph connections within 2 minutes.
- Analyze runs asynchronously and returns within 30 seconds for typical note sizes.
- Graph remains interactive for at least 1,000 notes (progressive rendering acceptable).
- Sync resolves simple conflicts without data loss, with behavior documented.

## Local backend (implemented)

A minimal local-storage backend is included for MVP prototyping.

### Run

```bash
npm start
```

Server defaults to `http://localhost:4000`.

### AI provider choice

- Default: `AI_PROVIDER=claude`
- Optional: `AI_PROVIDER=gemini`

### API endpoints

- `GET /health`
- `GET /store`
- `GET /brand`
- `GET /notes`
- `POST /notes`
- `GET /notes/:id`
- `PUT /notes/:id`
- `PATCH /notes/:id`
- `DELETE /notes/:id`
- `POST /analyze/:noteId`
- `GET /graph`
- `GET /search?q=<text>`
- `GET /links`
- `POST /links`

### Storage

- Data is persisted locally in `backend/data/store.json`.
- Notes include title, blocks, tags, metadata, createdAt, and updatedAt.
- Analyze outputs include suggested tags and related note candidates.
- Graph data is generated from notes, tags, manual links, and analysis edges.
