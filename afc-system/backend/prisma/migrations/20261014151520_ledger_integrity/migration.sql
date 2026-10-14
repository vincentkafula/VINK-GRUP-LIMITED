-- The ledger is append-only and always balanced. These rules live in the database so no bug, script or hand-typed UPDATE can break them.

-- 1. Journals and postings can never be changed or deleted. Corrections are new, opposite journals.
CREATE OR REPLACE FUNCTION afc_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger rows are immutable (% on %)', TG_OP, TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_immutable BEFORE UPDATE OR DELETE ON "Journal" FOR EACH ROW EXECUTE FUNCTION afc_forbid_change();
CREATE TRIGGER posting_immutable BEFORE UPDATE OR DELETE ON "Posting" FOR EACH ROW EXECUTE FUNCTION afc_forbid_change();
CREATE TRIGGER journal_no_truncate BEFORE TRUNCATE ON "Journal" FOR EACH STATEMENT EXECUTE FUNCTION afc_forbid_change();
CREATE TRIGGER posting_no_truncate BEFORE TRUNCATE ON "Posting" FOR EACH STATEMENT EXECUTE FUNCTION afc_forbid_change();

-- 2. Every journal's postings add up to zero, checked when the transaction commits (so the postings can be inserted one by one).
CREATE OR REPLACE FUNCTION afc_check_journal_balanced() RETURNS trigger AS $$
DECLARE total bigint;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total FROM "Posting" WHERE "journalId" = NEW."journalId";
  IF total <> 0 THEN
    RAISE EXCEPTION 'journal % is unbalanced by % cents', NEW."journalId", total USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER posting_balanced AFTER INSERT ON "Posting" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION afc_check_journal_balanced();

-- 3. A card's fare balance can never be recorded below zero.
ALTER TABLE "Posting" ADD CONSTRAINT card_balance_not_negative CHECK (account NOT LIKE 'card:%' OR "balanceAfter" IS NULL OR "balanceAfter" >= 0);
