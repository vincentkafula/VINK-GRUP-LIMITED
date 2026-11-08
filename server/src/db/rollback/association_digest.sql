-- Rolls back the association's scheduled email digest (docs/ASSOCIATION_COMPLIANCE.md). Safe to run more than once.
DROP TABLE IF EXISTS association_digest_log;
DROP TABLE IF EXISTS association_digests;
