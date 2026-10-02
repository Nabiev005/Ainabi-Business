/**
 * Creates the platform owner's account (or resets its password) straight in
 * the database. The public sign-up refuses PLATFORM_ADMIN_EMAILS on purpose,
 * so this — which needs the database URL — is the way to make that account
 * when Google sign-in isn't set up. The password is read from the
 * environment so it never lands in a file or the shell history of a script.
 *
 *   DATABASE_URL="<prod url>" ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="..." \
 *     npx tsx scripts/create-platform-admin.ts
 *
 * Exists already → its password is replaced (add nothing else).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 8) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters).");
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: existing.id }, data: { passwordHash, mustChangePassword: false } }),
      prisma.refreshToken.updateMany({ where: { userId: existing.id, revoked: false }, data: { revoked: true } }),
    ]);
    console.log(`Password updated for ${email}. Make sure it's listed in PLATFORM_ADMIN_EMAILS.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name: "Platform admin", email, passwordHash, provider: "PASSWORD" } });
    const business = await tx.business.create({
      data: { name: "Ainabi Platform", ownerId: user.id, plan: "MAX", isTrial: false, planExpiresAt: new Date("2100-01-01") },
    });
    await tx.employee.create({ data: { userId: user.id, businessId: business.id, role: "OWNER", status: "ACTIVE" } });
  });
  console.log(`Created ${email}. Make sure it's listed in PLATFORM_ADMIN_EMAILS, then sign in with this password.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
