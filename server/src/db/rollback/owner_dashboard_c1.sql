-- Rolls back OWNER DASHBOARD slice C1 (docs/OWNER_DASHBOARD.md). Safe to run more than once.
DROP TABLE IF EXISTS owner_compliance_settings;
DROP TABLE IF EXISTS licence_rules;
ALTER TABLE operating_licences DROP COLUMN IF EXISTS province;
