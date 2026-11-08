-- Rolls back OWNER DASHBOARD slice D1 (docs/OWNER_DASHBOARD.md). Safe to run more than once; it removes only what D1 added, in reverse order.
DROP TABLE IF EXISTS maintenance_log;
DROP TABLE IF EXISTS vehicle_costs;
DROP TABLE IF EXISTS finance_instalments;
DROP TABLE IF EXISTS vehicle_finance;
