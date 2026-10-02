-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('BASIC', 'PRO', 'MAX');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "plan" "SubscriptionPlan" NOT NULL DEFAULT 'PRO',
ADD COLUMN     "planExpiresAt" TIMESTAMP(3);

-- Every business that already exists gets the same 14-day PRO trial a new
-- sign-up gets, counted from the moment this migration runs.
UPDATE "businesses" SET "planExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '14 days' WHERE "planExpiresAt" IS NULL;

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "months" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_payments_businessId_createdAt_idx" ON "subscription_payments"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
