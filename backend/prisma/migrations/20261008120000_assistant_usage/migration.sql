-- CreateTable
CREATE TABLE "assistant_usage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assistant_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_usage_businessId_day_key" ON "assistant_usage"("businessId", "day");

-- AddForeignKey
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

