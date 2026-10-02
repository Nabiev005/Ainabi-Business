import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { hashPassword } from "../utils/password";
import { PLANS, PlanId } from "../config/plans";
import { env } from "../config/env";

/** Throws when one more active employee would exceed the plan (owner not counted). */
async function assertEmployeeLimit(businessId: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { plan: true } });
  const max = PLANS[business.plan as PlanId].maxEmployees;
  if (max === null) return;
  const active = await prisma.employee.count({ where: { businessId, status: "ACTIVE", role: { not: "OWNER" } } });
  if (active >= max) {
    throw new ApiError(402, `Тарифиңизде эң көп ${max} кызматкер. Көбүрөөк кошуу үчүн тарифти жогорулатыңыз.`, { code: "PLAN_LIMIT" });
  }
}
import { InviteEmployeeInput, UpdateEmployeeInput } from "../validators/employee.validator";

async function assertLocation(businessId: string, locationId: string | null | undefined) {
  if (!locationId) return;
  const location = await prisma.location.findFirst({ where: { id: locationId, businessId, archived: false } });
  if (!location) throw ApiError.badRequest("Филиал табылган жок.");
}

export async function listEmployees(businessId: string) {
  const employees = await prisma.employee.findMany({
    where: { businessId },
    include: { user: true, location: true },
    orderBy: { createdAt: "asc" },
  });

  return employees.map((e) => ({
    id: e.id,
    name: e.user.name,
    email: e.user.email,
    phone: e.user.phone,
    role: e.role,
    status: e.status,
    locationId: e.locationId,
    locationName: e.location?.name ?? null,
    lastLoginAt: e.lastLoginAt,
    createdAt: e.createdAt,
  }));
}

export async function inviteEmployee(businessId: string, input: InviteEmployeeInput) {
  await assertLocation(businessId, input.locationId);
  await assertEmployeeLimit(businessId);
  let user = await prisma.user.findUnique({ where: { email: input.email } });

  if (user) {
    const existingLink = await prisma.employee.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
    });
    if (existingLink) throw ApiError.conflict("Бул колдонуучу мурунтан кызматкер катары кошулган.");
  } else {
    // Creating this account would let the inviter choose its password.
    if (env.platformAdminEmails.includes(input.email.trim().toLowerCase())) {
      throw ApiError.forbidden("Бул email'ди кызматкер катары кошууга болбойт.");
    }
    const passwordHash = await hashPassword(input.password);
    user = await prisma.user.create({
      // The owner chose this password — the employee replaces it on first sign-in.
      data: { name: input.name, email: input.email, phone: input.phone, passwordHash, mustChangePassword: true },
    });
  }

  const employee = await prisma.employee.create({
    data: { userId: user.id, businessId, role: input.role, status: "ACTIVE", locationId: input.locationId || null },
    include: { user: true, location: true },
  });

  return {
    id: employee.id,
    name: employee.user.name,
    email: employee.user.email,
    phone: employee.user.phone,
    role: employee.role,
    status: employee.status,
    locationId: employee.locationId,
    locationName: employee.location?.name ?? null,
    lastLoginAt: employee.lastLoginAt,
    createdAt: employee.createdAt,
  };
}

export async function updateEmployee(businessId: string, id: string, input: UpdateEmployeeInput) {
  const employee = await prisma.employee.findFirst({ where: { id, businessId } });
  if (!employee) throw ApiError.notFound("Кызматкер табылган жок.");
  // The owner's role/status are fixed, but their branch can change.
  if (employee.role === "OWNER" && (input.role || input.status)) throw ApiError.forbidden("Ээнин ролун өзгөртүүгө болбойт.");
  await assertLocation(businessId, input.locationId);
  // Re-activating someone takes a seat again.
  if (input.status === "ACTIVE" && employee.status !== "ACTIVE") await assertEmployeeLimit(businessId);

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      role: input.role,
      status: input.status,
      ...(input.locationId !== undefined ? { locationId: input.locationId || null } : {}),
    },
    include: { user: true, location: true },
  });

  return {
    id: updated.id,
    name: updated.user.name,
    email: updated.user.email,
    phone: updated.user.phone,
    role: updated.role,
    status: updated.status,
    locationId: updated.locationId,
    locationName: updated.location?.name ?? null,
    lastLoginAt: updated.lastLoginAt,
    createdAt: updated.createdAt,
  };
}

/**
 * Owner gives a forgotten employee a new temporary password. Refused when the
 * person also belongs to (or owns) another business — resetting it here would
 * hand this owner their login everywhere else.
 */
export async function resetEmployeePassword(businessId: string, id: string, password: string) {
  const employee = await prisma.employee.findFirst({ where: { id, businessId } });
  if (!employee) throw ApiError.notFound("Кызматкер табылган жок.");
  if (employee.role === "OWNER") throw ApiError.forbidden("Ээнин паролун бул жерден өзгөртүүгө болбойт.");

  const [otherLinks, ownedBusinesses] = await Promise.all([
    prisma.employee.count({ where: { userId: employee.userId, businessId: { not: businessId } } }),
    prisma.business.count({ where: { ownerId: employee.userId } }),
  ]);
  if (otherLinks > 0 || ownedBusinesses > 0) {
    throw ApiError.forbidden("Бул колдонуучу башка бизнесте да катталган — паролун өзү гана өзгөртө алат.");
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: employee.userId }, data: { passwordHash, mustChangePassword: true } }),
    // Sign them out everywhere.
    prisma.refreshToken.updateMany({ where: { userId: employee.userId, revoked: false }, data: { revoked: true } }),
  ]);
}

export async function removeEmployee(businessId: string, id: string) {
  const employee = await prisma.employee.findFirst({ where: { id, businessId } });
  if (!employee) throw ApiError.notFound("Кызматкер табылган жок.");
  if (employee.role === "OWNER") throw ApiError.forbidden("Ээни өчүрүүгө болбойт.");
  await prisma.employee.delete({ where: { id } });
}
