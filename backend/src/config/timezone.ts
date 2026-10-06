/**
 * "Today", "this month" and every per-day chart bucket are the shop's own
 * calendar days, not UTC ones. Hosting (Vercel) runs in UTC while Bishkek is
 * UTC+6, so without this a sale at 02:00 local time landed on the previous
 * day — and on the 1st, in the previous month.
 *
 * Must be imported before anything creates a Date. Node picks up a TZ change
 * at runtime.
 */
process.env.TZ = process.env.APP_TIMEZONE?.trim() || "Asia/Bishkek";

export {};
