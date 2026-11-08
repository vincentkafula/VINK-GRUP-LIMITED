-- Rolls back the owner's own business record (docs/OWNER_DASHBOARD.md). It does NOT touch the association's owner_business table, which is a different thing. Safe to run more than once.
DROP TABLE IF EXISTS owner_business_profile;
