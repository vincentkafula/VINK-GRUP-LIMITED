-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ISSUED', 'USED', 'VOID');

-- AlterTable
ALTER TABLE "Txn" ADD COLUMN     "ticketId" INTEGER;

-- CreateTable
CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "cardUid" TEXT NOT NULL,
    "routeId" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "keyId" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ISSUED',
    "method" "TopupMethod" NOT NULL,
    "reference" TEXT NOT NULL,
    "issuedBy" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "usedDevice" TEXT,
    "journalId" TEXT,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ticket_cardUid_idx" ON "Ticket"("cardUid");

-- CreateIndex
CREATE INDEX "Ticket_status_validUntil_idx" ON "Ticket"("status", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_method_reference_key" ON "Ticket"("method", "reference");
