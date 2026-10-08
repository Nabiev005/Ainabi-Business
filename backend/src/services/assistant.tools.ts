import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildReport } from "./report.service";
import { buildAnalytics, monthForecast, profitAndLoss } from "./analytics.service";
import { listProducts } from "./product.service";
import { getLowStock } from "./dashboard.service";
import { debtSummary, listDebts } from "./debt.service";
import { getStaleProducts } from "./insights.service";
import { resolvePreset } from "../utils/dateRange";

/**
 * What the assistant can look up. Every tool is read-only and runs with the
 * caller's businessId — the model never sees or chooses a business, so it
 * can't reach another tenant's data whatever it is asked.
 *
 * Results are trimmed JSON: enough to answer, small enough to keep each
 * question cheap.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const period = z.object({ from: day, to: day });
const periodSchema = {
  type: "object",
  properties: {
    from: { type: "string", description: "First day, YYYY-MM-DD (shop's local date)." },
    to: { type: "string", description: "Last day, YYYY-MM-DD, inclusive." },
  },
  required: ["from", "to"],
  additionalProperties: false,
} as const;

function range({ from, to }: z.infer<typeof period>) {
  return resolvePreset(undefined, from, `${to}T23:59:59.999`);
}

export const ASSISTANT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_sales_report",
    description:
      "Sales for a period: revenue, net profit, gross profit, expenses, cost of goods, discounts, returns, number of sales, average receipt, revenue per day, and per-product results (top 25 by revenue). Use for questions about sales, revenue, best sellers, what sold, daily dynamics.",
    input_schema: periodSchema,
  },
  {
    name: "get_profit_and_loss",
    description:
      "Full profit-and-loss statement for a period, including stock losses (write-offs, inventory shortages) and repair income, plus expenses by category. Use for 'how much did I really earn', 'where does the money go', expense questions.",
    input_schema: periodSchema,
  },
  {
    name: "get_month_forecast",
    description:
      "This calendar month at the current pace: revenue so far, projected month-end revenue and net profit, the owner's monthly plan and the percent of it reached / projected, and what is needed per day to hit the plan.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_team_performance",
    description:
      "What each employee did in a period: sales count, revenue, profit, discounts given, goods received, tasks done/open/overdue, and cash register shortages (negative cash difference = money missing at shift close).",
    input_schema: periodSchema,
  },
  {
    name: "search_products",
    description:
      "Find products by name, SKU, barcode or attribute. Returns stock, sale/purchase price and margin (up to 20 matches). Use for 'how many X do I have', 'price of X'.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Search text, e.g. 'iPhone 13' or a barcode." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_low_stock",
    description: "Products that are out of stock or at/below their minimum quantity — what to reorder.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_customer_debts",
    description: "Open customer debts (sold on credit, not yet paid): total owed and the biggest debtors with phone numbers.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_slow_stock",
    description: "Products that haven't sold for N days while still in stock, and how much money is tied up in them.",
    input_schema: {
      type: "object",
      properties: { days: { type: "integer", description: "Days without a sale (14–365). Default 60." } },
      required: [],
      additionalProperties: false,
    },
  },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

type Executor = (businessId: string, input: unknown) => Promise<unknown>;

const EXECUTORS: Record<string, Executor> = {
  async get_sales_report(businessId, input) {
    const p = period.parse(input);
    const report = await buildReport(businessId, { preset: "custom", from: p.from, to: `${p.to}T23:59:59.999` });
    return {
      period: p,
      summary: report.summary,
      perDay: report.series,
      products: report.productPerformance.slice(0, 25),
      productsTotal: report.productPerformance.length,
    };
  },

  async get_profit_and_loss(businessId, input) {
    const p = period.parse(input);
    const { start, end } = range(p);
    const pnl = await profitAndLoss(businessId, start, end);
    return { period: p, statement: pnl.statement, expensesByCategory: pnl.expensesByCategory };
  },

  async get_month_forecast(businessId) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { cumulative, ...forecast } = await monthForecast(businessId);
    return forecast;
  },

  async get_team_performance(businessId, input) {
    const p = period.parse(input);
    const data = await buildAnalytics(businessId, { preset: "custom", from: p.from, to: `${p.to}T23:59:59.999` });
    return {
      period: p,
      tasks: data.tasks,
      team: data.team.map((m) => ({
        name: m.name,
        role: m.role,
        status: m.status,
        salesCount: m.salesCount,
        revenue: m.revenue,
        profit: m.profit,
        discounts: m.discounts,
        receiptsCount: m.receiptsCount,
        tasksDone: m.tasksDone,
        tasksOpen: m.tasksOpen,
        tasksOverdue: m.tasksOverdue,
        shiftsClosed: m.shiftsClosed,
        cashDifference: m.cashDifference,
        lastLoginAt: m.lastLoginAt,
      })),
    };
  },

  async search_products(businessId, input) {
    const { query } = z.object({ query: z.string().trim().min(1).max(100) }).parse(input);
    const result = await listProducts(businessId, { search: query, status: "ACTIVE", page: 1, pageSize: 20 });
    return {
      total: result.total,
      items: result.items.map((p) => ({
        name: p.name,
        sku: p.sku,
        category: p.categoryName,
        quantity: p.quantity,
        minQuantity: p.minQuantity,
        unit: p.unit,
        salePrice: p.salePrice,
        wholesalePrice: p.wholesalePrice,
        purchasePrice: p.purchasePrice,
        marginPercent: p.marginPercent,
      })),
    };
  },

  async get_low_stock(businessId) {
    return { items: await getLowStock(businessId, 30) };
  },

  async get_customer_debts(businessId) {
    const [summary, debts] = await Promise.all([debtSummary(businessId), listDebts(businessId, "OPEN")]);
    const byCustomer = new Map<string, { name: string; phone: string | null; owed: number; oldest: Date }>();
    for (const d of debts) {
      const entry = byCustomer.get(d.customerId) ?? { name: d.customerName, phone: d.customerPhone, owed: 0, oldest: d.createdAt };
      entry.owed += d.remainingAmount;
      if (d.createdAt < entry.oldest) entry.oldest = d.createdAt;
      byCustomer.set(d.customerId, entry);
    }
    return {
      summary,
      topDebtors: [...byCustomer.values()]
        .sort((a, b) => b.owed - a.owed)
        .slice(0, 20)
        .map((c) => ({ ...c, owed: r2(c.owed), oldest: c.oldest.toISOString().slice(0, 10) })),
    };
  },

  async get_slow_stock(businessId, input) {
    const { days } = z.object({ days: z.number().int().min(14).max(365).default(60) }).parse(input ?? {});
    const rows = await getStaleProducts(businessId, days);
    return {
      days,
      frozenValue: r2(rows.reduce((a, r) => a + r.frozenValue, 0)),
      count: rows.length,
      items: rows.slice(0, 25),
    };
  },
};

/** Runs one tool call. Errors come back as text so the model can recover or explain. */
export async function runAssistantTool(businessId: string, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const executor = EXECUTORS[name];
  if (!executor) return { content: `Unknown tool: ${name}`, isError: true };
  try {
    return { content: JSON.stringify(await executor(businessId, input)), isError: false };
  } catch (error) {
    if (error instanceof z.ZodError) return { content: `Invalid input: ${error.issues.map((i) => i.message).join("; ")}`, isError: true };
    console.error(`Assistant tool ${name} failed:`, error);
    return { content: "The lookup failed on the server.", isError: true };
  }
}
