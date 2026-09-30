---
story_id: ST-113
title: "Add a Curated Illustration Library as the Picture Fallback"
phase: "11 — Visual Storytelling"
status: Ready
priority: should-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2", "E15-US2"]
depends_on: ["ST-110", "ST-112"]
---

# ST-113 — Curated Illustration Library Fallback

## Story

As a teacher, I want a scene whose picture could not be generated to still
show a relevant illustration in the video's style, so that a failed or
over-budget picture does not leave the scene with only an abstract motif.

## Background

The plan (docs/cinema-reel.md §3) orders picture sources as source figure →
project asset → generated → library → authored motif. ST-110 found that no
library exists, so the "library" step was skipped: a picture that is over
budget, rejected by moderation or failed on its final attempt becomes an
authored motif (`planCinemaIllustrations`, `createCinemaIllustrationJobHandler`).

This story adds the library as a platform catalogue, in the pattern of the
sound-bed catalogue (`sound_bed_tracks`, `pnpm --filter @avlp/api
sound-beds:register`, ADR-012). An operator prompts pictures into it from an
authored list of common concepts. Teachers' lessons never feed it.

## Outcome

- A platform-owned `illustration_library_entries` table holds approved
  pictures, each keyed by treatment (`flat`, `ink-sketch`, `editorial`),
  surface (light or dark), concept and its illustration key, with alt text,
  checksum, storage key, the prompt and provider used, and a status.
- An operator script generates entries from a checked-in concept list:
  `pnpm --filter @avlp/api illustration-library:generate --list <file>
  [--treatment ...] [--surface ...] [--max <n>] [--dry-run]`. It uses the
  existing image provider and moderation, prices the run before any paid call,
  stops at `--max`, and is idempotent per key. A picture is `active` only after
  moderation passes. `--dry-run` prints the plan and estimated cost only.
- `planCinemaIllustrations` gains the library step: a scene with no own
  picture, no project reuse and no remaining generation budget takes a
  matching library picture before falling back to a motif. The worker does the
  same when a generation is rejected by moderation or fails on its final
  attempt.
- A matched library picture is pinned as the scene's hero with a new origin
  `library`. It is recorded in the draft before preview approval, as ADR-015
  already permits, and copied into the project as a project asset so renders
  and version snapshots resolve it exactly like any other hero.

## Scope

- [ ] Migration: `illustration_library_entries`; project-asset origin
      `library` if the asset table needs it. Record the table in the ADR-015
      compatibility notes (this story is the first v2 change that migrates).
- [ ] Concept list: `apps/api/illustration-library/concepts.json`, authored,
      reviewed and checked in; no lesson or source text.
- [ ] Generation script with pricing, `--max`, `--dry-run`, moderation, retry
      and idempotency; logs spend per run.
- [ ] Matching in schemas (pure, deterministic): exact illustration key within
      the same treatment and surface first, then the entry with the highest
      content-word overlap above a fixed threshold; ties by key. No model call.
- [ ] Planner and worker fallback as described; `CinemaMotifReason` and the
      one-shot step detail record `library` use and match quality.
- [ ] Hero origin `library` accepted by the manifest schema and validator.
      Library pictures never bind to evidence scenes (same rule as generated).

## Acceptance Criteria

- [ ] AC1 With an empty library, every existing behaviour and test is
      unchanged.
- [ ] AC2 A scene over the picture budget whose concept has an active library
      entry in the video's treatment and surface shows that picture; otherwise
      it shows the authored motif, as today.
- [ ] AC3 A moderation rejection or final-attempt failure falls back to a
      matching library picture before the motif; the job still succeeds.
- [ ] AC4 A library picture never appears on an evidence (grounding-critical)
      scene, and never on a scene whose art direction excludes people when the
      entry depicts people.
- [ ] AC5 The generation script makes no paid call on `--dry-run`, never
      exceeds `--max`, and re-running it on the same list generates nothing new.
- [ ] AC6 Library entries are readable by every tenant's render, but no tenant
      data (lesson text, briefs, generated project pictures) is ever written
      into the library.
- [ ] AC7 A version that used a library picture re-renders identically after
      the library entry is retired, because the picture was copied into the
      project.

## Required Tests

- [ ] Matching unit tests: exact key, overlap threshold, treatment and surface
      isolation, determinism.
- [ ] Planner tests: budget exhausted with and without a match; evidence and
      no-people exclusions.
- [ ] Worker integration test (Postgres): moderation rejection → library
      picture, metered once.
- [ ] Script tests: dry run, max, idempotent re-run.
- [ ] Render test: a library hero renders through the normal asset path.

## Out of Scope

- Teachers saving their own pictures to a personal or shared library.
- Promoting pictures generated for lessons into the platform library (their
  briefs derive from tenant content).
- A library management UI; entries are managed by the script and status field.

## Decisions for the product owner

- **Initial size and budget.** Proposed: about 40 common concepts × 3
  treatments × 2 surfaces = 240 pictures, generated in batches with `--max`.
  Price the first batch with `--dry-run` before approving it.
- **Who may run the script.** Proposed: operators only, with the same provider
  key as production; never triggered from the product.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
