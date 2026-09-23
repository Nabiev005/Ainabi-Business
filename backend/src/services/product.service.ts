import { Prisma, ProductUnit } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { toNumber } from "../utils/money";
import { generateBarcodeFromSku } from "../utils/barcode";
import { changeStock, Db, resolveLocationId } from "../utils/stockLedger";
import {
  ImportInput,
  productSchema,
  ProductInput,
  ProductQuery,
  VariantGroupInput,
} from "../validators/product.validator";
import { parseProductFields, ProductFieldDef } from "../validators/settings.validator";

type AttributeValue = string | number | boolean;

// ---------------------------------------------------------------------------
// Attribute validation
// ---------------------------------------------------------------------------

/**
 * Checks submitted attribute values against the business's field
 * definitions: unknown keys are dropped, values are coerced to the field's
 * type, select values must be one of the options, required fields must be
 * filled. Also returns a flat text copy used by the product search.
 */
function validateAttributes(fields: ProductFieldDef[], raw: Record<string, unknown>) {
  const attributes: Record<string, AttributeValue> = {};

  for (const field of fields) {
    const value = raw[field.key];
    const isEmpty = value === undefined || value === null || (typeof value === "string" && value.trim() === "");

    if (isEmpty) {
      if (field.required && field.type !== "boolean") {
        throw ApiError.badRequest(`"${field.label}" талаасын толтуруңуз.`);
      }
      continue;
    }

    switch (field.type) {
      case "number": {
        const n = Number(value);
        if (!Number.isFinite(n)) throw ApiError.badRequest(`"${field.label}" талаасына сан жазыңыз.`);
        attributes[field.key] = n;
        break;
      }
      case "boolean":
        attributes[field.key] = value === true || value === "true";
        break;
      case "date": {
        const text = String(value).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw ApiError.badRequest(`"${field.label}" талаасындагы дата туура эмес.`);
        attributes[field.key] = text;
        break;
      }
      case "select": {
        const text = String(value).trim();
        if (!field.options?.includes(text)) throw ApiError.badRequest(`"${field.label}" талаасынын мааниси тизмеде жок.`);
        attributes[field.key] = text;
        break;
      }
      default:
        attributes[field.key] = String(value).trim().slice(0, 200);
    }
  }

  const attributesText =
    Object.values(attributes)
      .filter((v) => typeof v !== "boolean")
      .join(" ") || null;

  return { attributes, attributesText };
}

async function loadBusinessConfig(db: Db, businessId: string) {
  const business = await db.business.findUnique({ where: { id: businessId } });
  if (!business) throw ApiError.notFound("Бизнес табылган жок.");
  return { business, fields: parseProductFields(business.productFields) };
}

type BusinessConfig = Awaited<ReturnType<typeof loadBusinessConfig>>;

/** Everything product-level that depends on which modules the business has on. */
function moduleFields(config: BusinessConfig, input: Pick<ProductInput, "requiresSerial" | "warrantyMonths" | "prescriptionRequired" | "scaleCode">) {
  const { business } = config;
  return {
    // Flags only mean something while the business tracks them.
    requiresSerial: business.trackSerials && input.requiresSerial,
    warrantyMonths: business.trackWarranty ? input.warrantyMonths || null : null,
    prescriptionRequired: business.checkPrescription && input.prescriptionRequired,
    scaleCode: business.weightBarcodes ? input.scaleCode || null : null,
  };
}

async function assertCategory(db: Db, businessId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const category = await db.category.findFirst({ where: { id: categoryId, businessId } });
  if (!category) throw ApiError.badRequest("Категория табылган жок.");
}

/** A barcode must be unique across products *and* package barcodes. */
async function assertBarcodeFree(db: Db, businessId: string, barcode: string, exceptProductId?: string) {
  const [product, pkg] = await Promise.all([
    db.product.findFirst({ where: { businessId, barcode, ...(exceptProductId ? { id: { not: exceptProductId } } : {}) } }),
    db.productPackage.findFirst({
      where: { businessId, barcode, ...(exceptProductId ? { productId: { not: exceptProductId } } : {}) },
    }),
  ]);
  if (product || pkg) throw ApiError.conflict("Бул штрих-код менен товар мурунтан бар.");
}

async function assertScaleCodeFree(db: Db, businessId: string, scaleCode: string | null, exceptProductId?: string) {
  if (!scaleCode) return;
  const existing = await db.product.findFirst({
    where: { businessId, scaleCode, status: "ACTIVE", ...(exceptProductId ? { id: { not: exceptProductId } } : {}) },
  });
  if (existing) throw ApiError.conflict(`Тараза коду "${scaleCode}" башка товарда колдонулат.`);
}

