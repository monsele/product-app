# 0064 Creative-design interpretation metering

This additive migration registers `ai.creative_design` for usage metering and
adds immutable, tenant-scoped creative-design proposals. Existing drafts and
snapshots remain unchanged. A proposal is review data only: it cannot mutate a
draft and is removed with its mutable draft on project cleanup.
