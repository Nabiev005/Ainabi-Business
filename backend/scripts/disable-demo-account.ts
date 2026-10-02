/**
 * Locks the seed's demo login (owner@ainabi.kg / password123) out of a real
 * database. Nothing is deleted — the password is replaced with a random one,
 * every session is revoked and its employee rows are deactivated, so the
 * well-known credentials stop working.
 *
 *   DATABASE_URL="<prod url>" npx tsx scripts/disable-demo-account.ts          # dry run: shows what it finds
 *   DATABASE_URL="<prod url>" npx tsx scripts/disable-demo-account.ts --apply  # actually locks it
 */
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const DEMO_EMAIL = "owner@ainabi.kg";
const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    include: { employeeOf: { include: { business: { select: { name: true } } } } },
  });
  if (!user) {
    console.log(`OK: ${DEMO_EMAIL} is not in this database — nothing to do.`);
    return;
  }

  const stillDefault = !!user.passwordHash && (await bcrypt.compare("password123", user.passwordHash));
  console.log(`Found ${DEMO_EMAIL} (${user.name}); demo password still works: ${stillDefault ? "YES" : "no"}`);
  for (const e of user.employeeOf) console.log(`  - ${e.role} in "${e.business.name}" (${e.status})`);

  if (!apply) {
    console.log("\nDry run — nothing changed. Re-run with --apply to lock the account.");
    return;
  }

  const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, googleId: null } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revoked: true } }),
    prisma.employee.updateMany({ where: { userId: user.id }, data: { status: "INACTIVE" } }),
  ]);
  console.log(`\nLocked: ${DEMO_EMAIL} can no longer sign in.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
