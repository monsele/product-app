# 0051 caption tracks compatibility

Adds tenant-owned immutable caption cues for a content-addressed scene-audio
artifact. Existing audio rows have no caption track until audio is regenerated;
they remain valid but report captions as unavailable/stale to downstream
validation. The migration does not rewrite source narration or audio objects.
