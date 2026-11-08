-- Rolls back OWNER DASHBOARD slice E (docs/OWNER_DASHBOARD.md). It removes the team's logins from the team list but NOT their user accounts. Safe to run more than once.
DROP TABLE IF EXISTS owner_team;
