/**
 * Installment plans (насыя / бөлүп төлөө) — pure date and money math, no
 * database, so it's unit-tested.
 *
 * Payments aren't tied to a particular installment: whatever has been paid
 * on the debt covers the installments in date order. That keeps the plan
 * correct however the customer pays (early, partly, all at once).
 */

export interface Installment {
  dueDate: string; // "YYYY-MM-DD"
  amount: number;
}

export type InstallmentState = "PAID" | "PARTIAL" | "OVERDUE" | "DUE_SOON" | "UPCOMING";

/** Due within this many days (today included) counts as "remind now". */
export const DUE_SOON_DAYS = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "2026-01-31" + 1 month = "2026-02-28" (clamped to the month's last day). */
export function addMonthsToDay(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay)));
  return date.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` ("YYYY-MM-DD"); positive when b is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Splits `total` into `count` payments, one every `intervalMonths` from
 * `firstDueDate`. Parts are whole som; the last one takes the remainder so
 * the plan always adds up to the total exactly.
 */
export function buildSchedule(total: number, count: number, firstDueDate: string, intervalMonths = 1): Installment[] {
  const part = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => ({
    dueDate: addMonthsToDay(firstDueDate, i * intervalMonths),
    amount: i === count - 1 ? round2(total - part * (count - 1)) : part,
  }));
}

export interface ScheduleStatus {
  items: (Installment & { paid: number; state: InstallmentState })[];
  /** The earliest installment not fully paid. */
  next: { dueDate: string; amount: number } | null;
  /** Sum still unpaid on installments whose date has passed. */
  overdueAmount: number;
  /** Days since the oldest unpaid due date (0 when nothing is overdue). */
  daysOverdue: number;
}

export function scheduleStatus(installments: Installment[], paidAmount: number, today: string): ScheduleStatus {
  let covered = paidAmount;
  let overdueAmount = 0;
  let daysOverdue = 0;
  let next: ScheduleStatus["next"] = null;

  const items = [...installments]
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
    .map((inst) => {
      const paid = round2(Math.min(inst.amount, Math.max(0, covered)));
      covered = round2(covered - paid);
      const left = round2(inst.amount - paid);
      let state: InstallmentState;
      if (left <= 0) state = "PAID";
      else if (inst.dueDate < today) {
        state = "OVERDUE";
        overdueAmount = round2(overdueAmount + left);
        daysOverdue = Math.max(daysOverdue, daysBetween(inst.dueDate, today));
      } else if (daysBetween(today, inst.dueDate) < DUE_SOON_DAYS) state = "DUE_SOON";
      else state = paid > 0 ? "PARTIAL" : "UPCOMING";
      if (left > 0 && !next) next = { dueDate: inst.dueDate, amount: left };
      return { ...inst, paid, state };
    });

  return { items, next, overdueAmount, daysOverdue };
}

/** Should the owner nudge this customer today? */
export function needsReminder(status: ScheduleStatus, today: string): boolean {
  if (status.overdueAmount > 0) return true;
  return !!status.next && daysBetween(today, status.next.dueDate) < DUE_SOON_DAYS;
}
