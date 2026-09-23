import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { BUSINESS_TEMPLATES, findTemplate, localizeTemplate, MODULE_KEYS } from "../config/businessTemplates";
import { ApiError } from "../utils/ApiError";
import { getDefaultLocation } from "../utils/stockLedger";
import type { Lang } from "../i18n/messages";
import {
  ApplyTemplateInput,
  LocationInput,
  parseProductFields,
  UpdateBusinessInput,
  UpdateProductConfigInput,
} from "../validators/settings.validator";

type Db = Prisma.TransactionClient | typeof prisma;

export function listTemplates(lang: Lang) {
  return BUSINESS_TEMPLATES.map((t) => localizeTemplate(t, lang));
}

export async function getBusiness(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw ApiError.notFound("Бизнес табылган жок.");
  return business;
}

export function updateBusiness(businessId: string, input: UpdateBusinessInput) {
  return prisma.business.update({ where: { id: businessId }, data: input });
}

export function updateProductConfig(businessId: string, input: UpdateProductConfigInput) {
  return prisma.business.update({
    where: { id: businessId },
    data: {
      productFields: input.productFields,
      trackSerials: input.trackSerials,
      trackWarranty: input.trackWarranty,
      trackExpiry: input.trackExpiry,
      enableRepairs: input.enableRepairs,
      requireShift: input.requireShift,
      weightBarcodes: input.weightBarcodes,
      checkPrescription: input.checkPrescription,
    },
  });
}

// ---------- Locations (филиалдар) ----------

export async function listLocations(businessId: string) {
  // Make sure even a brand-new business has its default location listed.
  await getDefaultLocation(prisma, businessId);
  const locations = await prisma.location.findMany({
    where: { businessId },
    include: { _count: { select: { employees: true } } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  const stock = await prisma.productStock.groupBy({
    by: ["locationId"],
    where: { locationId: { in: locations.map((l) => l.id) } },
    _sum: { quantity: true },
  });
  const stockByLocation = new Map(stock.map((s) => [s.locationId, Number(s._sum.quantity ?? 0)]));
  return locations.map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    isDefault: l.isDefault,
    archived: l.archived,
    employeeCount: l._count.employees,
    stockQuantity: stockByLocation.get(l.id) ?? 0,
  }));
}

export function createLocation(businessId: string, input: LocationInput) {
  return prisma.location.create({ data: { businessId, name: input.name, address: input.address || null } });
}

export async function updateLocation(businessId: string, id: string, input: LocationInput & { archived?: boolean }) {
  const location = await prisma.location.findFirst({ where: { id, businessId } });
  if (!location) throw ApiError.notFound("Филиал табылган жок.");
  if (input.archived && location.isDefault) throw ApiError.badRequest("Негизги филиалды архивге жылдырууга болбойт.");
  if (input.archived) {
    const stock = await prisma.productStock.aggregate({ where: { locationId: id, quantity: { not: 0 } }, _count: true });
    if (stock._count > 0) throw ApiError.badRequest("Филиалда товар калды. Адегенде аны башка филиалга которуңуз.");
  }
  return prisma.location.update({
    where: { id },
    data: { name: input.name, address: input.address || null, archived: input.archived ?? location.archived },
  });
}

/**
 * Switches the business to a preset and seeds it — additively: existing
 * categories and fields are kept (same-named categories / same-key fields
 * are skipped), so re-applying or switching type never destroys anything
 * the owner already set up. Serial/warranty tracking only ever gets turned
 * *on* here; turning it off is an explicit choice in the fields editor.
 */
export async function applyTemplate(db: Db, businessId: string, input: ApplyTemplateInput, lang: Lang) {
  const template = findTemplate(input.businessType);
  if (!template) throw ApiError.badRequest("Бизнес түрү туура эмес.");
  const localized = localizeTemplate(template, lang);

  const business = await db.business.findUnique({ where: { id: businessId } });
  if (!business) throw ApiError.notFound("Бизнес табылган жок.");

  if (input.addCategories && localized.categories.length > 0) {
    await db.category.createMany({
      data: localized.categories.map((name) => ({ businessId, name })),
      skipDuplicates: true,
    });
  }

  const currentFields = parseProductFields(business.productFields);
  const existingKeys = new Set(currentFields.map((f) => f.key));
  const productFields = input.addFields
    ? [...currentFields, ...localized.fields.filter((f) => !existingKeys.has(f.key))]
    : currentFields;

  // Modules only ever get switched *on* by a template.
  const modules = Object.fromEntries(MODULE_KEYS.map((key) => [key, business[key] || !!template[key]]));

  return db.business.update({
    where: { id: businessId },
    data: {
      businessType: template.id,
      productFields,
      ...modules,
    },
  });
}