/** Assigns the next "SKU-0007"-style number for a business when the owner
 * leaves the SKU field blank — counting includes archived products so a
 * deleted item's number is never reused. */
async function generateSku(db: Db, businessId: string): Promise<string> {
  const count = await db.product.count({ where: { businessId } });
  for (let attempt = count + 1; attempt < count + 21; attempt++) {
    const candidate = `SKU-${String(attempt).padStart(4, "0")}`;
    const exists = await db.product.findFirst({ where: { businessId, sku: candidate } });
    if (!exists) return candidate;
  }
  return `SKU-${Date.now()}`;
}

/** Same idea for the barcode, only reached when both SKU and barcode were
 * left blank (the frontend already derives+sends a barcode itself whenever
 * the owner typed an SKU by hand — see frontend/src/utils/barcode.ts). */
async function ensureUniqueBarcode(db: Db, businessId: string, sku: string): Promise<string> {
  for (let salt = 0; salt < 20; salt++) {
    const candidate = generateBarcodeFromSku(sku, salt ? String(salt) : "");
    const exists = await db.product.findFirst({ where: { businessId, barcode: candidate } });
    if (!exists) return candidate;
  }
  return generateBarcodeFromSku(sku, String(Date.now()));
}

async function replacePackages(db: Db, businessId: string, productId: string, packages: NonNullable<ProductInput["packages"]>) {
  const seen = new Set<string>();
  for (const pkg of packages) {
    if (!pkg.barcode) continue;
    if (seen.has(pkg.barcode)) throw ApiError.conflict("Бул штрих-код менен товар мурунтан бар.");
    seen.add(pkg.barcode);
    await assertBarcodeFree(db, businessId, pkg.barcode, productId);
  }
  await db.productPackage.deleteMany({ where: { productId } });
  if (packages.length > 0) {
    await db.productPackage.createMany({
      data: packages.map((p) => ({
        businessId,
        productId,
        name: p.name,
        factor: p.factor,
        barcode: p.barcode || null,
        salePrice: p.salePrice ?? null,
      })),
    });
  }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function productInclude(locationId?: string) {
  return {
    category: true,
    variantGroup: { select: { id: true, name: true } },
    packages: { orderBy: { factor: "asc" as const } },
    ...(locationId ? { stocks: { where: { locationId } } } : {}),
  } satisfies Prisma.ProductInclude;
}

type ProductWithRelations = Prisma.ProductGetPayload<{ include: ReturnType<typeof productInclude> }> & {
  stocks?: { quantity: Prisma.Decimal }[];
};

export function serializeProduct(product: ProductWithRelations) {
  const purchasePrice = toNumber(product.purchasePrice);
  const salePrice = toNumber(product.salePrice);
  const quantity = toNumber(product.quantity);
  const minQuantity = toNumber(product.minQuantity);
  // Only present when a location was asked for.
  const locationQuantity = product.stocks ? toNumber(product.stocks[0]?.quantity) : undefined;

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    purchasePrice,
    salePrice,
    wholesalePrice: product.wholesalePrice === null ? null : toNumber(product.wholesalePrice),
    profit: Math.round((salePrice - purchasePrice) * 100) / 100,
    marginPercent: purchasePrice > 0 ? Math.round(((salePrice - purchasePrice) / purchasePrice) * 1000) / 10 : 0,
    attributes: (product.attributes ?? {}) as Record<string, AttributeValue>,
    requiresSerial: product.requiresSerial,
    warrantyMonths: product.warrantyMonths,
    prescriptionRequired: product.prescriptionRequired,
    scaleCode: product.scaleCode,
    variantGroupId: product.variantGroupId,
    variantGroupName: product.variantGroup?.name ?? null,
    variantLabel: product.variantLabel,
    packages: product.packages.map((p) => ({
      id: p.id,
      name: p.name,
      factor: toNumber(p.factor),
      barcode: p.barcode,
      salePrice: p.salePrice === null ? null : toNumber(p.salePrice),
    })),
    quantity,
    ...(locationQuantity !== undefined ? { locationQuantity } : {}),
    minQuantity,
    unit: product.unit,
    imageUrl: product.imageUrl,
    description: product.description,
    status: product.status,
    stockStatus: quantity <= 0 ? "OUT" : quantity <= minQuantity ? "LOW" : "OK",
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listProducts(businessId: string, query: ProductQuery) {
  const where: Prisma.ProductWhereInput = {
    businessId,
    status: query.status ?? undefined,
    categoryId: query.categoryId || undefined,
    variantGroupId: query.variantGroupId || undefined,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { sku: { contains: query.search, mode: "insensitive" } },
            { barcode: { contains: query.search, mode: "insensitive" } },
            { attributesText: { contains: query.search, mode: "insensitive" } },
            { packages: { some: { barcode: query.search } } },
          ],
        }
      : {}),
  };

  if (query.stock === "out") {
    where.quantity = { lte: 0 };
  }

  const include = productInclude(query.locationId);

  // "low" compares two columns (quantity <= minQuantity), which Prisma's
  // filter API can't express directly, so it's applied in-memory below.
  if (query.stock === "low") {
    const all = await prisma.product.findMany({ where, include, orderBy: { createdAt: "desc" } });
    const filtered = all.map(serializeProduct).filter((p) => p.stockStatus === "LOW");
    const total = filtered.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      items: filtered.slice(start, start + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: rows.map(serializeProduct),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getProduct(businessId: string, id: string, locationId?: string) {
  const product = await prisma.product.findFirst({ where: { id, businessId }, include: productInclude(locationId) });
  if (!product) throw ApiError.notFound("Товар табылган жок.");
  return serializeProduct(product);
}

/**
 * Resolves anything a scanner can produce into a product:
 *   1. the product's own barcode
 *   2. a package barcode ("мешок", "блок") → that package is pre-selected
 *   3. a scale label (EAN-13 starting with "2": 2 + prefix digit + 5-digit
 *      PLU + 5-digit weight in grams + check digit) → the weighed quantity
 */
export async function findByBarcode(businessId: string, code: string, locationId?: string) {
  const include = productInclude(locationId);
  const product = await prisma.product.findFirst({ where: { businessId, barcode: code, status: "ACTIVE" }, include });
  if (product) return { ...serializeProduct(product), scan: null };

  const pkg = await prisma.productPackage.findFirst({
    where: { businessId, barcode: code, product: { status: "ACTIVE" } },
    include: { product: { include } },
  });
  if (pkg) {
    return {
      ...serializeProduct(pkg.product),
      scan: { packageId: pkg.id, packageName: pkg.name, factor: toNumber(pkg.factor), quantity: null as number | null },
    };
  }

  if (/^2\d{12}$/.test(code)) {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { weightBarcodes: true } });
    if (business?.weightBarcodes) {
      const plu = code.slice(2, 7);
      const grams = parseInt(code.slice(7, 12), 10);
      const weighed = await prisma.product.findFirst({ where: { businessId, scaleCode: plu, status: "ACTIVE" }, include });
      if (weighed && grams > 0) {
        const quantity = weighed.unit === "GRAM" ? grams : Math.round(grams) / 1000;
        return { ...serializeProduct(weighed), scan: { packageId: null, packageName: null, factor: 1, quantity } };
      }
    }
  }

  throw ApiError.notFound("Товар табылган жок.");
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

/** Puts initial stock in place (movement + location stock + batch). */
async function addInitialStock(
  db: Db,
  config: BusinessConfig,
  product: { id: string; businessId: string },
  input: { quantity: number; purchasePrice: number; locationId?: string | null; initialExpiryDate?: string | null; initialBatchNumber?: string | null },
  employeeId?: string,
) {
  if (input.quantity <= 0) return;
  const locationId = await resolveLocationId(db, product.businessId, { locationId: input.locationId, employeeId });
  await changeStock(db, { businessId: product.businessId, productId: product.id, locationId, delta: input.quantity });
  await db.stockMovement.create({
    data: {
      businessId: product.businessId,
      productId: product.id,
      type: "IN",
      quantity: input.quantity,
      purchasePrice: input.purchasePrice,
      employeeId: employeeId ?? null,
      locationId,
      comment: "Баштапкы калдык",
    },
  });
  if (config.business.trackExpiry && (input.initialExpiryDate || input.initialBatchNumber)) {
    await db.productBatch.create({
      data: {
        businessId: product.businessId,
        productId: product.id,
        batchNumber: input.initialBatchNumber || null,
        expiryDate: input.initialExpiryDate ? new Date(input.initialExpiryDate) : null,
        initialQuantity: input.quantity,
        quantity: input.quantity,
      },
    });
  }
}

export async function createProduct(businessId: string, input: ProductInput, employeeId?: string) {
  return prisma.$transaction(async (tx) => {
    const config = await loadBusinessConfig(tx, businessId);
    await assertCategory(tx, businessId, input.categoryId);
    const { attributes, attributesText } = validateAttributes(config.fields, input.attributes);
    const modules = moduleFields(config, input);
    await assertScaleCodeFree(tx, businessId, modules.scaleCode);

    if (input.barcode) await assertBarcodeFree(tx, businessId, input.barcode);
    const sku = input.sku || (await generateSku(tx, businessId));
    const barcode = input.barcode || (await ensureUniqueBarcode(tx, businessId, sku));

    const product = await tx.product.create({
      data: {
        businessId,
        name: input.name,
        categoryId: input.categoryId || null,
        sku,
        barcode,
        purchasePrice: input.purchasePrice,
        salePrice: input.salePrice,
        wholesalePrice: input.wholesalePrice ?? null,
        quantity: 0,
        minQuantity: input.minQuantity,
        unit: input.unit,
        imageUrl: input.imageUrl || null,
        description: input.description || null,
        attributes,
        attributesText,
        ...modules,
      },
    });

    if (input.packages?.length) await replacePackages(tx, businessId, product.id, input.packages);
    await addInitialStock(tx, config, product, input, employeeId);

    const created = await tx.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude() });
    return serializeProduct(created);
  });
}

