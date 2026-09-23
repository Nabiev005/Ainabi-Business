import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "./ApiError";
import { round2, toNumber } from "./money";

/**
 * The one place stock quantities change. Every movement (sale, receipt,
 * return, write-off, inventory, transfer) goes through here so the three
 * views of stock never drift apart:
 *   - ProductStock.quantity   per location
 *   - Product.quantity        business-wide total (what most screens show)
 *   - ProductBatch.quantity   per expiry batch (only for trackExpiry shops)
 */

export type Db = Prisma.TransactionClient | typeof prisma;

const DEFAULT_LOCATION_NAME = "Негизги дүкөн";

/** The business's default location, created on first use (older businesses
 * got one from the migration; new ones get it lazily here). */
export async function getDefaultLocation(db: Db, businessId: string) {
  const existing = await db.location.findFirst({
    where: { businessId, isDefault: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return db.location.create({ data: { businessId, name: DEFAULT_LOCATION_NAME, isDefault: true } });
}

/**
 * Picks the location an operation happens at: the explicit one (validated
 * to belong to this business), else the employee's own branch, else the
 * business default.
 */
export async function resolveLocationId(
  db: Db,
  businessId: string,
  options: { locationId?: string | null; employeeId?: string } = {},
): Promise<string> {
  if (options.locationId) {
    const location = await db.location.findFirst({ where: { id: options.locationId, businessId, archived: false } });
    if (!location) throw ApiError.badRequest("Филиал табылган жок.");
    return location.id;
  }
  if (options.employeeId) {
    const employee = await db.employee.findUnique({ where: { id: options.employeeId }, select: { locationId: true } });
    if (employee?.locationId) {
      const location = await db.location.findFirst({ where: { id: employee.locationId, businessId, archived: false } });
      if (location) return location.id;
    }
  }
  return (await getDefaultLocation(db, businessId)).id;
}

interface ChangeStockInput {
  businessId: string;
  productId: string;
  locationId: string;
  /** Positive = stock comes in, negative = goes out. */
  delta: number;
  /** Refuse to go below zero at this location (sales, write-offs). */
  requireAvailable?: boolean;
  /** Transfers move stock between locations without changing the total. */
  updateTotal?: boolean;
}

/**
 * Products created before locations existed (or straight through Prisma,
 * like the seed script) may have a total but no per-location rows yet —
 * park that whole total at the default location the first time it's touched.
 */
export async function ensureStockRows(db: Db, businessId: string, productId: string) {
  const any = await db.productStock.findFirst({ where: { productId }, select: { id: true } });
  if (any) return;
  const product = await db.product.findUnique({ where: { id: productId }, select: { quantity: true } });
  const location = await getDefaultLocation(db, businessId);
  await db.productStock.create({ data: { productId, locationId: location.id, quantity: product?.quantity ?? 0 } });
}

export async function changeStock(db: Db, input: ChangeStockInput) {
  const { businessId, productId, locationId, delta, requireAvailable = false, updateTotal = true } = input;
  if (delta === 0) return;
  await ensureStockRows(db, businessId, productId);

  if (delta < 0 && requireAvailable) {
    // Conditional decrement: concurrent sales of the last unit can't both
    // pass — the loser gets count 0 and its transaction rolls back.
    const { count } = await db.productStock.updateMany({
      where: { productId, locationId, quantity: { gte: -delta } },
      data: { quantity: { increment: delta } },
    });
    if (count === 0) {
      const [product, stock] = await Promise.all([
        db.product.findUnique({ where: { id: productId }, select: { name: true } }),
        db.productStock.findUnique({ where: { productId_locationId: { productId, locationId } } }),
      ]);
      throw ApiError.badRequest(`"${product?.name ?? ""}" складда жетишсиз (калдык: ${toNumber(stock?.quantity)}).`);
    }
  } else {
    await db.productStock.upsert({
      where: { productId_locationId: { productId, locationId } },
      create: { productId, locationId, quantity: delta },
      update: { quantity: { increment: delta } },
    });
  }

  if (updateTotal) {
    await db.product.update({ where: { id: productId }, data: { quantity: { increment: delta } } });
  }
}

/**
 * Takes `quantity` out of the product's batches, earliest expiry first
 * (then oldest). Stock that predates batch tracking simply has no batch,
 * so running out of batches is fine — it's not an error.
 */
export async function consumeBatches(db: Db, productId: string, quantity: number) {
  let remaining = quantity;
  if (remaining <= 0) return;

  const batches = await db.productBatch.findMany({
    where: { productId, quantity: { gt: 0 } },
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  for (const batch of batches) {
    if (remaining <= 0) break;
    const available = toNumber(batch.quantity);
    const take = Math.min(available, remaining);
    await db.productBatch.update({ where: { id: batch.id }, data: { quantity: { decrement: take } } });
    remaining = round2(remaining - take);
  }
}

/** Bumps one of the business's document counters and returns the new number. */
export async function nextNumber(
  db: Db,
  businessId: string,
  counter: "saleCounter" | "receiptCounter" | "repairCounter" | "inventoryCounter",
): Promise<number> {
  const business = await db.business.update({
    where: { id: businessId },
    data: { [counter]: { increment: 1 } },
  });
  return business[counter];
}

/** The employee's open cash shift, if any. */
export function findOpenShift(db: Db, businessId: string, employeeId: string) {
  return db.cashShift.findFirst({ where: { businessId, employeeId, status: "OPEN" } });
}
