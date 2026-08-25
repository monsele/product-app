# 0055 Share Links Compatibility

This forward-only migration adds the immutable target and revocation metadata for public lesson-view capabilities. Existing rendered videos and lesson versions are not changed. Deploy the API only after this migration so public resolution never queries an absent table.
