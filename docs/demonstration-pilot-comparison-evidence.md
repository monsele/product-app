# ST-096 — comparison pilot evidence

Recorded 2026-09-19 on one Windows machine, one Chromium build, one FFmpeg build. Per CR-08 no cross-environment byte identity is claimed.

Everything below came out of the **running product**: the API, the outbox dispatcher, the production render worker and the real Postgres/MinIO stack, driven over HTTP the way the browser drives them. Nothing was produced by a fixture script or a test double.

## How the run was performed

```
docker compose up -d postgres redis minio
DATABASE_URL=… pnpm --filter @avlp/database run db:migrate
# API with the pilot on for one invited tester
DEMONSTRATION_PILOT_ENABLED=true DEMONSTRATION_PILOT_USER_IDS=<tester> \
  pnpm --filter @avlp/api run dev
pnpm --filter @avlp/pipeline-worker run dev     # outbox dispatcher
pnpm --filter @avlp/renderer run dev            # production render worker
```

Then, for each subject, over HTTP as the tester:

1. `POST /demonstration-test-lessons` `{subject}` → a real project
2. `POST /projects/:id/versions` → an immutable lesson version
3. `POST /projects/:id/validation-runs` → the deterministic engine
4. `GET  /projects/:id/demonstration-eligibility`
5. `POST /projects/:id/demonstration-comparisons`
6. `POST /projects/:id/demonstration-comparisons/:id/variants` `{approach:"standard"}`

## The two controlled pairs

| Subject | Approach | Duration | Bytes | Output sha256 (16) | Variant identity (12) |
| --- | --- | ---: | ---: | --- | --- |
| Savings | standard | 71.062 s | 4,198,462 | `767667ed4f903dbf` | `03c9593a8f2d` |
| Savings | demonstration | 71.062 s | 6,053,540 | `0bac2c52ada89863` | `e837a7a0376a` |
| Evaporation | standard | 63.062 s | 3,743,726 | `ddcb5b89e39ace4f` | `b6142619d3a7` |
| Evaporation | demonstration | 63.062 s | 4,641,442 | `e1f4099b35ea3d13` | `c194703d8e49` |

FFprobe on all four: `h264`/`aac`, 1920×1080, 30 fps.

Read across each pair:

- **Duration is identical to the millisecond.** 71.062 s for savings, 63.062 s for evaporation — and both match ST-095's own renders of the same subjects exactly, because the narration recording, its measured beats and the scene boundaries are the same objects, not equivalent ones.
- **The outputs are genuinely different clips.** Different checksums, and a 1.44× (savings) / 1.24× (evaporation) byte ratio, in line with ST-095's 1.50× / 1.27× from its isolated root.
- **The two halves have different render identities**, although their lesson version, narration checksums and captions are identical by construction. That is the approach being inside the hashed identity (CR-06). Without it the second request would have been served the first's video.

Artifacts (git-ignored, reproducible by the steps above):

```
artifacts/st-096/savings-standard.mp4          artifacts/st-096/savings-demonstration.mp4
artifacts/st-096/evaporation-standard.mp4      artifacts/st-096/evaporation-demonstration.mp4
artifacts/st-096/frame-{standard,demonstration}-{8,18,30,45,62}s.png
artifacts/st-096/frame-evap-{standard,demonstration}-{25,55}s.png
```

## What the frames show

**Savings, both approaches at 30 s.** Same scene title ("Two notes into savings"), same caption on screen at the same frame ("Watch them move across. Two notes leave the income tray."), same theme.

- *Standard* presents a three-step process list, with step 3 highlighted.
- *Demonstration* shows eight notes in the income tray, two in flight toward the savings jar, the income readout at ₦8,000 and savings at ₦0 with "₦2,000 arriving" — the in-transit money attributed to neither container, which is the modelling decision ST-095 made and defended.

**Savings, demonstration at 62 s.** Week 3. Six notes visibly in savings reading ₦6,000, eight in income reading ₦8,000, goal bar at 60% of ₦10,000. The arithmetic is visible and correct; conservation holds.

**Evaporation, demonstration at 55 s.** The vessel, the magnified-model frame, particles dispersed into the air region above the water, and the accuracy note "Each circle is one water particle. The outlined ones have left the liquid — they are still water."

## Behaviours verified against the running system

| Claim | How it was checked | Result |
| --- | --- | --- |
| Eligibility is recipe-backed, not a keyword | `GET …/demonstration-eligibility` on a seeded lesson | `selectable: true` with all three scenes resolved to the registered recipe, against the project's **own minted scene IDs** — the binding matched on narration checksums |
| No silent fallback | `POST /projects/:id/renders` on a demonstration-configured lesson | **409** "This lesson is set to the demonstration-led approach. Create a comparison to produce its video." No standard video produced |
| Repeat requests create no duplicates | 3× `POST …/demonstration-comparisons` + 3× `POST …/variants`, all `202` | Still exactly **1 comparison, 2 variants, 2 render jobs** |
| The baseline never moves | `md5(snapshot)` and `content_hash` of the lesson version, before and after all of the above | **Byte-identical**: `3b0b5a9a…` / `05802e92…` both times |
| Feedback persists and is revision-checked | `PUT` at revision 0 → 200 (revision 1); `GET` → same values; `PUT` at revision 0 again → **409**; `PUT` at revision 1 → 200 (revision 2) | As specified, attached to both variant IDs |
| Tenant isolation | A second registered account requesting the first's comparisons and feedback | **404** on both |
| Cohort gating | The same outsider requesting `GET /demonstration-test-lessons` | **404** — an uninvited account cannot learn the pilot exists |

## Migration compatibility, against real existing data

Migrations `0060` and `0061` were applied forward to a database that already held prior work: **11 projects, 2 lesson configurations, 3 lesson versions, 2 render jobs**.

After the migration both pre-existing `lesson_configurations` rows read `video_approach = 'standard'`. Nothing was backfilled and no immutable snapshot was rewritten — absence of the field *means* standard, so there was nothing to convert.

## Limitations of this evidence

- **One machine, one run.** No repeat-render determinism check was performed here; ST-095's remains the reference for that, and its conclusion — that this hardware cannot resolve per-frame cost differences between the approaches — is unchanged.
- **No human instructional review.** Whether demonstration explains better is the pilot's question and needs testers. Nothing here answers it.
- **Synthesized narration.** As in ST-095: local Windows Speech API output, which proves timing and caption correspondence but not the prosody of a professional read.
- **Two subjects only**, roughly 70 and 63 seconds, against a 180-second minimum configurable lesson duration.
