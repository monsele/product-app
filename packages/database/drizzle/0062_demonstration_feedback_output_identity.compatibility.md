# 0062 Demonstration feedback output identity

This additive migration adds `demonstration_feedback.rated_outputs` with an
empty-array default. Existing pilot feedback remains readable through its
existing comparison and variant references; only feedback saved after this
migration captures immutable rendered-video identities. No lesson, render, or
source artifact is rewritten.
