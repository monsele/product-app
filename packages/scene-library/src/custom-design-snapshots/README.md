# Reviewed custom-design frames

These six signatures cover the same opening, definition and native diagram in
two manually authored identities. They use the licensed Source Sans fixture font
with its bytes pinned in the manifest. Full-size frames and encoded fixture
videos are reviewed under `output/st123/` (ST-123, 2026-10-19).

Each pixel averages one 12×12 block of the 1920×1080 capture. Regression checks
permit two channel levels of rounding per averaged pixel. Separate repeat-frame
checks permit at most one channel level on fewer than 0.01% of original pixels;
Player/export parity and font SHA-256 checks run independently.

Review an intentional presentation change at full size before updating these
files. Set `ST123_UPDATE_BASELINES=true` for the render test to regenerate them,
then review the resulting diff and rerun without that flag. Set
`ST123_RENDER_MP4=true` to regenerate the two encoded fixtures; normal regression
runs check frames without repeating the full encode. Neither action calls an AI
or speech provider.
