import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { round2, toNumber } from "../utils/money";
import { changeStock, consumeBatches, Db, ensureStockRows, findOpenShift, nextNumber, resolveLocationId } from "../utils/stockLedger";
import {
  CreateReceiptInput,
  CreateStockMovementInput,
  InventoryCountInput,
  ListDocumentsQuery,
  StockQuery,
  TransferInput,
} from "../validators/stock.validator";

async function locationNames(db: Db, businessId: string) {
  const locations = await db.location.findMany({ where: { businessId }, select: { id: true, name: true } });
  return new Map(locations.map((l) => [l.id, l.name]));
}

// ---------------------------------------------------------------------------
// Manual movements (приход / расход / списание)
// ---------------------------------------------------------------------------

export async function createMovement(businessId: string, employeeId: string, input: CreateStockMovementInput) {
  const product = await prisma.product.findFirst({ where: { id: input.productId, businessId } });
  if (!product) throw ApiError.notFound("Товар табылган жок.");
  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, businessId } });
    if (!supplier) throw ApiError.notFound("Жеткирүүчү табылган жок.");
  }
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const isOutgoing = input.type === "OUT" || input.type === "WRITE_OFF";

  return prisma.$transaction(async (tx) => {
    const locationId = await resolveLocationId(tx, businessId, { locationId: input.locationId, employeeId });
    await changeStock(tx, {
      businessId,
      productId: product.id,
      locationId,
      delta: isOutgoing ? -input.quantity : input.quantity,
      requireAvailable: isOutgoing,
    });
    if (isOutgoing && business.trackExpiry) await consumeBatches(tx, product.id, input.quantity);
    if (input.type === "IN" && business.trackExpiry && (input.expiryDate || input.batchNumber)) {
      await tx.productBatch.create({
        data: {
          businessId,
          productId: product.id,
          batchNumber: input.batchNumber || null,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
          initialQuantity: input.quantity,
          quantity: input.quantity,
        },
      });
    }
    if (input.type === "IN" && input.purchasePrice) {
      await tx.product.update({ where: { id: product.id }, data: { purchasePrice: input.purchasePrice } });
    }

    return tx.stockMovement.create({
      data: {
        businessId,
        productId: input.productId,
        type: input.type,
        quantity: input.quantity,
        purchasePrice: input.purchasePrice,
        supplierId: input.supplierId || null,
        employeeId,
        locationId,
        comment: input.comment || null,
      },
    });
  });
}

