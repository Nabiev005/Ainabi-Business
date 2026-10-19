-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "complimentary" BOOLEAN NOT NULL DEFAULT false;


-- The platform owner's own shop is free for good.
UPDATE "businesses" SET "complimentary" = true, "isTrial" = false
WHERE "ownerId" IN (SELECT "id" FROM "users" WHERE lower("email") = 'ajbeknabiev90@gmail.com');
