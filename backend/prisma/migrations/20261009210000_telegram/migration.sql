-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLang" TEXT,
ADD COLUMN     "telegramLinkCode" TEXT,
ADD COLUMN     "telegramLinkExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "employees_telegramLinkCode_key" ON "employees"("telegramLinkCode");

