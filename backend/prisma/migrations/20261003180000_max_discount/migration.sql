-- Seller discount cap (percent of the receipt); owner/manager are not limited.
ALTER TABLE "businesses" ADD COLUMN     "maxDiscountPercent" INTEGER NOT NULL DEFAULT 10;
