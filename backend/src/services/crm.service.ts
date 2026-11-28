/**
 * CRM (Max plan): who to call, who to congratulate, who to win back.
 *
 * Segments are worked out from the sales history every time (a shop has
 * hundreds to a few thousand customers — one grouped query is enough), so
 * they can never drift from what was actually sold.
 */
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { toNumber } from "../utils/money";
import { dayKey } from "../utils/dateRange";
import { ActivityInput, CrmProfileInput, SegmentQuery } from "../validators/crm.validator";

const DAY = 86_400_000;
/** "New customer": first purchase within this many days. */
const NEW_DAYS = 30;
/** "Birthday soon": within this many days from today. */
const BIRTHDAY_DAYS = 7;
/** Top customers list length. */
const TOP_LIMIT = 30;

export interface CrmCustomerRow {
  id: string;
  name: string;
  phone: string | null;
  tags: string[];
  birthday: string | null;
  purchaseCount: number;
  totalSpent: number;
  averageCheck: number;
  firstPurchaseAt: Date | null;
  lastPurchaseAt: Date | null;
  /** Days since the last purchase (null = never bought). */
  daysSinceLastPurchase: number | null;
  /** Days until the next birthday (0 = today), when it's set. */
  daysToBirthday: number | null;
}

/** Same labels regardless of case/spaces; at most 10, no duplicates. */
export function normalizeTags(tags: string[]) {
  const seen = new Map<string, string>();
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 30);
    if (tag && !seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  }
  return [...seen.values()].slice(0, 10);
}

/** Midnight today in the server's (= shop's) timezone. */
function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Days from today until the next time this birthday comes round (0 = today). Feb 29 counts as Feb 28 in other years. */
export function daysToBirthday(birthday: Date, now = new Date()) {
  // Stored as a DATE (UTC midnight): read the calendar day in UTC.
  const month = birthday.getUTCMonth();
  const day = birthday.getUTCDate();
  const today = startOfToday(now);
  const at = (year: number) => {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return new Date(year, month, month === 1 && day === 29 && !leap ? 28 : day);
  };
  let next = at(today.getFullYear());
  if (next < today) next = at(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / DAY);
}

/** Every customer of the business with purchase stats. */
async function customerRows(businessId: string, now = new Date()): Promise<CrmCustomerRow[]> {
  const [customers, stats] = await Promise.all([
    prisma.customer.findMany({
      where: { businessId },
      select: { id: true, name: true, phone: true, tags: true, birthday: true },
    }),
    prisma.sale.groupBy({
      by: ["customerId"],
      where: { businessId, status: "COMPLETED", customerId: { not: null } },
      _sum: { total: true },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
  ]);
  const byCustomer = new Map(stats.map((s) => [s.customerId!, s]));
  const today = startOfToday(now);
  return customers.map((c) => {
    const s = byCustomer.get(c.id);
    const purchaseCount = s?._count._all ?? 0;
    const totalSpent = toNumber(s?._sum.total ?? 0);
    const last = s?._max.createdAt ?? null;
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      tags: c.tags,
      birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : null,
      purchaseCount,
      totalSpent,
      averageCheck: purchaseCount ? Math.round(totalSpent / purchaseCount) : 0,
      firstPurchaseAt: s?._min.createdAt ?? null,
      lastPurchaseAt: last,
      daysSinceLastPurchase: last ? Math.max(0, Math.floor((today.getTime() - startOfToday(last).getTime()) / DAY)) : null,
      daysToBirthday: c.birthday ? daysToBirthday(c.birthday, now) : null,
    };
  });
}

const isLapsed = (r: CrmCustomerRow, days: number) => r.purchaseCount > 0 && (r.daysSinceLastPurchase ?? 0) >= days;
const isNew = (r: CrmCustomerRow, now: Date) => !!r.firstPurchaseAt && now.getTime() - r.firstPurchaseAt.getTime() <= NEW_DAYS * DAY;
const hasBirthdaySoon = (r: CrmCustomerRow) => r.daysToBirthday !== null && r.daysToBirthday <= BIRTHDAY_DAYS;

function topCustomers(rows: CrmCustomerRow[]) {
  return rows
    .filter((r) => r.purchaseCount > 0)
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, TOP_LIMIT);
}

/** One segment of customers, most relevant first. */
export async function listSegment(businessId: string, query: SegmentQuery, now = new Date()) {
  let rows = await customerRows(businessId, now);
  if (query.search) {
    const q = query.search.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || (r.phone ?? "").includes(q));
  }
  switch (query.segment) {
    case "lapsed":
      return rows.filter((r) => isLapsed(r, query.days)).sort((a, b) => b.totalSpent - a.totalSpent);
    case "top":
      return topCustomers(rows);
    case "newcomers":
      return rows.filter((r) => isNew(r, now)).sort((a, b) => b.firstPurchaseAt!.getTime() - a.firstPurchaseAt!.getTime());
    case "birthdays":
      return rows.filter(hasBirthdaySoon).sort((a, b) => a.daysToBirthday! - b.daysToBirthday!);
    case "tag": {
      const tag = (query.tag ?? "").toLowerCase();
      return rows.filter((r) => r.tags.some((t) => t.toLowerCase() === tag)).sort((a, b) => b.totalSpent - a.totalSpent);
    }
    default:
      return rows.sort((a, b) => (b.lastPurchaseAt?.getTime() ?? 0) - (a.lastPurchaseAt?.getTime() ?? 0));
  }
}

