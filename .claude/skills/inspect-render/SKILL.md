---
name: inspect-render
description: See what the renderer actually produces — screenshot lesson scenes at the real 1080p canvas, or cut a rendered lesson.mp4 into frames — and detect content spilling out of its box, images that failed to paint, and anything crossing the caption safe area. Use when a video or scene "looks wrong", when images are missing from a render, when checking a scene-library layout change, or when asked to watch, view, or look at the rendered video.
---

# Inspect what the render produces

Scene bugs are visual. Reading the JSX will not tell you that a 30px label is
sitting in an 84px box — measuring it will. Two entry points: scenes (fast,
no render job needed) and the finished mp4 (slow, needs a completed render).

Both scripts live in this directory and must run **from the repo root**, because
`.claude/` has no `node_modules` and they anchor each dependency at the workspace
package that owns it.

## Rebuild first — always

Both scripts read `packages/scene-library/dist/`, never `src/`. Editing a `.tsx`
file changes nothing until you rebuild, and you will chase a bug you already fixed:

```sh
pnpm --filter @avlp/scene-library build
```

## Scenes

```sh
node .claude/skills/inspect-render/shoot-scenes.mjs                      # every exported fixture
node .claude/skills/inspect-render/shoot-scenes.mjs --project <uuid>     # this project's real scenes
node .claude/skills/inspect-render/shoot-scenes.mjs --scene-file scene.json
```

Options: `--out <dir>` (default `.runtime-logs/scene-shots`), `--frame <n>`
(default 200 — late enough that staged reveals have finished; frame 0 is blank
by design), `--mode preview|render` (default `render`, which is the stricter one
— several scenes throw rather than degrade when a required asset is unresolved).

Exit code is 0 only if every scene passes. Per scene it reports:

- **content escapes its box** — an element with a visible border or background
  whose `scrollHeight` exceeds its own rect. This is the check that catches text
  rendering *underneath* its own card.
- **below caption safe area** — a leaf whose *clipped* rect crosses y=876, where
  the caption strip starts. The rect is intersected with every clipping ancestor
  first: a diagram `<img>` sized `height: 100%` overflows its own box by hundreds
  of pixels while being clipped to well above the line, and reporting the raw
  rect flags all four labelled-diagram fixtures for nothing.
- **images did not paint** — bound `assetBindings` versus `<img>` elements that
  actually decoded. A silent 0-of-5 here is the signature of an asset URL being
  rejected upstream, not of a broken component.

`--project` pulls scenes from the `scenes` table and signs real MinIO URLs from
`project_assets`, so it exercises the true asset path, including the URL
allowlist in [scene-registry.tsx](../../../packages/scene-library/src/scene-registry.tsx).
It needs Docker up. Sample of what a real failure looks like:

```
FAIL 5-process
     content escapes its box: li[data-process-step] 84px box / 134px content
     below caption safe area: span
```

**Look at the PNGs even when everything passes.** The checks catch geometry, not
ugliness — cramped rows, an icon shrunk to a speck, or a colour clash all pass.

### Known-failing fixtures — not your change

The no-argument fixture sweep currently reports 33 pass / 6 fail, and all six are
the same pre-existing gap: **`input-process-output` and `cause-effect` declare
icon asset slots in the registry and their fixtures bind assets, but neither
component renders an `<img>` at all.** Every `*IpoFixture` and
`*CauseEffectFixture` therefore reports "1 of 1 bound image(s) did not paint".
That is unbuilt behaviour, not a regression. Compare against this baseline before
blaming your own edit; if you build icon rendering into either template, delete
this paragraph.

### What this cannot catch

The script renders the `*SceneFrame` exports, which take `frame` as a prop.
The `*Scene` wrappers that call `useCurrentFrame()` are bypassed entirely, so a
wrapper that forgets to forward `resolvedAssets` will still show images here and
drop them in the real video. That class of bug belongs to
[scene-asset-forwarding.test.tsx](../../../packages/scene-library/src/scene-asset-forwarding.test.tsx),
which stubs the hook and renders through `SceneRuntime`. Add a case there rather
than trying to make this script cover it.

## The finished video

```sh
node .claude/skills/inspect-render/watch-video.mjs                  # newest render, any project
node .claude/skills/inspect-render/watch-video.mjs --project <uuid>
node .claude/skills/inspect-render/watch-video.mjs --file path/to/lesson.mp4 --every 5
```

Options: `--every <seconds>` (default 10), `--out <dir>` (default
`.runtime-logs/video-frames`). Then Read the PNGs.

ffmpeg and ffprobe are **not on PATH** and do not need to be — Remotion ships
both in its native compositor package, and the script locates whichever
platform build is installed.

Two things that will waste your time otherwise:

- Get the mp4 through the **S3 API**, which the script does. The file sitting at
  `/data/<bucket>/.../lesson.mp4/<uuid>/part.1` inside the MinIO container is
  erasure-coded storage, not a playable mp4 — ffprobe rejects it with
  `moov atom not found`.
- The storage key comes from the **`rendered_videos`** table. Do not rebuild the
  path from `render_jobs.id`: the artifact is filed under its own id, and the two
  differ, so a reconstructed key 404s.

A frame that lands mid-transition is legitimately near-empty — scenes cross-fade.
Sample around a suspect timestamp before concluding a scene renders blank.

## Reading the result

Scene order and duration come from the `scenes` table, so map a timestamp to a
scene rather than guessing:

```sh
docker exec product-app-postgres-1 psql -U postgres -d visual_learning \
  -c "select \"order\", template, duration_seconds, scene_json->>'title' from scenes where project_id='<uuid>' order by \"order\";"
```

Durations are cumulative from zero at 30fps.

When something is wrong, fix it, rebuild, and re-run the same command — the
before/after pair is the evidence that the fix landed.
