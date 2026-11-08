-- Rolls back OWNER DASHBOARD slice C2 (docs/OWNER_DASHBOARD.md). This DELETES every stored file. Safe to run more than once.
DROP TABLE IF EXISTS owner_files;
