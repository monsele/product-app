# 0042 flippant namorita compatibility

This migration removes the tenant SHA-256 uniqueness constraint for project
assets. Existing rows are unchanged. New uploads with identical content remain
separate immutable assets, so every upload session can retain its own asset ID
and validation lifecycle.
