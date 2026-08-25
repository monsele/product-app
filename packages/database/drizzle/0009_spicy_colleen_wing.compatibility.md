# 0009 spicy colleen wing compatibility notes

This forward-only migration adds the `projects` ownership root, the coarse
`project_stage` enum, and the `project.created` audit event. Existing users are
unaffected; new projects begin in `draft`, while failures are stored separately
from the last successful stage.

Deploy the migration before API instances that create or list projects. Rollback
is operational: stop those instances and leave this forward migration in place.
