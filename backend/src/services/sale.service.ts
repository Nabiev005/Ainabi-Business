import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { toNumber, round2 } from "../utils/money";
import { changeStock, consumeBatches, findOpenShift, getDefaultLocation, nextNumber, resolveLocationId } from "../utils/stockLedger";
import { CreateReturnInput, CreateSaleInput, SaleQuery } from "../validators/sale.validator";

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// ---------------------------------------------------------------------------
// Create sale
// ---------------------------------------------------------------------------

export async function createSale(businessId: string, employeeId: string, input: CreateSaleInput) {
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const [products, business] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds }, businessId }, include: { packages: true } }),
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
  ]);

  if (products.length !== productIds.length) {
    throw ApiError.badRequest("Тандалган товарлардын айрымдары табылган жок.");
  }
  const productMap = new Map(products.map((p) => [p.id, p]));

  if (input.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, businessId } });
    if (!customer) throw ApiError.notFound("Кардар табылган жок.");
  }

  const shift = await findOpenShift(prisma, businessId, employeeId);
  if (business.requireShift && !shift) {
    throw ApiError.badRequest("Адегенде кассалык сменаны ачыңыз.");
  }

  if (business.checkPrescription && !input.prescriptionConfirmed && products.some((p) => p.prescriptionRequired)) {
    throw ApiError.badRequest("Рецепт менен берилүүчү товар бар. Рецептти текшерип, ырастаңыз.");
  }

  const locationId = await resolveLocationId(prisma, businessId, { locationId: input.locationId, employeeId });

  // IMEI / serial numbers: exactly one per unit for products that require
  // them, never repeated within the sale.
  const seenSerials = new Set<string>();
  const now = new Date();
  const wholesale = input.priceLevel === "WHOLESALE";
  let subtotal = 0;
  let costTotal = 0;

  const lines = input.items.map((item) => {
    const product = productMap.get(item.productId)!;
    const pkg = item.packageId ? product.packages.find((p) => p.id === item.packageId) : null;
    if (item.packageId && !pkg) throw ApiError.badRequest("Таңгак табылган жок.");

    let serials: string[] = [];
    if (product.requiresSerial) {
      serials = (item.serialNumbers ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (pkg || !Number.isInteger(item.quantity) || serials.length !== item.quantity) {
        throw ApiError.badRequest(`"${product.name}" үчүн ар бир даанага IMEI/сериялык номер жазыңыз.`);
      }
      for (const serial of serials) {
        if (seenSerials.has(serial)) throw ApiError.badRequest(`"${serial}" номери кайталанып жатат.`);
        seenSerials.add(serial);
      }
    }

    const factor = pkg ? toNumber(pkg.factor) : 1;
    const baseQuantity = Math.round(item.quantity * factor * 1000) / 1000;
    const unitPrice = wholesale && product.wholesalePrice !== null ? toNumber(product.wholesalePrice) : toNumber(product.salePrice);
    // Price of one *sold* unit (a package, or one base unit).
    const price = pkg
      ? !wholesale && pkg.salePrice !== null
        ? toNumber(pkg.salePrice)
        : round2(unitPrice * factor)
      : unitPrice;
    const costPrice = toNumber(product.purchasePrice);
    const total = round2(price * item.quantity);
    const lineCost = round2(costPrice * baseQuantity);
    subtotal = round2(subtotal + total);
    costTotal = round2(costTotal + lineCost);

    return {
      product,
      baseQuantity,
      data: {
        productId: product.id,
        quantity: baseQuantity,
        price,
        costPrice,
        total,
        serialNumbers: serials,
        warrantyUntil: product.warrantyMonths ? addMonths(now, product.warrantyMonths) : null,
        packageName: pkg?.name ?? null,
        packageQuantity: pkg ? item.quantity : null,
      },
    };
  });

  const discount = round2(Math.min(input.discount, subtotal));
  const total = round2(Math.max(0, subtotal - discount));

  if (input.paymentMethod === "DEBT" && !input.customerId) {
    throw ApiError.badRequest("Карызга сатуу үчүн кардар талап кылынат.");
  }

  const sale = await prisma.$transaction(
    async (tx) => {
      // Serials: a known unit must be in stock (and be this product); an
      // unknown one is registered as sold right away (shops that don't
      // enter IMEIs at receiving still get duplicate protection).
      const serialOwners = new Map<string, string>();
      for (const line of lines) for (const s of line.data.serialNumbers) serialOwners.set(s, line.product.id);
      if (serialOwners.size > 0) {
        const known = await tx.productSerial.findMany({ where: { businessId, serial: { in: [...serialOwners.keys()] } } });
        for (const unit of known) {
          if (unit.status === "SOLD") throw ApiError.conflict(`"${unit.serial}" номери мурун сатылган.`);
          if (unit.productId !== serialOwners.get(unit.serial)) {
            throw ApiError.badRequest(`"${unit.serial}" номери башка товарга таандык.`);
          }
        }
      }

      const number = await nextNumber(tx, businessId, "saleCounter");
      const sale = await tx.sale.create({
        data: {
          businessId,
          employeeId,
          customerId: input.customerId || null,
          subtotal,
          discount,
          total,
          costTotal,
          paymentMethod: input.paymentMethod,
          number,
          locationId,
          shiftId: shift?.id ?? null,
          priceLevel: input.priceLevel,
          items: { create: lines.map((l) => l.data) },
        },
        include: { items: { include: { product: true } }, customer: true },
      });

      for (const [serial, productId] of serialOwners) {
        const { count } = await tx.productSerial.updateMany({
          where: { businessId, serial, status: "IN_STOCK" },
          data: { status: "SOLD", saleId: sale.id, soldAt: now },
        });
        if (count === 0) {
          // Not registered before — a concurrent sale of the same unit
          // trips the (businessId, serial) unique index here.
          const exists = await tx.productSerial.findUnique({ where: { businessId_serial: { businessId, serial } } });
          if (exists) throw ApiError.conflict(`"${serial}" номери мурун сатылган.`);
          await tx.productSerial.create({ data: { businessId, productId, serial, status: "SOLD", saleId: sale.id, soldAt: now } });
        }
      }

      for (const line of lines) {
        await changeStock(tx, {
          businessId,
          productId: line.product.id,
          locationId,
          delta: -line.baseQuantity,
          requireAvailable: true,
        });
        if (business.trackExpiry) await consumeBatches(tx, line.product.id, line.baseQuantity);
        await tx.stockMovement.create({
          data: {
            businessId,
            productId: line.product.id,
            type: "SALE",
            quantity: line.baseQuantity,
            saleId: sale.id,
            employeeId,
            locationId,
            comment: `Сатуу №${number}`,
          },
        });
      }

      if (input.paymentMethod === "DEBT" && input.customerId) {
        await tx.debt.create({
          data: {
            businessId,
            customerId: input.customerId,
            saleId: sale.id,
            totalAmount: total,
            paidAmount: 0,
            remainingAmount: total,
            status: "OPEN",
            comment: `Сатуу №${number}`,
          },
        });
      }

      return sale;
    },
    { timeout: 20000 },
  );

  return getSale(businessId, sale.id);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listSales(businessId: string, query: SaleQuery) {
  const search = query.search?.trim();
  const numberSearch = search && /^\d+$/.test(search) ? Number(search) : undefined;
  const where: Prisma.SaleWhereInput = {
    businessId,
    paymentMethod: query.paymentMethod,
    locationId: query.locationId || undefined,
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            ...(numberSearch !== undefined ? [{ number: numberSearch }] : []),
            { customer: { name: { contains: search, mode: "insensitive" } } },
            { items: { some: { serialNumbers: { has: search.toUpperCase() } } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { customer: true, employee: { include: { user: true } }, items: true },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.sale.count({ where }),
  ]);

  return {
    items: rows.map((s) => ({
      id: s.id,
      number: s.number,
      total: toNumber(s.total),
      discount: toNumber(s.discount),
      returnedTotal: toNumber(s.returnedTotal),
      paymentMethod: s.paymentMethod,
      status: s.status,
      customerName: s.customer?.name ?? null,
      cashierName: s.employee.user.name,
      itemCount: s.items.length,
      createdAt: s.createdAt,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getSale(businessId: string, id: string) {
  const sale = await prisma.sale.findFirst({
    where: { id, businessId },
    include: {
      customer: true,
      employee: { include: { user: true } },
      items: { include: { product: true, returnItems: true } },
      returns: { include: { employee: { include: { user: true } }, items: { include: { product: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!sale) throw ApiError.notFound("Сатуу табылган жок.");

  const location = sale.locationId ? await prisma.location.findUnique({ where: { id: sale.locationId } }) : null;

  return {
    id: sale.id,
    number: sale.number,
    subtotal: toNumber(sale.subtotal),
    discount: toNumber(sale.discount),
    total: toNumber(sale.total),
    returnedTotal: toNumber(sale.returnedTotal),
    paymentMethod: sale.paymentMethod,
    priceLevel: sale.priceLevel,
    status: sale.status,
    customer: sale.customer ? { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone } : null,
    cashierName: sale.employee.user.name,
    locationName: location?.name ?? null,
    items: sale.items.map((i) => {
      const returnedSerials = new Set(i.returnItems.flatMap((r) => r.serialNumbers));
      return {
        id: i.id,
        productId: i.productId,
        productName: i.product.name,
        unit: i.product.unit,
        quantity: toNumber(i.quantity),
        price: toNumber(i.price),
        total: toNumber(i.total),
        packageName: i.packageName,
        packageQuantity: i.packageQuantity === null ? null : toNumber(i.packageQuantity),
        returnedQuantity: toNumber(i.returnedQuantity),
        serialNumbers: i.serialNumbers,
        returnedSerials: i.serialNumbers.filter((s) => returnedSerials.has(s)),
        warrantyUntil: i.warrantyUntil,
      };
    }),
    returns: sale.returns.map((r) => ({
      id: r.id,
      total: toNumber(r.total),
      refundMethod: r.refundMethod,
      reason: r.reason,
      employeeName: r.employee.user.name,
      createdAt: r.createdAt,
      items: r.items.map((ri) => ({ productName: ri.product.name, quantity: toNumber(ri.quantity), total: toNumber(ri.total), serialNumbers: ri.serialNumbers })),
    })),
    createdAt: sale.createdAt,
  };
}

/** Warranty / return lookup: which sale did this IMEI or serial go out in —
 * or is the unit still on the shelf? */
export async function findBySerial(businessId: string, serial: string) {
  const normalized = serial.trim().toUpperCase();
  const [items, unit] = await Promise.all([
    prisma.saleItem.findMany({
      where: { serialNumbers: { has: normalized }, sale: { businessId } },
      include: { product: true, returnItems: true, sale: { include: { customer: true, employee: { include: { user: true } } } } },
      orderBy: { sale: { createdAt: "desc" } },
      take: 10,
    }),
    prisma.productSerial.findUnique({ where: { businessId_serial: { businessId, serial: normalized } }, include: { product: true } }),
  ]);

  const hits = items.map((i) => ({
    serial: normalized,
    saleId: i.saleId as string | null,
    saleNumber: i.sale.number,
    saleStatus: i.sale.status as string,
    returned: i.returnItems.some((r) => r.serialNumbers.includes(normalized)),
    inStock: false,
    productId: i.productId,
    productName: i.product.name,
    price: toNumber(i.price),
    warrantyUntil: i.warrantyUntil as Date | null,
    customer: i.sale.customer ? { id: i.sale.customer.id, name: i.sale.customer.name, phone: i.sale.customer.phone } : null,
    cashierName: i.sale.employee.user.name as string | null,
    soldAt: i.sale.createdAt as Date | null,
  }));

  if (unit?.status === "IN_STOCK") {
    hits.unshift({
      serial: normalized,
      saleId: null,
      saleNumber: null,
      saleStatus: "IN_STOCK",
      returned: false,
      inStock: true,
      productId: unit.productId,
      productName: unit.product.name,
      price: toNumber(unit.product.salePrice),
      warrantyUntil: null,
      customer: null,
      cashierName: null,
      soldAt: null,
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

/**
 * A customer brings goods back. Stock returns to the shelf (at the sale's
 * branch), returned IMEIs become sellable again, and the money goes back
 * either in cash/card/QR or — for a sale on credit — comes off the
 * customer's open debt. The refund is proportional to what the customer
 * actually paid, so a sale-level discount is honoured.
 */
export async function createReturn(businessId: string, employeeId: string, saleId: string, input: CreateReturnInput) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId },
    include: { items: { include: { product: true } }, debt: true },
  });
  if (!sale) throw ApiError.notFound("Сатуу табылган жок.");
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });

  const itemMap = new Map(sale.items.map((i) => [i.id, i]));
  const subtotal = toNumber(sale.subtotal);
  const paidRatio = subtotal > 0 ? toNumber(sale.total) / subtotal : 1;

  const lines = input.items.map((req) => {
    const item = itemMap.get(req.saleItemId);
    if (!item) throw ApiError.badRequest("Кайтарылуучу товар бул сатууда жок.");
    const soldBase = toNumber(item.quantity);
    const perSoldUnit = item.packageQuantity ? soldBase / toNumber(item.packageQuantity) : 1;
    const baseQuantity = Math.round(req.quantity * perSoldUnit * 1000) / 1000;
    const available = Math.round((soldBase - toNumber(item.returnedQuantity)) * 1000) / 1000;
    if (baseQuantity > available + 1e-9) {
      throw ApiError.badRequest(`"${item.product.name}" үчүн кайтарууга болот: ${available}.`);
    }

    let serials: string[] = [];
    if (item.serialNumbers.length > 0) {
      serials = (req.serialNumbers ?? []).map((s) => s.trim().toUpperCase());
      if (serials.length !== baseQuantity || serials.some((s) => !item.serialNumbers.includes(s))) {
        throw ApiError.badRequest(`"${item.product.name}" үчүн кайтарылган IMEI/сериялык номерлерди тандаңыз.`);
      }
    }

    const itemShare = soldBase > 0 ? baseQuantity / soldBase : 0;
    return {
      item,
      baseQuantity,
      serials,
      total: round2(toNumber(item.total) * itemShare * paidRatio),
      costTotal: round2(toNumber(item.costPrice) * baseQuantity),
    };
  });

  const total = round2(lines.reduce((s, l) => s + l.total, 0));
  const costTotal = round2(lines.reduce((s, l) => s + l.costTotal, 0));

  if (input.refundMethod === "DEBT") {
    if (!sale.debt) throw ApiError.badRequest("Бул сатуу карызга болгон эмес.");
    if (total > toNumber(sale.debt.remainingAmount) + 0.001) {
      throw ApiError.badRequest("Кайтарылуучу сумма калган карыздан ашат. Акчаны башка жол менен кайтарыңыз.");
    }
  }

  const shift = await findOpenShift(prisma, businessId, employeeId);
  const locationId = sale.locationId ?? (await getDefaultLocation(prisma, businessId)).id;

  const saleReturn = await prisma.$transaction(
    async (tx) => {
      const created = await tx.saleReturn.create({
        data: {
          businessId,
          saleId,
          employeeId,
          locationId,
          shiftId: shift?.id ?? null,
          total,
          costTotal,
          refundMethod: input.refundMethod,
          reason: input.reason || null,
          items: {
            create: lines.map((l) => ({
              saleItemId: l.item.id,
              productId: l.item.productId,
              quantity: l.baseQuantity,
              total: l.total,
              costTotal: l.costTotal,
              serialNumbers: l.serials,
            })),
          },
        },
      });

      for (const line of lines) {
        // Guard against two returns of the same line at once.
        const { count } = await tx.saleItem.updateMany({
          where: { id: line.item.id, returnedQuantity: { lte: toNumber(line.item.quantity) - line.baseQuantity } },
          data: { returnedQuantity: { increment: line.baseQuantity } },
        });
        if (count === 0) throw ApiError.conflict("Бул товар мурунтан кайтарылган.");

        await changeStock(tx, { businessId, productId: line.item.productId, locationId, delta: line.baseQuantity });
        if (business.trackExpiry) {
          await tx.productBatch.create({
            data: { businessId, productId: line.item.productId, batchNumber: "Кайтарым", initialQuantity: line.baseQuantity, quantity: line.baseQuantity },
          });
        }
        await tx.stockMovement.create({
          data: {
            businessId,
            productId: line.item.productId,
            type: "RETURN",
            quantity: line.baseQuantity,
            saleId,
            returnId: created.id,
            employeeId,
            locationId,
            comment: `Кайтарым, сатуу №${sale.number ?? ""}`.trim(),
          },
        });
        if (line.serials.length > 0) {
          await tx.productSerial.updateMany({
            where: { businessId, serial: { in: line.serials } },
            data: { status: "IN_STOCK", saleId: null, soldAt: null },
          });
        }
      }

      await tx.sale.update({ where: { id: saleId }, data: { returnedTotal: { increment: total } } });

      if (input.refundMethod === "DEBT" && sale.debt) {
        const remaining = round2(toNumber(sale.debt.remainingAmount) - total);
        await tx.debt.update({
          where: { id: sale.debt.id },
          data: {
            totalAmount: { decrement: total },
            remainingAmount: remaining,
            status: remaining <= 0 ? "PAID" : toNumber(sale.debt.paidAmount) > 0 ? "PARTIAL" : "OPEN",
          },
        });
      }

      return created;
    },
    { timeout: 20000 },
  );

  return { id: saleReturn.id, total, sale: await getSale(businessId, saleId) };
}
