-- Set when the owner chose the password (invite / reset): the person must pick their own on next sign-in.
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
