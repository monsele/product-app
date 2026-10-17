# 0075 — Recovery provider dispatch reservations

Additive columns on the new recovery task table. The call map stores only dispatch
identity and reserved cost, never narration. Deploy before recovery workers. Failed
or uncertain calls retain their reservation; existing usage records hold actual
provider costs. Prior attempts include jobs started before recovery enrollment.
