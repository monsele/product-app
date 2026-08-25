# 0006 wise mystique compatibility notes

This forward-only migration adds the application-owned authentication root:
`users`, provider mappings, local credential hashes, and hashed browser
sessions. Existing domain tables are unchanged. Deploy the migration before an
API process that enables password authentication; rolling back requires
disabling the feature rather than dropping user records.
