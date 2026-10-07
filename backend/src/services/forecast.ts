import { round2 } from "../utils/money";
import { dayKey } from "../utils/dateRange";

/**
 * Month-end forecast — pure math, no database, so it can be unit-tested.
 *
 * Pace = average revenue per finished day of this month (today is still
 * going and would drag the average down in the morning). In the first days
 * of a month there's too little of it, so the last two weeks are used.
 *
 * Shops sell unevenly through the week (weekends are often double), so with
 * enough history each weekday gets a factor: its average over the last eight
 * weeks divided by the overall average. The pace is measured with those
 * factors taken out, and each remaining day is projected as pace × its
 * weekday's factor. Today counts as at least what's expected of it.
 */

export interface DayRow {
  date: string;
  revenue: number;
  profit: number;
}

/** With fewer finished days than this in the month, the pace comes from the last two weeks instead. */
export const MIN_MONTH_DAYS_FOR_PACE = 3;
export const RECENT_PACE_DAYS = 14;
/** How far back weekday factors look, and how much of it must exist to use them. */
export const WEEKDAY_HISTORY_DAYS = 56;
const MIN_WEEKDAY_HISTORY_DAYS = 28;
const MAX_WEEKDAY_FACTOR = 3;

type Key = "revenue" | "profit";

const weekdayOf = (date: string) => new Date(`${date}T00:00:00`).getDay();
const sum = (rows: DayRow[], key: Key) => rows.reduce((acc, d) => acc + d[key], 0);

/** Revenue factor per weekday (Sunday = 0); all 1 when there isn't enough history. */
export function weekdayFactors(history: DayRow[]): number[] {
  const flat = Array<number>(7).fill(1);
  if (history.length < MIN_WEEKDAY_HISTORY_DAYS) return flat;
  const overall = sum(history, "revenue") / history.length;
  if (overall <= 0) return flat;
  return flat.map((_, weekday) => {
    const rows = history.filter((d) => weekdayOf(d.date) === weekday);
    if (rows.length === 0) return 1;
    return Math.min(MAX_WEEKDAY_FACTOR, Math.max(0, sum(rows, "revenue") / rows.length / overall));
  });
}

/** Average of `key` per day with the weekday effect removed (days whose weekday never sells are skipped). */
function deseasonalizedAverage(rows: DayRow[], key: Key, factors: number[]): number | null {
  const usable = rows.filter((d) => factors[weekdayOf(d.date)] > 0);
  if (usable.length === 0) return null;
  return usable.reduce((acc, d) => acc + d[key] / factors[weekdayOf(d.date)], 0) / usable.length;
}

export interface ProjectMonthInput {
  /** Every calendar day from at least WEEKDAY_HISTORY_DAYS ago up to and including today. */
  days: DayRow[];
  now: Date;
  plan: number | null;
}

export function projectMonth({ days, now, plan }: ProjectMonthInput) {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();
  const todayKey = dayKey(now);
  const monthKey = todayKey.slice(0, 7);

  const past = days.filter((d) => d.date < todayKey);
  const monthDays = days.filter((d) => d.date.startsWith(monthKey));
  const todayRow = monthDays.find((d) => d.date === todayKey) ?? { date: todayKey, revenue: 0, profit: 0 };
  const finished = monthDays.filter((d) => d.date < todayKey);
  const useRecent = finished.length < MIN_MONTH_DAYS_FOR_PACE;
  const paceDays = useRecent ? past.slice(-RECENT_PACE_DAYS) : finished;

  const factors = weekdayFactors(past.slice(-WEEKDAY_HISTORY_DAYS));
  const weekdayAdjusted = factors.some((f) => f !== 1);
  const pace = (key: Key) => deseasonalizedAverage(paceDays, key, factors) ?? todayRow[key];
  const revenuePace = pace("revenue");
  const profitPace = pace("profit");
  const expected = (date: string, key: Key) => (key === "revenue" ? revenuePace : profitPace) * factors[weekdayOf(date)];

  const actual = sum(finished, "revenue") + todayRow.revenue;
  const actualProfit = sum(finished, "profit") + todayRow.profit;

  // Running total for the chart: actual up to today, then the projected path.
  // Today carries both so the two lines meet.
  const cumulative: { date: string; actual: number | null; forecast: number | null }[] = [];
  let running = 0;
  let projected = 0;
  let projectedProfit = sum(finished, "profit");
  for (let d = 1; d <= daysInMonth; d++) {
    const date = dayKey(new Date(now.getFullYear(), now.getMonth(), d));
    if (d < today) {
      running += finished.find((x) => x.date === date)?.revenue ?? 0;
      cumulative.push({ date, actual: round2(running), forecast: null });
    } else if (d === today) {
      projected = running + Math.max(todayRow.revenue, expected(date, "revenue"));
      projectedProfit += Math.max(todayRow.profit, expected(date, "profit"));
      running += todayRow.revenue;
      cumulative.push({ date, actual: round2(running), forecast: round2(projected) });
    } else {
      projected += expected(date, "revenue");
      projectedProfit += expected(date, "profit");
      cumulative.push({ date, actual: null, forecast: round2(projected) });
    }
  }

  const percentOf = (value: number) => (plan ? Math.round((value / plan) * 1000) / 10 : null);
  const daysLeft = daysInMonth - today + 1;

  return {
    month: monthKey,
    plan,
    daysInMonth,
    daysElapsed: today,
    basis: useRecent ? ("recent" as const) : ("month" as const),
    weekdayAdjusted,
    actual: round2(actual),
    actualProfit: round2(actualProfit),
    // A typical day at the current pace (weekday effect averaged out).
    avgDaily: round2(revenuePace),
    forecast: round2(projected),
    forecastProfit: round2(projectedProfit),
    actualPercent: percentOf(actual),
    forecastPercent: percentOf(projected),
    // What each remaining day (today included) must bring to hit the plan.
    neededPerDay: plan === null ? null : round2(Math.max(0, plan - actual) / daysLeft),
    cumulative,
  };
}
