-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidedBy" TEXT,
ADD COLUMN "voidReason" TEXT,
ADD COLUMN "voidJournalId" TEXT;
