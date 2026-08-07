# ADR-001: TypeScript-First MVP Stack

## Status

Accepted

## Context

The product requires a Next.js teacher interface, a Remotion browser/player and renderer, an AI orchestration layer, background jobs, PostgreSQL, private object storage, and a Python Docling ingestion worker. The development approach will rely heavily on AI coding agents, so reducing duplicate contracts and cross-language boundaries is important.

## Decision

Use:

- **TypeScript** for the web application, application API, AI/pipeline worker, shared schemas, scene library, and Remotion renderer.
- **Python** only for the isolated Docling ingestion worker.
- **Next.js** for the teacher web application.
- **NestJS with the Fastify adapter** for the application API.
- **Zod** as the runtime source of truth for TypeScript boundary schemas.
- **PostgreSQL with Drizzle ORM** for authoritative workflow and domain state.
- **Redis with BullMQ** for asynchronous MVP job orchestration.
- **S3-compatible private object storage** for documents and media.
- **Remotion and FFmpeg** for preview composition and final media rendering.
- **pnpm and Turborepo** for the monorepo.

## Consequences

- The API, editor, AI worker, and renderer can share LessonSpec and other TypeScript contracts.
- Python remains behind a versioned job/result contract and cannot leak Docling types into the domain.
- Full rendering, parsing, model calls, TTS, and image generation never execute inside normal HTTP request handlers.
- A future move to a language-neutral broker or a C# service requires a new ADR and contract migration plan.
- Exact dependency versions are chosen during ST-001 and recorded in the lockfile; do not silently replace major frameworks later.