export async function updateProduct(businessId: string, id: string, input: ProductInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findFirst({ where: { id, businessId } });
    if (!existing) throw ApiError.notFound("Товар табылган жок.");
    const config = await loadBusinessConfig(tx, businessId);
    await assertCategory(tx, businessId, input.categoryId);
    const { attributes, attributesText } = validateAttributes(config.fields, input.attributes);
    const modules = moduleFields(config, input);
    await assertScaleCodeFree(tx, businessId, modules.scaleCode, id);

    if (input.barcode && input.barcode !== existing.barcode) {
      await assertBarcodeFree(tx, businessId, input.barcode, id);
    }

    await tx.product.update({
      where: { id },
      data: {
        name: input.name,
        categoryId: input.categoryId || null,
        sku: input.sku || null,
        barcode: input.barcode || null,
        purchasePrice: input.purchasePrice,
        salePrice: input.salePrice,
        wholesalePrice: input.wholesalePrice ?? null,
        minQuantity: input.minQuantity,
        unit: input.unit,
        imageUrl: input.imageUrl || null,
        description: input.description || null,
        attributes,
        attributesText,
        ...modules,
      },
    });
    if (input.packages) await replacePackages(tx, businessId, id, input.packages);

    const updated = await tx.product.findUniqueOrThrow({ where: { id }, include: productInclude() });
    return serializeProduct(updated);
  });
}

