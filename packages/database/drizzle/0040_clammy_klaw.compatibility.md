# ST-058 project-private image assets

This additive migration creates immutable project asset records and short-lived
tenant-scoped upload sessions. Existing projects and storyboard bindings remain
unchanged. The original image is kept in private storage; `thumbnail_storage_key`
points at a versioned derived preview and can be regenerated without mutating the
original upload.