/** The CRM page header: how many in each segment, the tags in use, and follow-ups due. */
export async function overview(businessId: string, days = 30, now = new Date()) {
  const [rows, due] = await Promise.all([customerRows(businessId, now), dueFollowUpCount(businessId, now)]);
  const tags = new Map<string, number>();
  for (const r of rows) for (const t of r.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  const buyers = rows.filter((r) => r.purchaseCount > 0);
  const repeat = buyers.filter((r) => r.purchaseCount > 1).length;
  return {
    customers: rows.length,
    buyers: buyers.length,
    /** Share of buyers who came back at least once, %. */
    repeatRate: buyers.length ? Math.round((repeat / buyers.length) * 100) : 0,
    segments: {
      lapsed: rows.filter((r) => isLapsed(r, days)).length,
      top: topCustomers(rows).length,
      newcomers: rows.filter((r) => isNew(r, now)).length,
      birthdays: rows.filter(hasBirthdaySoon).length,
    },
    tags: [...tags.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    followUpsDue: due,
  };
}

/** Tags and birthday of one customer. */
export async function updateProfile(businessId: string, customerId: string, input: CrmProfileInput) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, businessId }, select: { id: true } });
  if (!customer) throw ApiError.notFound("Кардар табылган жок.");
  if (input.birthday) {
    const d = new Date(`${input.birthday}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input.birthday || d > new Date()) {
      throw ApiError.badRequest("Туулган күндү туура жазыңыз.");
    }
  }
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      tags: normalizeTags(input.tags),
      ...(input.birthday !== undefined ? { birthday: input.birthday ? new Date(`${input.birthday}T00:00:00Z`) : null } : {}),
    },
    select: { id: true, tags: true, birthday: true },
  });
  return { id: updated.id, tags: updated.tags, birthday: updated.birthday ? updated.birthday.toISOString().slice(0, 10) : null };
}

// ---------- timeline ----------

const activityInclude = { employee: { select: { user: { select: { name: true } } } } } as const;

function toActivity(a: {
  id: string;
  customerId: string;
  kind: string;
  text: string;
  dueAt: Date | null;
  doneAt: Date | null;
  createdAt: Date;
  employee: { user: { name: string } } | null;
}) {
  return {
    id: a.id,
    customerId: a.customerId,
    kind: a.kind,
    text: a.text,
    dueAt: a.dueAt,
    doneAt: a.doneAt,
    createdAt: a.createdAt,
    employeeName: a.employee?.user.name ?? null,
  };
}

export async function listActivities(businessId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, businessId }, select: { id: true, tags: true, birthday: true } });
  if (!customer) throw ApiError.notFound("Кардар табылган жок.");
  const items = await prisma.customerActivity.findMany({
    where: { businessId, customerId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: activityInclude,
  });
  return {
    tags: customer.tags,
    birthday: customer.birthday ? customer.birthday.toISOString().slice(0, 10) : null,
    items: items.map(toActivity),
  };
}

export async function addActivity(businessId: string, employeeId: string, customerId: string, input: ActivityInput) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, businessId }, select: { id: true } });
  if (!customer) throw ApiError.notFound("Кардар табылган жок.");
  const created = await prisma.customerActivity.create({
    data: {
      businessId,
      customerId,
      employeeId,
      kind: input.kind,
      text: input.text,
      dueAt: input.kind === "FOLLOW_UP" ? input.dueAt : null,
    },
    include: activityInclude,
  });
  return toActivity(created);
}

/** Close a follow-up (or reopen it with done = false). */
export async function setFollowUpDone(businessId: string, activityId: string, done: boolean) {
  const activity = await prisma.customerActivity.findFirst({ where: { id: activityId, businessId, kind: "FOLLOW_UP" } });
  if (!activity) throw ApiError.notFound("Эскертме табылган жок.");
  const updated = await prisma.customerActivity.update({
    where: { id: activityId },
    data: { doneAt: done ? new Date() : null },
    include: activityInclude,
  });
  return toActivity(updated);
}

export async function deleteActivity(businessId: string, activityId: string) {
  const { count } = await prisma.customerActivity.deleteMany({ where: { id: activityId, businessId } });
  if (!count) throw ApiError.notFound("Жазуу табылган жок.");
}

function endOfToday(now: Date) {
  return new Date(startOfToday(now).getTime() + DAY);
}

function dueFollowUpCount(businessId: string, now: Date) {
  return prisma.customerActivity.count({ where: { businessId, kind: "FOLLOW_UP", doneAt: null, dueAt: { lt: endOfToday(now) } } });
}

/** Open follow-ups: due today or overdue ("due"), or all of them ("upcoming"), soonest first. */
export async function listFollowUps(businessId: string, when: "due" | "upcoming", now = new Date()) {
  const items = await prisma.customerActivity.findMany({
    where: { businessId, kind: "FOLLOW_UP", doneAt: null, ...(when === "due" ? { dueAt: { lt: endOfToday(now) } } : {}) },
    orderBy: { dueAt: "asc" },
    take: 200,
    include: { ...activityInclude, customer: { select: { name: true, phone: true } } },
  });
  const today = dayKey(now);
  return items.map((a) => ({
    ...toActivity(a),
    customerName: a.customer.name,
    customerPhone: a.customer.phone,
    overdue: !!a.dueAt && dayKey(a.dueAt) < today,
  }));
}