export async function deleteProduct(businessId: string, id: string) {
  const existing = await prisma.product.findFirst({ where: { id, businessId } });
  if (!existing) throw ApiError.notFound("Товар табылган жок.");
  await prisma.product.update({ where: { id }, data: { status: "ARCHIVED" } });
}

// ---------------------------------------------------------------------------
// Variants (size × colour ...)
// ---------------------------------------------------------------------------

/**
 * Creates one Product per variant, all linked to a ProductVariantGroup, so
 * each size/colour has its own stock, barcode and price while the POS can
 * still show them as one card. Adding to an existing group skips variant
 * combinations that already exist.
 */
export async function createVariantGroup(businessId: string, input: VariantGroupInput, employeeId?: string) {
  return prisma.$transaction(
    async (tx) => {
      const config = await loadBusinessConfig(tx, businessId);
      await assertCategory(tx, businessId, input.categoryId);
      const { attributes, attributesText } = validateAttributes(config.fields, input.attributes);
      const modules = moduleFields(config, { ...input, prescriptionRequired: false, scaleCode: null });

      let group;
      if (input.groupId) {
        group = await tx.productVariantGroup.findFirst({ where: { id: input.groupId, businessId } });
        if (!group) throw ApiError.notFound("Товар табылган жок.");
        await tx.productVariantGroup.update({ where: { id: group.id }, data: { dimensions: input.dimensions } });
      } else {
        group = await tx.productVariantGroup.create({ data: { businessId, name: input.name, dimensions: input.dimensions } });
      }

      const existingLabels = new Set(
        (await tx.product.findMany({ where: { variantGroupId: group.id }, select: { variantLabel: true } })).map((p) => p.variantLabel),
      );

      const createdIds: string[] = [];
      for (const variant of input.variants) {
        const label = input.dimensions.map((d) => variant.options[d.name]).filter(Boolean).join(" / ");
        if (!label || existingLabels.has(label)) continue;
        existingLabels.add(label);

        if (variant.barcode) await assertBarcodeFree(tx, businessId, variant.barcode);
        const sku = variant.sku || (await generateSku(tx, businessId));
        const barcode = variant.barcode || (await ensureUniqueBarcode(tx, businessId, sku));
        const purchasePrice = variant.purchasePrice ?? input.purchasePrice;

        const product = await tx.product.create({
          data: {
            businessId,
            name: `${group.name} (${label})`,
            categoryId: input.categoryId || null,
            sku,
            barcode,
            purchasePrice,
            salePrice: variant.salePrice ?? input.salePrice,
            wholesalePrice: input.wholesalePrice ?? null,
            quantity: 0,
            minQuantity: input.minQuantity,
            unit: input.unit,
            imageUrl: input.imageUrl || null,
            description: input.description || null,
            attributes,
            attributesText: [attributesText, label].filter(Boolean).join(" "),
            variantGroupId: group.id,
            variantLabel: label,
            ...modules,
          },
        });
        await addInitialStock(tx, config, product, { quantity: variant.quantity, purchasePrice, locationId: input.locationId }, employeeId);
        createdIds.push(product.id);
      }

      const products = await tx.product.findMany({ where: { id: { in: createdIds } }, include: productInclude() });
      return { groupId: group.id, name: group.name, created: products.map(serializeProduct) };
    },
    { timeout: 30000 },
  );
}

