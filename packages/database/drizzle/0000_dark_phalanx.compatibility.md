# `0000_dark_phalanx` compatibility

`database_metadata` is an infrastructure-only smoke table. Once this migration is applied, do not drop the table and delete the Drizzle journal in place: that would make later migration history inconsistent.

To remove or replace this table in a non-disposable environment, add a reviewed forward migration. For a disposable test database, drop and recreate the database instead.
