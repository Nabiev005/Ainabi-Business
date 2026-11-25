import { after } from "node:test";
import { prisma } from "../../src/config/prisma";
import { Role } from "../../src/config/permissions";
import * as productService from "../../src/services/product.service";
import * as saleService from "../../src/services/sale.service";
import { productSchema } from "../../src/validators/product.validator";
import { createSaleSchema } from "../../src/validators/sale.validator";

// Belt and braces: these tests write freely, so they refuse any other database.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://none/none");
if (url.hostname !== "127.0.0.1" || url.pathname !== "/ainabi_test") {
  throw new Error("Database tests only run through `npm run test:db`.");
}
after(() => prisma.$disconnect());

let counter = 0;
const unique = () => `${process.pid}-${++counter}`;

export interface Shop {
  businessId: string;
  ownerId: string;
}

/** A new business with its owner — every test gets its own, so nothing is shared. */
export async function newShop(data: Record<string, unknown> = {}): Promise<Shop> {
  const user = await prisma.user.create({ data: { name: "Ээси", email: `${unique()}@test.kg` } });
  const business = await prisma.business.create({ data: { name: `Дүкөн ${unique()}`, ownerId: user.id, ...data } });
  const owner = await prisma.employee.create({ data: { userId: user.id, businessId: business.id, role: "OWNER" } });
  return { businessId: business.id, ownerId: owner.id };
}

export async function newEmployee(shop: Shop, role: "ADMIN" | "ACCOUNTANT" | "CASHIER" | "REGISTRAR") {
  const user = await prisma.user.create({ data: { name: role, email: `${unique()}@test.kg` } });
  return (await prisma.employee.create({ data: { userId: user.id, businessId: shop.businessId, role } })).id;
}

export async function newProduct(shop: Shop, input: Record<string, unknown> = {}) {
  const body = productSchema.parse({ name: `Товар ${unique()}`, purchasePrice: 60, salePrice: 100, quantity: 10, ...input });
  return productService.createProduct(shop.businessId, body, shop.ownerId);
}

export function newCustomer(shop: Shop, data: Record<string, unknown> = {}) {
  return prisma.customer.create({ data: { businessId: shop.businessId, name: "Кардар", phone: "+996700000000", ...data } });
}

export function sell(
  shop: Shop,
  items: Record<string, unknown>[],
  input: Record<string, unknown> = {},
  seller: { id?: string; role?: Role } = {},
) {
  const body = createSaleSchema.parse({ items, paymentMethod: "CASH", ...input });
  return saleService.createSale(shop.businessId, seller.id ?? shop.ownerId, seller.role ?? "OWNER", body);
}

/** All three views of a product's stock — they must always agree. */
export async function stockOf(productId: string) {
  const [product, rows, batches] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { id: productId } }),
    prisma.productStock.findMany({ where: { productId } }),
    prisma.productBatch.findMany({ where: { productId }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    total: Number(product.quantity),
    byLocation: rows.reduce((s, r) => s + Number(r.quantity), 0),
    batches: batches.map((b) => Number(b.quantity)),
  };
}

export { prisma };
