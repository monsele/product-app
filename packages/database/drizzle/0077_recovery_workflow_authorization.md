# 0077 - Generation and shared preparation authority

Additive defaults preserve legacy runs: `preparation_authorized=false`, allocation
zero. Only a new brief confirmation made while the feature is enabled grants the
new authority. A preparation allocation is earmarked inside the original video cap
and excluded from its remaining generation budget. Workflow switches reuse the
project's one active preparation session, never another parallel allowance.

Storyboard generation consent is persisted before dispatch, with the estimate
fingerprint, capped amount, stable request key and correlation identity. Scheduler
replay can recover a dispatch interrupted by a process restart. A completed job's
candidate ID must identify the current tenant-owned draft before enrollment.
Stopping preparation cancels pending grants; dispatched generation may still cost
usage. Old clients without consent retain explicit manual preparation behavior.

Deploy schemas and migration before API/worker consumers. No LessonSpec or
NormalizedDocument migration. Rollback application consumers before dropping these
columns/table; retain existing authority and usage records until work has settled.
