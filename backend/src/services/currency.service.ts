import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { toNumber } from "../utils/money";
import { dayKey } from "../utils/dateRange";
import { parseNbkrUsd, somPrices } from "./currency";

const NBKR_URL = "https://www.nbkr.kg/XML/daily.xml";
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Today's НБКР dollar rate. Fetched at most once a day for the whole
 * platform (cached in ExchangeRate); null if the bank can't be reached
 * and nothing is cached — callers keep the last rate they had.
 */
export async function todayNbkrUsd(): Promise<number | null> {
  const today = dayKey(new Date());
  const cached = await prisma.exchangeRate.findUnique({ where: { day: today } });
  if (cached) return toNumber(cached.usd);
  try {
    const response = await fetch(NBKR_URL, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`НБКР responded ${response.status}`);
    const parsed = parseNbkrUsd(await response.text());
    if (!parsed) throw new Error("НБКР XML has no USD rate");
    await prisma.exchangeRate.upsert({ where: { day: today }, create: { day: today, usd: parsed.usd, nbkrDate: parsed.date }, update: {} });
    return parsed.usd;
  } catch (error) {
    console.error("Could not fetch the НБКР rate:", error);
    const last = await prisma.exchangeRate.findFirst({ orderBy: { day: "desc" } });
    return last ? toNumber(last.usd) : null;
  }
}

/** Re-derives the som prices of every dollar-priced product of a business. */
async function reprice(db: Db, businessId: string, rate: number, step: number) {
  const s = step > 0 ? step : 1;
  // Same rounding as somPrices(): sale price up to the step, purchase price to the tyiyn.
  await db.$executeRaw`UPDATE "products" SET "salePrice" = CEIL("usdSalePrice" * ${rate} / ${s} - 0.000000001) * ${s}
    WHERE "businessId" = ${businessId} AND "usdSalePrice" IS NOT NULL`;
  await db.$executeRaw`UPDATE "products" SET "purchasePrice" = ROUND("usdPurchasePrice" * ${rate}, 2)
    WHERE "businessId" = ${businessId} AND "usdPurchasePrice" IS NOT NULL`;
}

/**
 * Called on the paths that read prices (product list, barcode scan, sale):
 * once a day, a business on the automatic rate gets today's НБКР rate and
 * its dollar-priced products are re-priced. The conditional update makes
 * sure only one request per day does the work.
 */
export async function ensureFreshPrices(businessId: string) {
  const today = dayKey(new Date());
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { usdRateAuto: true, usdRateDate: true, priceRounding: true, _count: { select: { products: { where: { usdSalePrice: { not: null } } } } } },
  });
  if (!business || !business.usdRateAuto || business.usdRateDate === today) return;
  if (business._count.products === 0) {
    // Nothing priced in dollars — just remember we checked today.
    await prisma.business.update({ where: { id: businessId }, data: { usdRateDate: today } });
    return;
  }
  const rate = await todayNbkrUsd();
  if (!rate) return;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.business.updateMany({
      where: { id: businessId, OR: [{ usdRateDate: null }, { usdRateDate: { not: today } }] },
      data: { usdRate: rate, usdRateDate: today },
    });
    if (count === 1) await reprice(tx, businessId, rate, business.priceRounding);
  });
}

/** The rate a business prices with right now (fetching one if it never had any). */
async function businessRate(db: Db, businessId: string) {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId }, select: { usdRate: true, priceRounding: true } });
  let rate = business.usdRate === null ? null : toNumber(business.usdRate);
  if (rate === null) {
    rate = await todayNbkrUsd();
    if (rate !== null) await db.business.update({ where: { id: businessId }, data: { usdRate: rate, usdRateDate: dayKey(new Date()) } });
  }
  return { rate, step: business.priceRounding };
}

/**
 * Product form → what to store. With a dollar sale price the som prices are
 * derived from the business's rate (whatever som values the form sent are
 * ignored); without one the product is an ordinary som-priced product.
 */
export async function resolveProductPrices(
  db: Db,
  businessId: string,
  input: { purchasePrice: number; salePrice: number; usdPurchasePrice?: number | null; usdSalePrice?: number | null },
) {
  if (input.usdSalePrice == null) {
    return { purchasePrice: input.purchasePrice, salePrice: input.salePrice, usdPurchasePrice: null, usdSalePrice: null };
  }
  const { rate, step } = await businessRate(db, businessId);
  if (rate === null) throw ApiError.badRequest("Доллар курсу азыр белгисиз. Настройкалардан курсту колу менен жазыңыз.");
  const som = somPrices({ purchase: input.usdPurchasePrice ?? null, sale: input.usdSalePrice }, rate, step);
  return {
    salePrice: som.salePrice,
    purchasePrice: som.purchasePrice ?? input.purchasePrice,
    usdPurchasePrice: input.usdPurchasePrice ?? null,
    usdSalePrice: input.usdSalePrice,
  };
}

export async function getCurrencySettings(businessId: string) {
  const [business, usdProducts, nbkr] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { usdRate: true, usdRateDate: true, usdRateAuto: true, priceRounding: true } }),
    prisma.product.count({ where: { businessId, usdSalePrice: { not: null }, status: "ACTIVE" } }),
    todayNbkrUsd(),
  ]);
  return {
    usdRate: business.usdRate === null ? null : toNumber(business.usdRate),
    usdRateDate: business.usdRateDate,
    usdRateAuto: business.usdRateAuto,
    priceRounding: business.priceRounding,
    nbkrRate: nbkr,
    usdProducts,
  };
}

/** Owner changes the rate mode / rounding (or types a rate by hand); prices follow at once. */
export async function updateCurrencySettings(businessId: string, input: { usdRateAuto: boolean; usdRate?: number | null; priceRounding: number }) {
  const today = dayKey(new Date());
  const rate = input.usdRateAuto ? await todayNbkrUsd() : (input.usdRate ?? null);
  if (rate === null) {
    throw ApiError.badRequest(input.usdRateAuto ? "Улуттук банктын курсун азыр алуу мүмкүн болбоду. Курсту колу менен жазыңыз." : "Курсту жазыңыз.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id: businessId },
      data: { usdRateAuto: input.usdRateAuto, usdRate: Math.round(rate * 10000) / 10000, usdRateDate: today, priceRounding: input.priceRounding },
    });
    await reprice(tx, businessId, rate, input.priceRounding);
  });
  return getCurrencySettings(businessId);
}
