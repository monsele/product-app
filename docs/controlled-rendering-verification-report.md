# Controlled Rendering Verification Report

Story: ST-098  
Contract revision: 1  
Identity policy: `canonical-json-v1`  
Supported worker release: `st-097-remotion-4.0.507-creative-design-v1`

## Reproduction profile and comparison criteria

The supported proof profile is 1920x1080, 30fps, H.264/AAC, `yuv420p`.
The stored approved MP4 checksum is the exact historical-artifact identity.
Repeat renders are evaluated separately: semantic state, scene/caption/audio
identity and frame boundaries are exact; browser/server frame comparisons use
the predefined mean absolute channel-difference tolerance of 3.5. Different
encoders or browser builds are not promised byte or pixel identical output.

Run the regression harness from the repository root:

```powershell
pnpm --filter @avlp/jobs test -- contracts.test.ts
pnpm --filter @avlp/renderer test -- contracts.test.ts render-worker.test.ts
pnpm --filter @avlp/scene-library exec vitest run src/style-proof/style-proof-contract.test.ts src/style-proof/style-proof-motion.test.ts src/style-proof/style-proof-render.test.ts src/style-proof/style-proof-media.test.ts src/demonstration-proof/demonstration-contract.test.ts src/demonstration-proof/demonstration-state.test.ts src/demonstration-proof/demonstration-timing.test.ts src/demonstration-proof/demonstration-media.test.ts
```

The media suites create temporary MP4/PNG evidence only; generated binaries
are intentionally not committed. They bundle the pinned local source, load
fonts before capture, render selected boundary/hold frames and short H.264/AAC
clips, and use FFprobe postflight.

## CR traceability

| Requirement | Implemented path | Automated evidence |
| --- | --- | --- |
| CR-01 Bounded choices | `packages/schemas/src/creative-design.ts`, `apps/api/src/creative-design.ts` | Creative-design schema/API tests reject unknown selections; render payloads contain resolved snapshots only. |
| CR-02 Immutable manifest | `apps/api/src/renders.ts`, `apps/api/src/lesson-versions.ts`, `apps/renderer/src/contracts.ts` | Renderer contract tests reject manifest/profile/snapshot mutation. |
| CR-03 Release retention | `apps/renderer/src/render-worker.ts`, `apps/api/src/renders.ts` | Historical-release test returns `RENDER_IMPLEMENTATION_UNAVAILABLE` without rendering; existing authorised output is not modified. |
| CR-04 Frame determinism | Style/demonstration composition and manifest modules | `style-proof-render.test.ts`, `demonstration-state.test.ts`, `demonstration-media.test.ts` test direct, backward and out-of-order state plus browser/server frames. |
| CR-05 Motion energy | Creative-design manifest and style-proof motion validation | `style-proof-motion.test.ts` preserves narration, captions, event timing and readable holds across supported energy settings; demonstration state/timing tests cover savings and evaporation. |
| CR-06 Identity, cache, jobs | `packages/jobs/src/idempotency.ts`, `apps/api/src/renders.ts`, renderer worker | Canonical object ordering and non-finite rejection; render identity includes manifest, profile/release, and tenant-scoped idempotency; worker duplicate-delivery and stale lifecycle tests. |
| CR-07 Pre/postflight | API validation, renderer manifest/media verification | Style/demonstration media suites reject preflight failures and FFprobe profile/audio failures; renderer worker verifies checksums before publishing. |
| CR-08 Evidence limits | Proof render/media suites and this report | Fixed frame/tolerance criteria, stored checksum versus repeat-render distinction, and bounded environment guarantee are recorded above. |

## Historical and recovery behaviour

An immutable lesson version copies its resolved creative-design snapshot,
including pack/treatment/font choices and hash; legacy snapshots remain absent
of that field and use the explicit `mvp-default` reader. Rendering does not
look up a mutable preset or invoke AI/TTS/image providers. A worker that cannot
execute the payload's exact renderer release returns the terminal
`RENDER_IMPLEMENTATION_UNAVAILABLE` category; it does not substitute a newer
release. Existing authorised rendered output remains independently downloadable.

## Evidence limitations

The harness proves the supported local/CI rendering profile. It does not claim
byte identity across arbitrary browser or encoder environments, and intentional
asset deletion may make an historical rerender unavailable while leaving any
still-retained authorised output available. No source text, signed URLs,
provider payloads, or generated media binaries are recorded here.