export async function listMovements(businessId: string, query: StockQuery) {
  const where: Prisma.StockMovementWhereInput = {
    businessId,
    type: query.type,
    productId: query.productId,
    ...(query.locationId ? { OR: [{ locationId: query.locationId }, { toLocationId: query.locationId }] } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const [rows, total, names] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: { product: true, supplier: true, employee: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.stockMovement.count({ where }),
    locationNames(prisma, businessId),
  ]);

  return {
    items: rows.map((m) => ({
      id: m.id,
      productName: m.product.name,
      type: m.type,
      quantity: toNumber(m.quantity),
      purchasePrice: m.purchasePrice ? toNumber(m.purchasePrice) : null,
      supplierName: m.supplier?.name ?? null,
      employeeName: m.employee?.user.name ?? null,
      locationName: m.locationId ? (names.get(m.locationId) ?? null) : null,
      toLocationName: m.toLocationId ? (names.get(m.toLocationId) ?? null) : null,
      comment: m.comment,
      createdAt: m.createdAt,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

// ---------------------------------------------------------------------------
// Purchase receipts (кирим накладнойу) and trade-in
// ---------------------------------------------------------------------------

/**
 * One document for a whole delivery: every line adds stock (with its batch
 * and IMEIs), updates the product's cost (and optionally shelf) price, and
 * whatever wasn't paid on the spot becomes a supplier debt. A TRADE_IN is
 * the same flow with a customer as the seller (buying back a used phone).
 */
export async function createReceipt(businessId: string, employeeId: string, input: CreateReceiptInput) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, businessId } });
    if (!supplier) throw ApiError.notFound("Жеткирүүчү табылган жок.");
  }
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, businessId } });
    if (!customer) throw ApiError.notFound("Кардар табылган жок.");
  }

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, businessId } });
  if (products.length !== productIds.length) throw ApiError.badRequest("Тандалган товарлардын айрымдары табылган жок.");
  const productMap = new Map(products.map((p) => [p.id, p]));

  const seenSerials = new Set<string>();
  const lines = input.items.map((item) => {
    const product = productMap.get(item.productId)!;
    let serials: string[] = [];
    if (product.requiresSerial) {
      serials = (item.serialNumbers ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean);
      // IMEIs at receiving are optional, but if given there must be one per unit.
      if (serials.length > 0 && (!Number.isInteger(item.quantity) || serials.length !== item.quantity)) {
        throw ApiError.badRequest(`"${product.name}" үчүн ар бир даанага IMEI/сериялык номер жазыңыз.`);
      }
      for (const serial of serials) {
        if (seenSerials.has(serial)) throw ApiError.badRequest(`"${serial}" номери кайталанып жатат.`);
        seenSerials.add(serial);
      }
    }
    return { item, product, serials, total: round2(item.quantity * item.purchasePrice) };
  });

  const total = round2(lines.reduce((s, l) => s + l.total, 0));
  const paidAmount = round2(Math.min(input.paidAmount ?? total, total));
  const unpaid = round2(total - paidAmount);
  const shift = await findOpenShift(prisma, businessId, employeeId);

  const receipt = await prisma.$transaction(
    async (tx) => {
      if (seenSerials.size > 0) {
        const known = await tx.productSerial.findMany({ where: { businessId, serial: { in: [...seenSerials] }, status: "IN_STOCK" } });
        if (known.length > 0) throw ApiError.conflict(`"${known[0].serial}" номери мурунтан складда бар.`);
      }

      const locationId = await resolveLocationId(tx, businessId, { locationId: input.locationId, employeeId });
      const number = await nextNumber(tx, businessId, "receiptCounter");
      const label = input.type === "TRADE_IN" ? `Trade-in №${number}` : `Кирим №${number}`;

      let supplierDebtId: string | null = null;
      if (input.type === "PURCHASE" && input.supplierId && unpaid > 0 && input.createSupplierDebt) {
        const debt = await tx.supplierDebt.create({
          data: {
            businessId,
            supplierId: input.supplierId,
            totalAmount: unpaid,
            paidAmount: 0,
            remainingAmount: unpaid,
            status: "OPEN",
            comment: [label, input.docNumber].filter(Boolean).join(" · "),
          },
        });
        supplierDebtId = debt.id;
      }

      const receipt = await tx.purchaseReceipt.create({
        data: {
          businessId,
          number,
          type: input.type,
          supplierId: input.type === "PURCHASE" ? input.supplierId || null : null,
          customerId: input.customerId || null,
          sellerName: input.sellerName || null,
          locationId,
          employeeId,
          shiftId: shift?.id ?? null,
          docNumber: input.docNumber || null,
          total,
          paidAmount,
          paymentMethod: paidAmount > 0 ? input.paymentMethod : null,
          supplierDebtId,
          comment: input.comment || null,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              quantity: l.item.quantity,
              purchasePrice: l.item.purchasePrice,
              total: l.total,
              batchNumber: l.item.batchNumber || null,
              expiryDate: l.item.expiryDate ? new Date(l.item.expiryDate) : null,
              serialNumbers: l.serials,
            })),
          },
        },
      });

      for (const line of lines) {
        await changeStock(tx, { businessId, productId: line.product.id, locationId, delta: line.item.quantity });
        await tx.product.update({
          where: { id: line.product.id },
          data: {
            purchasePrice: line.item.purchasePrice,
            ...(line.item.salePrice ? { salePrice: line.item.salePrice } : {}),
          },
        });
        await tx.stockMovement.create({
          data: {
            businessId,
            productId: line.product.id,
            type: "IN",
            quantity: line.item.quantity,
            purchasePrice: line.item.purchasePrice,
            supplierId: receipt.supplierId,
            employeeId,
            locationId,
            receiptId: receipt.id,
            comment: label,
          },
        });
        if (business.trackExpiry && (line.item.expiryDate || line.item.batchNumber)) {
          await tx.productBatch.create({
            data: {
              businessId,
              productId: line.product.id,
              batchNumber: line.item.batchNumber || null,
              expiryDate: line.item.expiryDate ? new Date(line.item.expiryDate) : null,
              initialQuantity: line.item.quantity,
              quantity: line.item.quantity,
              receiptId: receipt.id,
            },
          });
        }
        for (const serial of line.serials) {
          // A unit we once sold coming back (trade-in) is re-activated.
          await tx.productSerial.upsert({
            where: { businessId_serial: { businessId, serial } },
            create: { businessId, productId: line.product.id, serial, status: "IN_STOCK", receiptId: receipt.id },
            update: { productId: line.product.id, status: "IN_STOCK", receiptId: receipt.id, saleId: null, soldAt: null },
          });
        }
      }
      return receipt;
    },
    { timeout: 30000 },
  );

  return getReceipt(businessId, receipt.id);
}

