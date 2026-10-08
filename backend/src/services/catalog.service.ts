import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { toNumber } from "../utils/money";
import type { CatalogSettingsInput } from "../validators/settings.validator";

/**
 * The public shop window: a link the owner puts in their Instagram bio.
 * Anyone can open it without signing in, so it shows only what a customer
 * may see — name, photo, category, sale price, in stock or not. Never the
 * purchase price, never other businesses, never archived or sold-out goods.
 */

const PAGE_SIZE = 24;

/** Slugs that would collide with app routes or look official. */
const RESERVED = new Set(["admin", "api", "app", "login", "register", "ainabi", "support", "help", "settings", "c", "catalog"]);

export async function getCatalogSettings(businessId: string) {
  const b = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { catalogEnabled: true, catalogSlug: true, catalogWhatsapp: true, catalogShowStock: true, catalogNote: true },
  });
  return b;
}

export async function updateCatalogSettings(businessId: string, input: CatalogSettingsInput) {
  const slug = input.slug?.trim().toLowerCase() || null;
  if (input.enabled && !slug) throw ApiError.badRequest("Каталогдун шилтемесин жазыңыз.");
  if (slug && RESERVED.has(slug)) throw ApiError.badRequest("Бул шилтеме бош эмес. Башкасын тандаңыз.");
  if (slug) {
    const taken = await prisma.business.findFirst({ where: { catalogSlug: slug, id: { not: businessId } }, select: { id: true } });
    if (taken) throw ApiError.conflict("Бул шилтеме бош эмес. Башкасын тандаңыз.");
  }
  await prisma.business.update({
    where: { id: businessId },
    data: {
      catalogEnabled: input.enabled,
      catalogSlug: slug,
      catalogWhatsapp: input.whatsapp?.trim() || null,
      catalogShowStock: input.showStock,
      catalogNote: input.note?.trim() || null,
    },
  });
  return getCatalogSettings(businessId);
}

export async function publicCatalog(slug: string, query: { search?: string; categoryId?: string; page: number }) {
  const shop = await prisma.business.findFirst({
    where: { catalogSlug: slug.toLowerCase(), catalogEnabled: true },
    select: { id: true, name: true, address: true, phone: true, catalogWhatsapp: true, catalogShowStock: true, catalogNote: true },
  });
  if (!shop) throw ApiError.notFound("Каталог табылган жок.");

  const search = query.search?.trim();
  const where: Prisma.ProductWhereInput = {
    businessId: shop.id,
    status: "ACTIVE",
    quantity: { gt: 0 },
    // A product sitting in a "not for sale" pipeline stage isn't on display either.
    OR: [{ stageId: null }, { stage: { blocksSale: false } }],
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(search ? { AND: [{ OR: [{ name: { contains: search, mode: "insensitive" } }, { attributesText: { contains: search, mode: "insensitive" } }] }] } : {}),
  };

  const [items, total, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      select: { id: true, name: true, salePrice: true, imageUrl: true, quantity: true, unit: true, description: true, category: { select: { name: true } } },
      orderBy: [{ updatedAt: "desc" }],
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
    prisma.category.findMany({
      where: { businessId: shop.id, products: { some: { status: "ACTIVE", quantity: { gt: 0 } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    shop: { name: shop.name, address: shop.address, phone: shop.phone, whatsapp: shop.catalogWhatsapp, note: shop.catalogNote },
    categories,
    items: items.map((p) => ({
      id: p.id,
      name: p.name,
      price: toNumber(p.salePrice),
      unit: p.unit,
      imageUrl: p.imageUrl,
      description: p.description,
      category: p.category?.name ?? null,
      quantity: shop.catalogShowStock ? toNumber(p.quantity) : null,
    })),
    page: query.page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
  };
}
