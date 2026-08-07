# AI Visual Learning Platform — MVP Story Pack

This pack converts the product plan, feature list, PRD, and epic technical implementation guide into **71 ordered, implementation-ready Markdown story files**.

## Start here

1. Read [`AGENTS.md`](AGENTS.md).
2. Read [`DEVELOPMENT_WORKFLOW.md`](DEVELOPMENT_WORKFLOW.md).
3. Use [`STORY_INDEX.md`](STORY_INDEX.md) to pick the next story.
4. Use [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md) to verify PRD coverage.
5. Use [`MVP_DEFINITION_OF_DONE.md`](MVP_DEFINITION_OF_DONE.md) as the final release gate.

## Architecture decision

The story pack assumes the accepted TypeScript-first stack in [`ADR-001`](docs/adr/ADR-001-typescript-first-mvp-stack.md):

- Next.js teacher application
- NestJS/Fastify application API
- TypeScript pipeline worker
- TypeScript Remotion renderer
- Python Docling ingestion worker
- PostgreSQL + Drizzle
- Redis + BullMQ
- Zod contracts
- S3-compatible private object storage
- pnpm + Turborepo

## How stories are structured

Each story includes:

- Product statement and observable outcome
- PRD and epic traceability
- Dependencies
- Bounded scope
- Technical implementation requirements
- Contracts and persistence
- API/worker/UI interfaces
- Acceptance criteria
- Required tests
- Explicit out-of-scope work
- Definition of Done
- A Dev Agent Record to fill during implementation

The files point to the technical guide but also copy the story-specific implementation constraints needed for an agent to work without rediscovering the architecture.

## Delivery phases

| Phase                            |       Stories | Purpose                                                                                  |
| -------------------------------- | ------------: | ---------------------------------------------------------------------------------------- |
| 00 — Foundation                  | ST-001–ST-009 | Repository, contracts, persistence, jobs, observability, fixtures                        |
| 01 — Visual Runtime Proof        | ST-010–ST-024 | Theme, all ten templates, preview, manual LessonSpec, first MP4                          |
| 02 — Accounts, Projects, Upload  | ST-025–ST-032 | Authentication, isolation, workspace, upload and file safety                             |
| 03 — Ingestion and Configuration | ST-033–ST-041 | Docling, normalization, review overlays, lesson settings                                 |
| 04 — AI Planning and Grounding   | ST-042–ST-053 | Source snapshots, model lifecycle, objectives, outline, narration, storyboard, citations |
| 05 — Editor, Assets, Versions    | ST-054–ST-061 | Storyboard control, asset workflows, immutable versions and restore                      |
| 06 — Audio, Validation, Delivery | ST-062–ST-070 | Voices, TTS, captions, preview, validation, rendering, exports, sharing                  |
| 07 — MVP Release                 |        ST-071 | End-to-end, security, cost, recovery, and final acceptance                               |

## Recommended first agent instruction

```text
Read AGENTS.md, DEVELOPMENT_WORKFLOW.md, STORY_INDEX.md, the current ADRs,
and ST-001. Do not implement any later story.

Inspect the repository, propose a bounded plan for ST-001, then implement
only that story. Run every required check and complete the Dev Agent Record.
```

## Authoritative reference files

The original source documents are included under `docs/reference/` so the pack can travel with the repository.
