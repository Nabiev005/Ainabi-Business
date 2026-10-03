/**
 * Who can do what — the single source of truth for role access. Routes
 * guard with `requirePermission(...)`, and the session sends the caller's
 * permission list to the frontend so menus/buttons follow the same rules.
 *
 * Roles (UI names):
 *   OWNER      — Ээси / админ: the person who registered; everything.
 *   ADMIN      — Менеджер: runs the shop day to day; no employees/business settings.
 *   ACCOUNTANT — Бухгалтер: money side — reports, expenses, debts; no selling, no stock changes.
 *   CASHIER    — Сатуучу: POS, own cash shift, customers, repairs; never sees cost prices or profit.
 *   REGISTRAR  — Регистратор: checks and enters incoming goods — products, receiving, inventory, labels.
 */
export const ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER", "REGISTRAR"] as const;
export type Role = (typeof ROLES)[number];
/** Roles the owner can hand out (there is only ever one OWNER). */
export const ASSIGNABLE_ROLES = ["ADMIN", "ACCOUNTANT", "CASHIER", "REGISTRAR"] as const;

const ALL = ROLES;
const MANAGEMENT = ["OWNER", "ADMIN"] as const;
const FINANCE = ["OWNER", "ADMIN", "ACCOUNTANT"] as const;

export const PERMISSIONS = {
  // Dashboard KPIs, reports, CSV export — profit lives here.
  "reports.view": FINANCE,
  // Purchase price, profit, margin, stock value.
  "costs.view": ["OWNER", "ADMIN", "ACCOUNTANT", "REGISTRAR"],

  "pos.sell": ["OWNER", "ADMIN", "CASHIER"],
  "sales.view": ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
  "sales.return": MANAGEMENT,
  // The returns journal (what came back, why, how much was refunded).
  "returns.view": ["OWNER", "ACCOUNTANT", "REGISTRAR"],
  // Everyone else is capped at Business.maxDiscountPercent per receipt.
  "discounts.unlimited": MANAGEMENT,

  // Open/close one's own shift, cash in/out.
  "shifts.use": ["OWNER", "ADMIN", "CASHIER"],
  // See every employee's shifts (not just one's own), close anyone's.
  "shifts.viewAll": FINANCE,

  "repairs.manage": ["OWNER", "ADMIN", "CASHIER"],

  "products.view": ALL,
  "products.manage": ["OWNER", "ADMIN", "REGISTRAR"],

  // Movement history, stock summary, low-stock / reorder lists.
  "stock.view": ["OWNER", "ADMIN", "ACCOUNTANT", "REGISTRAR"],
  // Manual in/out, write-offs, transfers between branches.
  "stock.adjust": MANAGEMENT,
  // Slow movers: the seller sees what to push, the owner also sees the money tied up.
  "stock.stale": ["OWNER", "CASHIER"],
  "stock.receive": ["OWNER", "ADMIN", "REGISTRAR"],
  "stock.inventory": ["OWNER", "ADMIN", "REGISTRAR"],
  "labels.print": ["OWNER", "ADMIN", "REGISTRAR"],

  "customers.view": ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
  "customers.manage": ["OWNER", "ADMIN", "CASHIER"],
  // Deleting a customer unlinks them from their sales/warranties.
  "customers.delete": MANAGEMENT,

  "debts.view": ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],
  "debts.create": FINANCE,
  "debts.collect": ["OWNER", "ADMIN", "ACCOUNTANT", "CASHIER"],

  "suppliers.view": ["OWNER", "ADMIN", "ACCOUNTANT", "REGISTRAR"],
  "suppliers.manage": ["OWNER", "ADMIN", "REGISTRAR"],
  "suppliers.delete": MANAGEMENT,
  // Supplier debts and payments to them.
  "suppliers.finance": FINANCE,

  "expenses.view": FINANCE,
  "expenses.manage": FINANCE,

  "employees.manage": ["OWNER"],

  // Assign tasks to anyone and see everyone's tasks. Every role can see and
  // update the tasks assigned to itself without any permission.
  "tasks.manage": MANAGEMENT,
  // Team performance + full profit/loss statement.
  "analytics.view": MANAGEMENT,

  // Product pipeline (CRM-style board of stages).
  "pipeline.view": ["OWNER", "ADMIN", "ACCOUNTANT", "REGISTRAR"],
  "pipeline.move": ["OWNER", "ADMIN", "REGISTRAR"],
  // Add / rename / reorder / delete the stages themselves.
  "pipeline.configure": MANAGEMENT,

  "settings.business": ["OWNER"],
  "settings.products": MANAGEMENT,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(role, p));
}
