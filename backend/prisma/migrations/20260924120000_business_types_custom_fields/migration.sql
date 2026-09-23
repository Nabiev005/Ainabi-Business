-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "businessType" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "productFields" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "trackSerials" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trackWarranty" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "attributes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "attributesText" TEXT,
ADD COLUMN     "requiresSerial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "warrantyMonths" INTEGER;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "serialNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "warrantyUntil" TIMESTAMP(3);

-- CreateIndex (IMEI / serial lookup)
CREATE INDEX "sale_items_serialNumbers_idx" ON "sale_items" USING GIN ("serialNumbers");
