import type { TFunction } from "i18next";
import type { Cell, Row, SheetData } from "write-excel-file";
import type { ReportData } from "../../services/report.service";

const MONEY = "#,##0.00";
const header = (value: string): Cell => ({ value, fontWeight: "bold", backgroundColor: "#eff6ff", borderStyle: "thin", borderColor: "#bfdbfe" });
const text = (value: string): Cell => ({ value, type: String });
const money = (value: number): Cell => ({ value, type: Number, format: MONEY });
const count = (value: number): Cell => ({ value, type: Number });
/** "YYYY-MM-DD" → a real Excel date (sortable, filterable). Excel dates have no
 * timezone and the library writes the UTC day, so it must be UTC midnight. */
const day = (value: string): Cell => ({ value: new Date(`${value}T00:00:00Z`), type: Date, format: "dd.mm.yyyy" });

/** ISO timestamp → the viewer's calendar day ("YYYY-MM-DD"). */
function localDay(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The report as a real .xlsx — three sheets (summary, products, days) with
 * numbers as numbers, so the owner can sum and filter in Excel. Built from
 * the data already on screen; the library is loaded only on click.
 */
export async function downloadReportXlsx(report: ReportData, t: TFunction) {
  const { default: writeXlsxFile } = await import("write-excel-file");
  const s = report.summary;
  const from = localDay(report.range.from);
  const to = localDay(report.range.to);

  const summary: SheetData = [
    [header(t("reports.xlsx.period")), text(`${from} — ${to}`)],
    [header(t("reports.kpi.totalSales")), money(s.totalSales)],
    [header(t("reports.kpi.totalReturns")), money(s.totalReturns)],
    [header(t("reports.kpi.totalCogs")), money(s.totalCogs)],
    [header(t("reports.xlsx.grossProfit")), money(s.grossProfit)],
    [header(t("reports.xlsx.repairRevenue")), money(s.repairRevenue)],
    [header(t("reports.kpi.totalExpenses")), money(s.totalExpenses)],
    [header(t("reports.kpi.netProfit")), { ...money(s.netProfit), fontWeight: "bold" }],
    [header(t("reports.kpi.salesCount")), count(s.salesCount)],
    [header(t("reports.kpi.avgCheck")), money(s.avgCheck)],
    [header(t("reports.xlsx.discounts")), money(s.totalDiscount)],
  ];

  const products: SheetData = [
    [header(t("reports.table.product")), header(t("reports.table.sold")), header(t("reports.table.revenue")), header(t("reports.table.profit"))],
    ...report.productPerformance.map((p): Row => [text(p.name), count(p.quantitySold), money(p.revenue), money(p.profit)]),
  ];

  const days: SheetData = [
    [header(t("reports.xlsx.date")), header(t("reports.sales")), header(t("reports.expense"))],
    ...report.series.map((d): Row => [day(d.date), money(d.sales), money(d.expenses)]),
  ];

  await writeXlsxFile([summary, products, days], {
    sheets: [t("reports.xlsx.sheetSummary"), t("reports.xlsx.sheetProducts"), t("reports.xlsx.sheetDays")],
    columns: [[{ width: 28 }, { width: 22 }], [{ width: 40 }, { width: 12 }, { width: 16 }, { width: 16 }], [{ width: 14 }, { width: 16 }, { width: 16 }]],
    fileName: `ainabi-report-${from}_${to}.xlsx`,
  });
}
