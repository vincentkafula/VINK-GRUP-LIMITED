-- Rolls back OWNER DASHBOARD slice A (docs/OWNER_DASHBOARD.md). Safe to run more than once; it removes only what slice A added, in reverse order of creation.
DROP TABLE IF EXISTS target_waivers;
DROP TABLE IF EXISTS vehicle_split_rules;
DROP TABLE IF EXISTS driver_payment_allocations;
DROP TABLE IF EXISTS driver_payments;
DROP TABLE IF EXISTS target_pauses;
DROP TABLE IF EXISTS vehicle_targets;
