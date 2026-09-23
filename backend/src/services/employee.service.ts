import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { hashPassword } from "../utils/password";
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
  let user = await prisma.user.findUnique({ where: { email: input.email } });

  if (user) {
    const existingLink = await prisma.employee.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
    });
    if (existingLink) throw ApiError.conflict("Бул колдонуучу мурунтан кызматкер катары кошулган.");
  } else {
    const passwordHash = await hashPassword(input.password);
    user = await prisma.user.create({
      data: { name: input.name, email: input.email, phone: input.phone, passwordHash },
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

export async function removeEmployee(businessId: string, id: string) {
  const employee = await prisma.employee.findFirst({ where: { id, businessId } });
  if (!employee) throw ApiError.notFound("Кызматкер табылган жок.");
  if (employee.role === "OWNER") throw ApiError.forbidden("Ээни өчүрүүгө болбойт.");
  await prisma.employee.delete({ where: { id } });
}
