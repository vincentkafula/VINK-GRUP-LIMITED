-- Rolls back OWNER DASHBOARD slice F3 (docs/OWNER_DASHBOARD.md). Removes every owner's text-alert settings and log. Safe to run more than once.
DROP TABLE IF EXISTS owner_sms_log;
DROP TABLE IF EXISTS owner_sms;
