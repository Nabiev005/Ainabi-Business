-- CRM (Max plan): customer tags and birthday, and a timeline of notes / calls / messages / follow-ups. Additive only.
-- CreateEnum
CREATE TYPE "CustomerActivityKind" AS ENUM ('NOTE', 'CALL', 'MESSAGE', 'FOLLOW_UP');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "birthday" DATE,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "customer_activities" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "employeeId" TEXT,
    "kind" "CustomerActivityKind" NOT NULL,
    "text" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_activities_customerId_createdAt_idx" ON "customer_activities"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_activities_businessId_kind_doneAt_dueAt_idx" ON "customer_activities"("businessId", "kind", "doneAt", "dueAt");

-- AddForeignKey
ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

