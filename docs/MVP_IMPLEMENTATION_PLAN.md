# Revolver MVP Implementation Plan (Speed + Scale First)

## Skill usage note
No listed skill was applied for this change because the request is product/backend implementation work, not skill creation/installation.

## Product key: Revolver wheel
The Revolver wheel is the hero interaction pattern for quick block editing:
- Outer ring: 8 block actions (paragraph, heading, quote, code, bullet, numbered, todo, nested-todo).
- Center action: quick confirm/apply.
- UX target: one-hand, low-latency insertion under 150ms response for local actions.

## Brand style guideline (MVP interpretation)
Based on the shared brand artifact, MVP should use:
- Dark primary canvas + warm accent for primary CTA and active states.
- Neutral grayscale for background layering and card hierarchy.
- Serif-forward brand headline pairing with clean sans-serif body text.
- Radial UI motif and subtle glow for Revolver interactions.

## AI provider decision
**Default recommendation: Claude** for note relation and context tagging due to strong long-context quality and consistent text reasoning.

Fallback support remains simple:
- `AI_PROVIDER=claude` (default)
- `AI_PROVIDER=gemini`

For MVP and token efficiency:
- Run AI on-demand only (Analyze button).
- Pre-trim note payload to title + relevant blocks.
- Cap results to 2–5 tags and max 5 related notes.

## Context-driven relation behavior
Analyze should:
1. Extract note context terms from title + block text + tags.
2. Run exact-match pass first (title/tag exactness).
3. Run context-overlap pass second (token overlap with other notes).
4. Return ranked related notes with brief reasons.
5. Save analysis output for graph edge rendering.

## Knowledge graph behavior
- Nodes: notes + tags.
- Edges:
  - manual links
  - tag relationships
  - AI-related edges (scored)
- Support progressive rendering for large sets (target 1,000+ nodes).

## Suggested scalable tech stack (MVP)
- Client: Angular (already aligned with previous direction).
- API: NestJS (production), current local prototype uses Node HTTP for speed.
- DB: Postgres + pgvector.
- Queue: BullMQ/Redis for Analyze jobs.
- Search: Postgres FTS first, vector retrieval optional once embeddings are in place.

## Component rollout timing
1. **Now (MVP core)**
   - Block editor + Revolver wheel actions
   - Notes CRUD
   - Manual tags + links
   - On-demand Analyze
2. **Next**
   - Graph view with filters and click-through
   - AI label acceptance/rejection UX
3. **Then**
   - Async Analyze queue + quotas
   - Electron packaging and sync hardening
