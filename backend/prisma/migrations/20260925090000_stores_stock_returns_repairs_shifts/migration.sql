-- CreateEnum
CREATE TYPE "SerialStatus" AS ENUM ('IN_STOCK', 'SOLD');

-- CreateEnum
CREATE TYPE "ReceiptType" AS ENUM ('PURCHASE', 'TRADE_IN');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('IN', 'OUT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'RETURN';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER';

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "checkPrescription" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enableRepairs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inventoryCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "receiptCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "repairCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requireShift" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "saleCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trackExpiry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weightBarcodes" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "isWholesale" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "debt_payments" ADD COLUMN     "shiftId" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "prescriptionRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scaleCode" TEXT,
ADD COLUMN     "variantGroupId" TEXT,
ADD COLUMN     "variantLabel" TEXT,
ADD COLUMN     "wholesalePrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "packageName" TEXT,
ADD COLUMN     "packageQuantity" DECIMAL(12,3),
ADD COLUMN     "returnedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "locationId" TEXT,
ADD COLUMN     "number" INTEGER,
ADD COLUMN     "priceLevel" TEXT NOT NULL DEFAULT 'RETAIL',
ADD COLUMN     "returnedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shiftId" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "inventoryCountId" TEXT,
ADD COLUMN     "locationId" TEXT,
ADD COLUMN     "receiptId" TEXT,
ADD COLUMN     "returnId" TEXT,
ADD COLUMN     "toLocationId" TEXT,
ADD COLUMN     "transferId" TEXT;

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_stocks" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "product_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variant_groups" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variant_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_packages" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factor" DECIMAL(12,3) NOT NULL,
    "barcode" TEXT,
    "salePrice" DECIMAL(12,2),

    CONSTRAINT "product_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_analogs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "analogId" TEXT NOT NULL,

    CONSTRAINT "product_analogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_serials" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "status" "SerialStatus" NOT NULL DEFAULT 'IN_STOCK',
    "receiptId" TEXT,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" TIMESTAMP(3),

    CONSTRAINT "product_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_batches" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" DATE,
    "initialQuantity" DECIMAL(12,3) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "receiptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "ReceiptType" NOT NULL DEFAULT 'PURCHASE',
    "supplierId" TEXT,
    "customerId" TEXT,
    "sellerName" TEXT,
    "locationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT,
    "docNumber" TEXT,
    "total" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod",
    "supplierDebtId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_items" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "purchasePrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" DATE,
    "serialNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "locationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "comment" TEXT,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "shortageValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "surplusValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_items" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expectedQty" DECIMAL(12,3) NOT NULL,
    "countedQty" DECIMAL(12,3) NOT NULL,
    "difference" DECIMAL(12,3) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "inventory_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT,
    "shiftId" TEXT,
    "total" DECIMAL(12,2) NOT NULL,
    "costTotal" DECIMAL(12,2) NOT NULL,
    "refundMethod" "PaymentMethod" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "costTotal" DECIMAL(12,2) NOT NULL,
    "serialNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_orders" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "device" TEXT NOT NULL,
    "serial" TEXT,
    "problem" TEXT NOT NULL,
    "notes" TEXT,
    "estimatedPrice" DECIMAL(12,2),
    "prepayment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalPrice" DECIMAL(12,2),
    "paymentMethod" "PaymentMethod",
    "status" "RepairStatus" NOT NULL DEFAULT 'RECEIVED',
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT,
    "prepaymentShiftId" TEXT,
    "deliveryShiftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "repair_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_shifts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "employeeId" TEXT NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingCash" DECIMAL(12,2) NOT NULL,
    "expectedCash" DECIMAL(12,2),
    "countedCash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "note" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locations_businessId_idx" ON "locations"("businessId");

-- CreateIndex
CREATE INDEX "product_stocks_locationId_idx" ON "product_stocks"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "product_stocks_productId_locationId_key" ON "product_stocks"("productId", "locationId");

-- CreateIndex
CREATE INDEX "stock_transfers_businessId_createdAt_idx" ON "stock_transfers"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_transfer_items_transferId_idx" ON "stock_transfer_items"("transferId");

-- CreateIndex
CREATE INDEX "product_variant_groups_businessId_idx" ON "product_variant_groups"("businessId");

-- CreateIndex
CREATE INDEX "product_packages_productId_idx" ON "product_packages"("productId");

-- CreateIndex
CREATE INDEX "product_packages_businessId_barcode_idx" ON "product_packages"("businessId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "product_analogs_productId_analogId_key" ON "product_analogs"("productId", "analogId");

-- CreateIndex
CREATE INDEX "product_serials_productId_status_idx" ON "product_serials"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_serials_businessId_serial_key" ON "product_serials"("businessId", "serial");

-- CreateIndex
CREATE INDEX "product_batches_businessId_expiryDate_idx" ON "product_batches"("businessId", "expiryDate");

-- CreateIndex
CREATE INDEX "product_batches_productId_idx" ON "product_batches"("productId");

-- CreateIndex
CREATE INDEX "purchase_receipts_businessId_createdAt_idx" ON "purchase_receipts"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_receiptId_idx" ON "purchase_receipt_items"("receiptId");

-- CreateIndex
CREATE INDEX "inventory_counts_businessId_createdAt_idx" ON "inventory_counts"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_count_items_countId_idx" ON "inventory_count_items"("countId");

-- CreateIndex
CREATE INDEX "sale_returns_businessId_createdAt_idx" ON "sale_returns"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "sale_returns_saleId_idx" ON "sale_returns"("saleId");

-- CreateIndex
CREATE INDEX "sale_return_items_returnId_idx" ON "sale_return_items"("returnId");

-- CreateIndex
CREATE INDEX "repair_orders_businessId_createdAt_idx" ON "repair_orders"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "repair_orders_businessId_status_idx" ON "repair_orders"("businessId", "status");

-- CreateIndex
CREATE INDEX "cash_shifts_businessId_openedAt_idx" ON "cash_shifts"("businessId", "openedAt");

-- CreateIndex
CREATE INDEX "cash_shifts_employeeId_status_idx" ON "cash_shifts"("employeeId", "status");

-- CreateIndex
CREATE INDEX "cash_movements_shiftId_idx" ON "cash_movements"("shiftId");

-- CreateIndex
CREATE INDEX "products_businessId_scaleCode_idx" ON "products"("businessId", "scaleCode");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_variantGroupId_fkey" FOREIGN KEY ("variantGroupId") REFERENCES "product_variant_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_groups" ADD CONSTRAINT "product_variant_groups_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_packages" ADD CONSTRAINT "product_packages_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_packages" ADD CONSTRAINT "product_packages_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_analogs" ADD CONSTRAINT "product_analogs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_analogs" ADD CONSTRAINT "product_analogs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_analogs" ADD CONSTRAINT "product_analogs_analogId_fkey" FOREIGN KEY ("analogId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_serials" ADD CONSTRAINT "product_serials_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_serials" ADD CONSTRAINT "product_serials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_countId_fkey" FOREIGN KEY ("countId") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "cash_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data: every existing business gets its default location, and today's
-- stock moves into it, so Product.quantity == SUM(product_stocks.quantity)
-- holds from the first request after deploy.
-- ---------------------------------------------------------------------------
INSERT INTO "locations" ("id", "businessId", "name", "isDefault", "archived", "createdAt")
SELECT 'loc_' || b."id", b."id", 'Негизги дүкөн', true, false, CURRENT_TIMESTAMP
FROM "businesses" b;

INSERT INTO "product_stocks" ("id", "productId", "locationId", "quantity")
SELECT 'ps_' || p."id", p."id", 'loc_' || p."businessId", p."quantity"
FROM "products" p;

-- Number existing sales per business in date order, and continue the
-- counter from there.
UPDATE "sales" s
SET "number" = numbered.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "businessId" ORDER BY "createdAt", "id") AS rn
  FROM "sales"
) numbered
WHERE s."id" = numbered."id";

UPDATE "businesses" b
SET "saleCounter" = COALESCE((SELECT MAX(s."number") FROM "sales" s WHERE s."businessId" = b."id"), 0);

-- Serials sold before per-unit serial tracking existed.
INSERT INTO "product_serials" ("id", "businessId", "productId", "serial", "status", "saleId", "createdAt", "soldAt")
SELECT DISTINCT ON (s."businessId", serial)
  'ser_' || md5(s."businessId" || serial), s."businessId", si."productId", serial, 'SOLD', s."id", s."createdAt", s."createdAt"
FROM "sale_items" si
JOIN "sales" s ON s."id" = si."saleId"
CROSS JOIN LATERAL unnest(si."serialNumbers") AS serial
ORDER BY s."businessId", serial, s."createdAt" DESC;
