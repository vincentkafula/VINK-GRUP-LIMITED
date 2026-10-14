-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'AGENT', 'VIEWER');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'LOST', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('DESFIRE', 'ULTRALIGHT_TICKET');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('adult', 'student', 'senior', 'child', 'staff');

-- CreateEnum
CREATE TYPE "FareMode" AS ENUM ('FLAT', 'ZONE');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "TopupMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'ADMIN');

-- CreateEnum
CREATE TYPE "TopupStatus" AS ENUM ('PENDING_LOAD', 'LOADED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "operatorId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "mode" "FareMode" NOT NULL,
    "flatAmount" INTEGER,
    "minFare" INTEGER NOT NULL DEFAULT 0,
    "maxFare" INTEGER NOT NULL DEFAULT 0,
    "apbSeconds" INTEGER NOT NULL DEFAULT 120,
    "tapOutTimeoutSeconds" INTEGER NOT NULL DEFAULT 14400,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stop" (
    "id" INTEGER NOT NULL,
    "routeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "zone" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,

    CONSTRAINT "Stop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoneFare" (
    "id" SERIAL NOT NULL,
    "routeId" INTEGER NOT NULL,
    "fromZone" INTEGER NOT NULL,
    "toZone" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "ZoneFare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeRule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER[],
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "multiplierBp" INTEGER NOT NULL,

    CONSTRAINT "TimeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRule" (
    "category" "Category" NOT NULL,
    "discountBp" INTEGER NOT NULL,

    CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("category")
);

-- CreateTable
CREATE TABLE "FareTableVersion" (
    "version" INTEGER NOT NULL,
    "json" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT,

    CONSTRAINT "FareTableVersion_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "routeId" INTEGER,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "rotation" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3),
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "fareVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceNonce" (
    "deviceId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceNonce_pkey" PRIMARY KEY ("deviceId","nonce")
);

-- CreateTable
CREATE TABLE "Card" (
    "uid" TEXT NOT NULL,
    "type" "CardType" NOT NULL DEFAULT 'DESFIRE',
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "holderName" TEXT,
    "holderRef" TEXT,
    "category" "Category" NOT NULL DEFAULT 'adult',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" TEXT,
    "blockedReason" TEXT,
    "lastCounter" INTEGER NOT NULL DEFAULT 0,
    "lastTapAt" TIMESTAMP(3),

    CONSTRAINT "Card_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Txn" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceSeq" INTEGER NOT NULL,
    "cardUid" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "kind" TEXT,
    "denyReason" TEXT,
    "routeId" INTEGER NOT NULL,
    "stopId" INTEGER NOT NULL,
    "fare" INTEGER NOT NULL,
    "penalty" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "cardCounter" INTEGER NOT NULL,
    "category" "Category" NOT NULL,
    "tappedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fareTableVersion" INTEGER NOT NULL,
    "offline" BOOLEAN NOT NULL,
    "journalId" TEXT,

    CONSTRAINT "Txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posting" (
    "id" BIGSERIAL NOT NULL,
    "journalId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Posting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topup" (
    "id" TEXT NOT NULL,
    "cardUid" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "TopupMethod" NOT NULL,
    "status" "TopupStatus" NOT NULL DEFAULT 'PENDING_LOAD',
    "reference" TEXT NOT NULL,
    "createdBy" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loadedAt" TIMESTAMP(3),
    "paidJournalId" TEXT,
    "loadedJournalId" TEXT,

    CONSTRAINT "Topup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anomaly" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "cardUid" TEXT,
    "deviceId" TEXT,
    "txnId" TEXT,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Anomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" JSONB,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Route_code_key" ON "Route"("code");

-- CreateIndex
CREATE INDEX "Stop_routeId_idx" ON "Stop"("routeId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoneFare_routeId_fromZone_toZone_key" ON "ZoneFare"("routeId", "fromZone", "toZone");

-- CreateIndex
CREATE INDEX "DeviceNonce_expiresAt_idx" ON "DeviceNonce"("expiresAt");

-- CreateIndex
CREATE INDEX "Card_status_idx" ON "Card"("status");

-- CreateIndex
CREATE INDEX "Txn_tappedAt_idx" ON "Txn"("tappedAt");

-- CreateIndex
CREATE INDEX "Txn_cardUid_cardCounter_idx" ON "Txn"("cardUid", "cardCounter");

-- CreateIndex
CREATE INDEX "Txn_deviceId_deviceSeq_idx" ON "Txn"("deviceId", "deviceSeq");

-- CreateIndex
CREATE INDEX "Txn_routeId_tappedAt_idx" ON "Txn"("routeId", "tappedAt");

-- CreateIndex
CREATE INDEX "Journal_ref_idx" ON "Journal"("ref");

-- CreateIndex
CREATE INDEX "Posting_account_id_idx" ON "Posting"("account", "id");

-- CreateIndex
CREATE INDEX "Posting_journalId_idx" ON "Posting"("journalId");

-- CreateIndex
CREATE INDEX "Topup_cardUid_status_idx" ON "Topup"("cardUid", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Topup_method_reference_key" ON "Topup"("method", "reference");

-- CreateIndex
CREATE INDEX "Anomaly_cardUid_createdAt_idx" ON "Anomaly"("cardUid", "createdAt");

-- CreateIndex
CREATE INDEX "Anomaly_resolvedAt_severity_idx" ON "Anomaly"("resolvedAt", "severity");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stop" ADD CONSTRAINT "Stop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneFare" ADD CONSTRAINT "ZoneFare_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Txn" ADD CONSTRAINT "Txn_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Txn" ADD CONSTRAINT "Txn_cardUid_fkey" FOREIGN KEY ("cardUid") REFERENCES "Card"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
