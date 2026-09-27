# Sound bed catalog — license records (ST-103)

Every track in `tracks/` is an original work synthesised by
`generate-tracks.mjs` in this directory. The generator builds each loop from
sine partials, simple amplitude envelopes and a seeded pseudo-random number
generator. It uses no sample, recording, loop library, third-party
composition, or generated-music provider.

The project dedicates these tracks to the public domain under
**CC0 1.0 Universal** (<https://creativecommons.org/publicdomain/zero/1.0/>).
No attribution is required, so each catalog row stores
`attribution_text = NULL`. The share page and exported metadata show
attribution only for rows where it is non-null. That keeps the attribution path
ready for any future licensed track that does require it.

## Clean-room statement

ST-103 adopts a *technique* noted in OpenMontage (a ducked music bed under
narration), not its implementation. No OpenMontage code, schema, prompt, asset,
or configuration was read into, copied into, or adapted for this catalog, the
generator, the ducking envelope, or the post-render review. OpenMontage is
AGPL-3.0; nothing here is a derivative of it.

## Records

| trackId | Title | License | Source | Attribution | Duration | Loops | LUFS | Peak dBFS | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| morning-pad | Morning Pad | CC0-1.0 | generate-tracks.mjs (seed 11) | none | 16.0 s | yes | -20.0 | -8.4 | a38c5d2e4807d0a92f4c0e12864af80f6cd0c59cc6c398ce561b974ff638e025 |
| quiet-pulse | Quiet Pulse | CC0-1.0 | generate-tracks.mjs (seed 23) | none | 16.0 s | yes | -20.0 | -6.2 | 01ce1376fe1393bbaa83d3f0278928452f7ec449b4a3ef9e63306a095147fab0 |
| soft-plucks | Soft Plucks | CC0-1.0 | generate-tracks.mjs (seed 37) | none | 16.0 s | yes | -20.0 | -5.7 | 7e89596eb29a8957cf485de98ae0890582b3401fa4bd2df7d411a3272f5434d6 |
| warm-drift | Warm Drift | CC0-1.0 | generate-tracks.mjs (seed 41) | none | 16.0 s | yes | -20.0 | -7.2 | 8fed8e0d79250904a78980742eac9f16610eef6c5f25e943c856c2dd54a3d6c5 |
| bright-steps | Bright Steps | CC0-1.0 | generate-tracks.mjs (seed 53) | none | 16.0 s | yes | -20.0 | -5.8 | 7d690296bbc1cee1ac7003b9f66c3826e896622f73d81ad6afa7322d54f75ce8 |
| night-glass | Night Glass | CC0-1.0 | generate-tracks.mjs (seed 67) | none | 16.0 s | yes | -20.0 | -8.0 | aca66c7914dd40b2f8a35e77293bd66429d1a977ce78baab43ab539a516fba88 |

All tracks are 24 kHz, mono, 16-bit PCM WAV. They are 16-second seamless loops
(480 frames at 30 fps), so they cover the 420-second maximum lesson by
repetition.

## Immutability

A registered checksum is never re-used for different bytes. Re-running the
generator must reproduce the committed files; it exits non-zero on drift. A
changed track is published under a new `trackId`. Retiring a track sets its
catalog status to `retired`: new configurations can no longer choose it, but
lesson versions that pinned it keep rendering from the same checksum-addressed
object.

## Registration

`pnpm --filter @avlp/api sound-beds:register` uploads each file to
`catalog/sound-beds/<trackId>/<sha256>.wav` in the private bucket, verifies
the stored checksum against the committed record, and skips objects that are
already present and verified.
