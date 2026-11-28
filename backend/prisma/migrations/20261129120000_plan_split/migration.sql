-- Plans split: loyalty/reservations/wholesale move to Pro, AI/risk/Telegram to Max.
-- Businesses that are paying or on trial right now keep what they had until
-- their current period ends; their next payment starts the new rules.
ALTER TABLE "businesses" ADD COLUMN "legacyFeaturesUntil" TIMESTAMP(3);

UPDATE "businesses"
SET "legacyFeaturesUntil" = "planExpiresAt"
WHERE "complimentary" = false AND "planExpiresAt" IS NOT NULL AND "planExpiresAt" > NOW();