export async function listReceipts(businessId: string, query: ListDocumentsQuery) {
  const where: Prisma.PurchaseReceiptWhereInput = { businessId, type: query.type };
  const [rows, total, names] = await Promise.all([
    prisma.purchaseReceipt.findMany({
      where,
      include: { supplier: true, customer: true, employee: { include: { user: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.purchaseReceipt.count({ where }),
    locationNames(prisma, businessId),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      number: r.number,
      type: r.type,
      supplierName: r.supplier?.name ?? null,
      sellerName: r.customer?.name ?? r.sellerName,
      docNumber: r.docNumber,
      locationName: names.get(r.locationId) ?? null,
      employeeName: r.employee.user.name,
      total: toNumber(r.total),
      paidAmount: toNumber(r.paidAmount),
      itemCount: r._count.items,
      createdAt: r.createdAt,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getReceipt(businessId: string, id: string) {
  const receipt = await prisma.purchaseReceipt.findFirst({
    where: { id, businessId },
    include: { supplier: true, customer: true, employee: { include: { user: true } }, items: { include: { product: true } } },
  });
  if (!receipt) throw ApiError.notFound("Кирим табылган жок.");
  const location = await prisma.location.findUnique({ where: { id: receipt.locationId } });
  return {
    id: receipt.id,
    number: receipt.number,
    type: receipt.type,
    supplier: receipt.supplier ? { id: receipt.supplier.id, name: receipt.supplier.name } : null,
    customer: receipt.customer ? { id: receipt.customer.id, name: receipt.customer.name } : null,
    sellerName: receipt.sellerName,
    docNumber: receipt.docNumber,
    locationName: location?.name ?? null,
    employeeName: receipt.employee.user.name,
    total: toNumber(receipt.total),
    paidAmount: toNumber(receipt.paidAmount),
    paymentMethod: receipt.paymentMethod,
    supplierDebtId: receipt.supplierDebtId,
    comment: receipt.comment,
    createdAt: receipt.createdAt,
    items: receipt.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      barcode: i.product.barcode,
      salePrice: toNumber(i.product.salePrice),
      unit: i.product.unit,
      quantity: toNumber(i.quantity),
      purchasePrice: toNumber(i.purchasePrice),
      total: toNumber(i.total),
      batchNumber: i.batchNumber,
      expiryDate: i.expiryDate,
      serialNumbers: i.serialNumbers,
    })),
  };
}

// ---------------------------------------------------------------------------
// Inventory counts (инвентаризация)
// ---------------------------------------------------------------------------

/**
 * Applies a physical count: each counted product's stock at the location
 * is set to what was counted, the difference is logged as a (signed)
 * ADJUSTMENT movement, and the shortage/surplus value is kept on the count
 * document. Products not in the list are left alone (partial counts are fine).
 */
export async function createInventoryCount(businessId: string, employeeId: string, input: InventoryCountInput) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  if (productIds.length !== input.items.length) throw ApiError.badRequest("Бир товар эки жолу саналды.");
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, businessId } });
  if (products.length !== productIds.length) throw ApiError.badRequest("Тандалган товарлардын айрымдары табылган жок.");
  const productMap = new Map(products.map((p) => [p.id, p]));

  const count = await prisma.$transaction(
    async (tx) => {
      const locationId = await resolveLocationId(tx, businessId, { locationId: input.locationId, employeeId });
      const number = await nextNumber(tx, businessId, "inventoryCounter");
      const created = await tx.inventoryCount.create({
        data: { businessId, number, locationId, employeeId, comment: input.comment || null, itemsCount: input.items.length },
      });

      let shortageValue = 0;
      let surplusValue = 0;
      for (const item of input.items) {
        const product = productMap.get(item.productId)!;
        // Make sure the location row exists (legacy stock), then read it.
        await ensureStockRows(tx, businessId, product.id);
        const stock = await tx.productStock.findUnique({ where: { productId_locationId: { productId: product.id, locationId } } });
        const expected = toNumber(stock?.quantity);
        const difference = Math.round((item.countedQty - expected) * 1000) / 1000;
        const costPrice = toNumber(product.purchasePrice);

        await tx.inventoryCountItem.create({
          data: { countId: created.id, productId: product.id, expectedQty: expected, countedQty: item.countedQty, difference, costPrice },
        });
        if (difference === 0) continue;

        await changeStock(tx, { businessId, productId: product.id, locationId, delta: difference });
        if (difference < 0) {
          shortageValue += -difference * costPrice;
          if (business.trackExpiry) await consumeBatches(tx, product.id, -difference);
        } else {
          surplusValue += difference * costPrice;
        }
        await tx.stockMovement.create({
          data: {
            businessId,
            productId: product.id,
            type: "ADJUSTMENT",
            quantity: difference,
            employeeId,
            locationId,
            inventoryCountId: created.id,
            comment: `Инвентаризация №${number}`,
          },
        });
      }

      return tx.inventoryCount.update({
        where: { id: created.id },
        data: { shortageValue: round2(shortageValue), surplusValue: round2(surplusValue) },
      });
    },
    { timeout: 60000 },
  );

  return getInventoryCount(businessId, count.id);
}

export async function listInventoryCounts(businessId: string, query: ListDocumentsQuery) {
  const where = { businessId };
  const [rows, total, names] = await Promise.all([
    prisma.inventoryCount.findMany({
      where,
      include: { employee: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.inventoryCount.count({ where }),
    locationNames(prisma, businessId),
  ]);
  return {
    items: rows.map((c) => ({
      id: c.id,
      number: c.number,
      locationName: names.get(c.locationId) ?? null,
      employeeName: c.employee.user.name,
      itemsCount: c.itemsCount,
      shortageValue: toNumber(c.shortageValue),
      surplusValue: toNumber(c.surplusValue),
      comment: c.comment,
      createdAt: c.createdAt,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getInventoryCount(businessId: string, id: string) {
  const count = await prisma.inventoryCount.findFirst({
    where: { id, businessId },
    include: { employee: { include: { user: true } }, items: { include: { product: true } } },
  });
  if (!count) throw ApiError.notFound("Инвентаризация табылган жок.");
  const location = await prisma.location.findUnique({ where: { id: count.locationId } });
  return {
    id: count.id,
    number: count.number,
    locationName: location?.name ?? null,
    employeeName: count.employee.user.name,
    comment: count.comment,
    shortageValue: toNumber(count.shortageValue),
    surplusValue: toNumber(count.surplusValue),
    createdAt: count.createdAt,
    items: count.items.map((i) => ({
      productId: i.productId,
      productName: i.product.name,
      unit: i.product.unit,
      expectedQty: toNumber(i.expectedQty),
      countedQty: toNumber(i.countedQty),
      difference: toNumber(i.difference),
      costPrice: toNumber(i.costPrice),
    })),
  };
}

// ---------------------------------------------------------------------------
// Transfers between locations
// ---------------------------------------------------------------------------

export async function createTransfer(businessId: string, employeeId: string, input: TransferInput) {
  const locations = await prisma.location.findMany({
    where: { businessId, id: { in: [input.fromLocationId, input.toLocationId] }, archived: false },
  });
  if (locations.length !== 2) throw ApiError.badRequest("Филиал табылган жок.");
  const names = new Map(locations.map((l) => [l.id, l.name]));

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, businessId } });
  if (products.length !== productIds.length) throw ApiError.badRequest("Тандалган товарлардын айрымдары табылган жок.");

  const transfer = await prisma.$transaction(
    async (tx) => {
      const created = await tx.stockTransfer.create({
        data: {
          businessId,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          employeeId,
          comment: input.comment || null,
          items: { create: input.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
        },
      });
      for (const item of input.items) {
        // Stock just changes place — the business-wide total stays the same.
        await changeStock(tx, {
          businessId,
          productId: item.productId,
          locationId: input.fromLocationId,
          delta: -item.quantity,
          requireAvailable: true,
          updateTotal: false,
        });
        await changeStock(tx, { businessId, productId: item.productId, locationId: input.toLocationId, delta: item.quantity, updateTotal: false });
        await tx.stockMovement.create({
          data: {
            businessId,
            productId: item.productId,
            type: "TRANSFER",
            quantity: item.quantity,
            employeeId,
            locationId: input.fromLocationId,
            toLocationId: input.toLocationId,
            transferId: created.id,
            comment: `${names.get(input.fromLocationId)} → ${names.get(input.toLocationId)}`,
          },
        });
      }
      return created;
    },
    { timeout: 30000 },
  );
  return { id: transfer.id, itemsCount: input.items.length };
}

// ---------------------------------------------------------------------------
// Batches & expiry
// ---------------------------------------------------------------------------

export async function listExpiringBatches(businessId: string, days: number) {
  const until = new Date();
  until.setDate(until.getDate() + days);
  const batches = await prisma.productBatch.findMany({
    where: { businessId, quantity: { gt: 0 }, expiryDate: { not: null, lte: until }, product: { status: "ACTIVE" } },
    include: { product: true },
    orderBy: { expiryDate: "asc" },
    take: 200,
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return batches.map((b) => ({
    id: b.id,
    productId: b.productId,
    productName: b.product.name,
    unit: b.product.unit,
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate,
    quantity: toNumber(b.quantity),
    value: round2(toNumber(b.quantity) * toNumber(b.product.purchasePrice)),
    expired: !!b.expiryDate && b.expiryDate < today,
    daysLeft: b.expiryDate ? Math.ceil((b.expiryDate.getTime() - today.getTime()) / 86_400_000) : null,
  }));
}

/** Writes off what's left of a batch (expired / damaged goods). */
export async function writeOffBatch(businessId: string, employeeId: string, batchId: string, locationId?: string | null) {
  const batch = await prisma.productBatch.findFirst({ where: { id: batchId, businessId }, include: { product: true } });
  if (!batch) throw ApiError.notFound("Партия табылган жок.");
  const quantity = toNumber(batch.quantity);
  if (quantity <= 0) throw ApiError.badRequest("Бул партияда товар калган жок.");

  await prisma.$transaction(async (tx) => {
    const resolved = await resolveLocationId(tx, businessId, { locationId, employeeId });
    await changeStock(tx, { businessId, productId: batch.productId, locationId: resolved, delta: -quantity, requireAvailable: true });
    await tx.productBatch.update({ where: { id: batch.id }, data: { quantity: 0 } });
    await tx.stockMovement.create({
      data: {
        businessId,
        productId: batch.productId,
        type: "WRITE_OFF",
        quantity,
        employeeId,
        locationId: resolved,
        comment: `Мөөнөтү бүткөн партия${batch.batchNumber ? ` ${batch.batchNumber}` : ""}`,
      },
    });
  });
  return { written: quantity };
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

const REORDER_LOOKBACK_DAYS = 14;
const REORDER_URGENCY_DAYS = 7;

/**
 * Estimates how many days of stock are left per product from recent sale
 * velocity (units sold over the last 14 days / 14), and flags anything
 * projected to run out within a week — a step ahead of the plain
 * quantity <= minQuantity low-stock check, which says nothing about *when*.
 */
export async function getReorderSuggestions(businessId: string) {
  const since = new Date();
  since.setDate(since.getDate() - REORDER_LOOKBACK_DAYS);

  const [products, soldItems] = await Promise.all([
    prisma.product.findMany({ where: { businessId, status: "ACTIVE" } }),
    prisma.saleItem.findMany({
      where: { sale: { businessId, createdAt: { gte: since }, status: "COMPLETED" } },
      select: { productId: true, quantity: true, returnedQuantity: true },
    }),
  ]);

  const soldByProduct = new Map<string, number>();
  for (const item of soldItems) {
    const net = toNumber(item.quantity) - toNumber(item.returnedQuantity);
    soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + net);
  }

  return products
    .map((p) => {
      const quantity = toNumber(p.quantity);
      const soldLast14Days = soldByProduct.get(p.id) ?? 0;
      const dailyVelocity = round2(soldLast14Days / REORDER_LOOKBACK_DAYS);
      const daysUntilStockout = dailyVelocity > 0 ? Math.floor(quantity / dailyVelocity) : null;
      return {
        productId: p.id,
        name: p.name,
        quantity,
        unit: p.unit,
        dailyVelocity,
        daysUntilStockout,
      };
    })
    .filter((p) => p.dailyVelocity > 0 && p.daysUntilStockout !== null && p.daysUntilStockout <= REORDER_URGENCY_DAYS)
    .sort((a, b) => (a.daysUntilStockout ?? 0) - (b.daysUntilStockout ?? 0))
    .slice(0, 10);
}

export async function stockSummary(businessId: string) {
  const products = await prisma.product.findMany({ where: { businessId, status: "ACTIVE" } });

  const totalQuantity = products.reduce((sum, p) => sum + toNumber(p.quantity), 0);
  const totalValue = products.reduce((sum, p) => sum + toNumber(p.quantity) * toNumber(p.purchasePrice), 0);
  const lowStock = products.filter((p) => toNumber(p.quantity) > 0 && toNumber(p.quantity) <= toNumber(p.minQuantity)).length;
  const outOfStock = products.filter((p) => toNumber(p.quantity) <= 0).length;

  return {
    totalProducts: products.length,
    totalQuantity,
    totalValue: Math.round(totalValue * 100) / 100,
    lowStock,
    outOfStock,
  };
}
