import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { BUSINESS_TEMPLATES, findTemplate, localizeTemplate } from "../config/businessTemplates";
import { ApiError } from "../utils/ApiError";
import type { Lang } from "../i18n/messages";
import {
  ApplyTemplateInput,
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
    },
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

  return db.business.update({
    where: { id: businessId },
    data: {
      businessType: template.id,
      productFields,
      trackSerials: business.trackSerials || template.trackSerials,
      trackWarranty: business.trackWarranty || template.trackWarranty,
    },
  });
}
