# 0053 render lifecycle compatibility

Adds render lifecycle and verified-output tables without changing existing
lesson-version or job records. It also adds the nullable storage-verifier
checksum to `scene_audio`; existing audio cannot enter a new immutable render
until it is regenerated, because its object checksum was not previously
recorded. The migration is forward-only; rollback requires dropping the new
render tables/type and the additive checksum column after confirming no render
records reference them.
