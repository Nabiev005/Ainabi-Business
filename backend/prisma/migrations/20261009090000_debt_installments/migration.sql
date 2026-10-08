-- AlterTable
ALTER TABLE "debts" ADD COLUMN     "dueDate" TEXT,
ADD COLUMN     "lastRemindedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "debt_installments" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "debt_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debt_installments_debtId_idx" ON "debt_installments"("debtId");

-- AddForeignKey
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

