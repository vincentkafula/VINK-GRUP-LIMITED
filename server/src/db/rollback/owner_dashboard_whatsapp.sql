-- Rolls back the owner's WhatsApp alerts (docs/OWNER_DASHBOARD.md). Safe to run more than once.
DROP TABLE IF EXISTS owner_whatsapp_log;
DROP TABLE IF EXISTS owner_whatsapp;
