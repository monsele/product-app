# 0054 exports compatibility

Adds the `export.downloaded` audit-event value. Existing audit rows and export
consumers remain valid; rollback requires confirming no audit records use the
new value before recreating the enum without it.