export async function getVariantGroup(businessId: string, groupId: string) {
  const group = await prisma.productVariantGroup.findFirst({
    where: { id: groupId, businessId },
    include: { products: { where: { status: "ACTIVE" }, include: productInclude(), orderBy: { createdAt: "asc" } } },
  });
  if (!group) throw ApiError.notFound("Товар табылган жок.");
  return {
    id: group.id,
    name: group.name,
    dimensions: group.dimensions as { name: string; values: string[] }[],
    variants: group.products.map(serializeProduct),
  };
}

// ---------------------------------------------------------------------------
// Analogs, serials, batches
// ---------------------------------------------------------------------------

export async function getAnalogs(businessId: string, productId: string, locationId?: string) {
  const links = await prisma.productAnalog.findMany({
    where: { businessId, productId },
    include: { analog: { include: productInclude(locationId) } },
  });
  return links.filter((l) => l.analog.status === "ACTIVE").map((l) => serializeProduct(l.analog));
}

export async function setAnalogs(businessId: string, productId: string, analogIds: string[]) {
  const ids = [...new Set(analogIds.filter((id) => id !== productId))];
  const product = await prisma.product.findFirst({ where: { id: productId, businessId } });
  if (!product) throw ApiError.notFound("Товар табылган жок.");
  const valid = await prisma.product.findMany({ where: { id: { in: ids }, businessId }, select: { id: true } });
  if (valid.length !== ids.length) throw ApiError.badRequest("Тандалган товарлардын айрымдары табылган жок.");

  await prisma.$transaction([
    prisma.productAnalog.deleteMany({ where: { businessId, OR: [{ productId }, { analogId: productId }] } }),
    prisma.productAnalog.createMany({
      data: ids.flatMap((analogId) => [
        { businessId, productId, analogId },
        { businessId, productId: analogId, analogId: productId },
      ]),
      skipDuplicates: true,
    }),
  ]);
  return getAnalogs(businessId, productId);
}

