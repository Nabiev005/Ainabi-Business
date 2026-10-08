-- CreateEnum
CREATE TYPE "WholesaleOrderStatus" AS ENUM ('NEW', 'ACCEPTED', 'SHIPPED', 'RECEIVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "wholesaleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wholesaleNote" TEXT;

-- CreateTable
CREATE TABLE "wholesale_orders" (
    "id" TEXT NOT NULL,
    "buyerBusinessId" TEXT NOT NULL,
    "sellerBusinessId" TEXT NOT NULL,
    "status" "WholesaleOrderStatus" NOT NULL DEFAULT 'NEW',
    "total" DECIMAL(12,2) NOT NULL,
    "comment" TEXT,
    "sellerNote" TEXT,
    "createdByName" TEXT NOT NULL,
    "saleId" TEXT,
    "receiptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wholesale_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wholesale_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "wholesale_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wholesale_orders_buyerBusinessId_createdAt_idx" ON "wholesale_orders"("buyerBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "wholesale_orders_sellerBusinessId_status_idx" ON "wholesale_orders"("sellerBusinessId", "status");

-- CreateIndex
CREATE INDEX "wholesale_order_items_orderId_idx" ON "wholesale_order_items"("orderId");

-- AddForeignKey
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_buyerBusinessId_fkey" FOREIGN KEY ("buyerBusinessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_sellerBusinessId_fkey" FOREIGN KEY ("sellerBusinessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "wholesale_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

