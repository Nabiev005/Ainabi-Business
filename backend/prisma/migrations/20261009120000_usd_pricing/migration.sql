-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "priceRounding" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "usdRate" DECIMAL(10,4),
ADD COLUMN     "usdRateAuto" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "usdRateDate" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "usdPurchasePrice" DECIMAL(12,2),
ADD COLUMN     "usdSalePrice" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "day" TEXT NOT NULL,
    "usd" DECIMAL(10,4) NOT NULL,
    "nbkrDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("day")
);