export async function listSerials(businessId: string, productId: string, status?: "IN_STOCK" | "SOLD") {
  const serials = await prisma.productSerial.findMany({
    where: { businessId, productId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return serials.map((s) => ({ id: s.id, serial: s.serial, status: s.status, createdAt: s.createdAt, soldAt: s.soldAt }));
}

export async function listBatches(businessId: string, productId: string) {
  const batches = await prisma.productBatch.findMany({
    where: { businessId, productId },
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  return batches.map((b) => ({
    id: b.id,
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate,
    initialQuantity: toNumber(b.initialQuantity),
    quantity: toNumber(b.quantity),
    createdAt: b.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Import (Excel / CSV rows already parsed by the frontend)
// ---------------------------------------------------------------------------

const UNIT_ALIASES: Record<string, ProductUnit> = {
  piece: "PIECE", pcs: "PIECE", даана: "PIECE", шт: "PIECE", штука: "PIECE", "шт.": "PIECE",
  kg: "KG", кг: "KG", килограмм: "KG",
  gram: "GRAM", g: "GRAM", г: "GRAM", грамм: "GRAM",
  liter: "LITER", l: "LITER", л: "LITER", литр: "LITER",
  meter: "METER", m: "METER", м: "METER", метр: "METER",
  pack: "PACK", пачка: "PACK", таңгак: "PACK", упаковка: "PACK",
  box: "BOX", кутуча: "BOX", коробка: "BOX", ящик: "BOX",
};

function parseUnit(value: unknown): ProductUnit {
  if (!value) return "PIECE";
  const text = String(value).trim();
  if (productSchema.shape.unit.safeParse(text.toUpperCase()).success) return text.toUpperCase() as ProductUnit;
  return UNIT_ALIASES[text.toLowerCase()] ?? "PIECE";
}

/** Accepts "1 200,50" / "1200.5" / 1200.5. */
function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return value;
  const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const t = String(value).trim();
  return t || undefined;
}

/**
 * Rows are imported one by one (not one big transaction) so a bad row is
 * reported back instead of sinking the whole file. Existing products are
 * matched by barcode, then SKU; their stock is never changed by an import
 * (stock only moves through documents — receipts, sales, counts).
 */
export async function importProducts(businessId: string, input: ImportInput, employeeId?: string) {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] as { row: number; message: string }[] };
  const categoryCache = new Map<string, string>();

  async function categoryIdFor(name: string | undefined) {
    if (!name) return null;
    const key = name.toLowerCase();
    if (categoryCache.has(key)) return categoryCache.get(key)!;
    const category =
      (await prisma.category.findFirst({ where: { businessId, name: { equals: name, mode: "insensitive" } } })) ??
      (await prisma.category.create({ data: { businessId, name } }));
    categoryCache.set(key, category.id);
    return category.id;
  }

  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i];
    try {
      const name = text(row.name);
      if (!name) throw ApiError.badRequest("Товар атын жазыңыз");
      const purchasePrice = parseNumber(row.purchasePrice);
      const salePrice = parseNumber(row.salePrice);
      const wholesalePrice = parseNumber(row.wholesalePrice);
      const quantity = parseNumber(row.quantity);
      const minQuantity = parseNumber(row.minQuantity);
      for (const n of [purchasePrice, salePrice, wholesalePrice, quantity, minQuantity]) {
        if (Number.isNaN(n) || (n !== undefined && n < 0)) throw ApiError.badRequest("Сан туура эмес жазылган.");
      }

      const barcode = text(row.barcode);
      const sku = text(row.sku);
      const existing =
        (barcode && (await prisma.product.findFirst({ where: { businessId, barcode } }))) ||
        (sku && (await prisma.product.findFirst({ where: { businessId, sku } }))) ||
        null;

      const attributes = (row.attributes && typeof row.attributes === "object" ? row.attributes : {}) as Record<string, string | number | boolean | null>;
      const categoryId = await categoryIdFor(text(row.category));

      if (existing) {
        if (!input.updateExisting) {
          result.skipped++;
          continue;
        }
        const current = await getProduct(businessId, existing.id);
        await updateProduct(businessId, existing.id, {
          ...current,
          name,
          sku: sku ?? current.sku,
          barcode: barcode ?? current.barcode,
          categoryId: categoryId ?? current.categoryId,
          purchasePrice: purchasePrice ?? current.purchasePrice,
          salePrice: salePrice ?? current.salePrice,
          wholesalePrice: wholesalePrice ?? current.wholesalePrice,
          minQuantity: minQuantity ?? current.minQuantity,
          unit: row.unit ? parseUnit(row.unit) : current.unit,
          attributes: { ...current.attributes, ...attributes },
          packages: undefined,
          initialExpiryDate: null,
          initialBatchNumber: null,
          locationId: null,
        });
        result.updated++;
      } else {
        if (purchasePrice === undefined || salePrice === undefined) throw ApiError.badRequest("Сатып алуу жана сатуу баасын жазыңыз.");
        await createProduct(
          businessId,
          productSchema.parse({
            name,
            sku,
            barcode,
            categoryId,
            purchasePrice,
            salePrice,
            wholesalePrice,
            quantity: quantity ?? 0,
            minQuantity: minQuantity ?? 0,
            unit: parseUnit(row.unit),
            attributes,
            locationId: input.locationId,
          }),
          employeeId,
        );
        result.created++;
      }
    } catch (error) {
      result.errors.push({ row: i + 1, message: error instanceof Error ? error.message : String(error) });
    }
  }

  return result;
}

