-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "catalogEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "catalogNote" TEXT,
ADD COLUMN     "catalogShowStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "catalogSlug" TEXT,
ADD COLUMN     "catalogWhatsapp" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "businesses_catalogSlug_key" ON "businesses"("catalogSlug");

