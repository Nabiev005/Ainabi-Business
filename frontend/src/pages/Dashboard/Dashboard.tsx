import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Banknote, PackageSearch, Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { KpiCard } from "../../components/ui/KpiCard";
import { Skeleton, SkeletonRows } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAuth } from "../../hooks/useAuth";
import { getGreeting } from "../../utils/greeting";
import { formatMoney, formatNumber } from "../../utils/format";
import { unitLabel } from "../../utils/format";
import * as dashboardService from "../../services/dashboard.service";
import * as productService from "../../services/product.service";
import type { DashboardRange, DashboardSummary, LowStockProduct, Product, SalesDynamicsPoint, TopProduct } from "../../types";
import "../../layouts/layout.css";
import { AlertsCard } from "./AlertsCard";

export default function Dashboard() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState<DashboardRange>("today");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [dynamics, setDynamics] = useState<SalesDynamicsPoint[] | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[] | null>(null);
  const [lowStock, setLowStock] = useState<LowStockProduct[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Lazy-loaded only once the "Складдагы товар" KPI card is opened — no
  // reason to fetch every product's exact quantity on every dashboard visit.
  const [allProducts, setAllProducts] = useState<Product[] | null>(null);

  function loadAllProducts() {
    if (allProducts) return;
    productService
      .listProducts({ status: "ACTIVE", pageSize: 100 })
      .then((res) => setAllProducts([...res.items].sort((a, b) => a.quantity - b.quantity)))
      .catch(() => setAllProducts([]));
  }

  const RANGE_OPTIONS: { value: DashboardRange; label: string }[] = [
    { value: "today", label: t("dashboard.range.today") },
    { value: "7d", label: t("dashboard.range.7d") },
    { value: "30d", label: t("dashboard.range.30d") },
    { value: "month", label: t("dashboard.range.month") },
  ];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      dashboardService.getDashboardSummary(range),
      dashboardService.getSalesDynamics(7),
      dashboardService.getTopProducts(range),
      dashboardService.getLowStock(),
    ])
      .then(([summaryRes, dynamicsRes, topRes, lowStockRes]) => {
        if (cancelled) return;
        setSummary(summaryRes);
        setDynamics(dynamicsRes);
        setTopProducts(topRes);
        setLowStock(lowStockRes);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {getGreeting()}, {session?.user.name.split(" ")[0]} 👋
          </h1>
          <p className="page-subtitle">{range === "today" ? t("dashboard.subtitleToday") : t("dashboard.subtitlePeriod")}</p>
        </div>
        <div className="tabs">
          {RANGE_OPTIONS.map((opt) => (
            <button key={opt.value} className={`tab ${range === opt.value ? "active" : ""}`} onClick={() => setRange(opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <AlertsCard />

      <div className="kpi-grid">
        {loading || !summary ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={132} radius="16px" />)
        ) : (
          <>
            <KpiCard index={0} label={t("dashboard.kpi.revenue")} value={formatMoney(summary.kpi.revenue.value)} changePercent={summary.kpi.revenue.changePercent} icon={Banknote} accent="primary" />
            <KpiCard index={1} label={t("dashboard.kpi.netProfit")} value={formatMoney(summary.kpi.netProfit.value)} changePercent={summary.kpi.netProfit.changePercent} icon={TrendingUp} accent="success" />
            <KpiCard
              index={2}
              label={t("dashboard.kpi.salesCount")}
              value={formatNumber(summary.kpi.salesCount.value)}
              changePercent={summary.kpi.salesCount.changePercent}
              icon={ShoppingBag}
              accent="primary"
              dropdown={<TopProductsDropdown t={t} topProducts={topProducts} />}
            />
            <KpiCard
              index={3}
              label={t("dashboard.kpi.avgCheck")}
              value={formatMoney(summary.kpi.avgCheck.value)}
              changePercent={summary.kpi.avgCheck.changePercent}
              icon={Receipt}
              accent="primary"
              dropdown={<TopProductsDropdown t={t} topProducts={topProducts} />}
            />
            <KpiCard
              index={4}
              label={t("dashboard.kpi.stockQuantity")}
              value={t("dashboard.kpi.stockUnit", { count: formatNumber(summary.kpi.stockQuantity.value) })}
              icon={PackageSearch}
              accent="warning"
              onOpen={loadAllProducts}
              dropdown={<StockDropdown t={t} products={allProducts} />}
            />
            <KpiCard index={5} label={t("dashboard.kpi.totalDebt")} value={formatMoney(summary.kpi.totalDebt.value)} icon={Wallet} accent="danger" />
          </>
        )}
      </div>

      <div className="dashboard-charts-grid">
        <div className="card animate-in" style={{ animationDelay: "0ms" }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">{t("dashboard.salesDynamics.title")}</h2>
              <p className="card-subtitle">{t("dashboard.salesDynamics.subtitle")}</p>
            </div>
          </div>
          <div className="card-pad" style={{ paddingTop: "var(--space-4)" }}>
            {loading || !dynamics ? (
              <Skeleton height={280} radius="12px" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dynamics} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} width={64} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip
                    formatter={(value: number) => formatMoney(value)}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)" }}
                  />
                  <Area type="monotone" dataKey="sales" name={t("dashboard.salesDynamics.seriesName")} stroke="var(--color-primary-600)" strokeWidth={2.5} fill="url(#salesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card animate-in" style={{ animationDelay: "60ms" }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">{t("dashboard.lowStock.title")}</h2>
              <p className="card-subtitle">{t("dashboard.lowStock.subtitle")}</p>
            </div>
          </div>
          {loading || !lowStock ? (
            <div className="card-pad">
              <SkeletonRows rows={4} height={48} />
            </div>
          ) : lowStock.length === 0 ? (
            <div className="card-pad">
              <EmptyState icon={<PackageSearch size={26} />} title={t("dashboard.lowStock.allGood")} subtitle={t("dashboard.lowStock.allGoodSubtitle")} />
            </div>
          ) : (
            <>
              <div>
                {lowStock.map((p) => (
                  <div className="low-stock-item" key={p.id}>
                    <div className="stack gap-1">
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                      <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                        {formatNumber(p.quantity)} {unitLabel(p.unit)} {t("dashboard.lowStock.left")}
                      </span>
                    </div>
                    <span className={`badge ${p.status === "OUT" ? "badge-danger pulse-danger" : "badge-warning"}`}>
                      <AlertTriangle size={12} />
                      {p.status === "OUT" ? t("dashboard.lowStock.out") : t("dashboard.lowStock.low")}
                    </span>
                  </div>
                ))}
              </div>
              <div className="card-pad" style={{ paddingTop: "var(--space-4)" }}>
                <button className="btn btn-secondary btn-block" onClick={() => navigate("/stock")}>
                  {t("dashboard.lowStock.goToStock")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="dashboard-bottom-grid">
        <div className="card animate-in" style={{ animationDelay: "120ms" }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">{t("dashboard.topProducts.title")}</h2>
              <p className="card-subtitle">{t("dashboard.topProducts.subtitle")}</p>
            </div>
          </div>
          {loading || !topProducts ? (
            <div className="card-pad">
              <SkeletonRows rows={4} height={40} />
            </div>
          ) : topProducts.length === 0 ? (
            <div className="card-pad">
              <EmptyState icon={<ShoppingBag size={26} />} title={t("dashboard.topProducts.empty")} subtitle={t("dashboard.topProducts.emptySubtitle")} />
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("dashboard.topProducts.product")}</th>
                    <th className="table-cell-num">{t("dashboard.topProducts.sold")}</th>
                    <th className="table-cell-num">{t("dashboard.topProducts.revenue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p) => (
                    <tr key={p.productId}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td className="table-cell-num">{formatNumber(p.soldQuantity)}</td>
                      <td className="table-cell-num">{formatMoney(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card animate-in" style={{ animationDelay: "180ms" }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">{t("dashboard.incomeExpense.title")}</h2>
              <p className="card-subtitle">{t("dashboard.incomeExpense.subtitle")}</p>
            </div>
          </div>
          <div className="card-pad" style={{ paddingTop: "var(--space-4)" }}>
            {loading || !dynamics ? (
              <Skeleton height={240} radius="12px" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dynamics} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} width={56} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip formatter={(value: number) => formatMoney(value)} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sales" name={t("dashboard.incomeExpense.income")} fill="var(--color-primary-500)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" name={t("dashboard.incomeExpense.expense")} fill="var(--color-danger-text)" radius={[6, 6, 0, 0]} opacity={0.75} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

/** "Складдагы товар" card's dropdown — exact remaining quantity for every
 * active product, lowest stock first so the most urgent ones surface. */
function StockDropdown({ t, products }: { t: TFn; products: Product[] | null }) {
  return (
    <>
      <div className="kpi-dropdown-header">{t("dashboard.stockDropdown.title")}</div>
      {products === null ? (
        <div style={{ padding: "var(--space-3) var(--space-4)" }}>
          <SkeletonRows rows={5} height={20} />
        </div>
      ) : products.length === 0 ? (
        <div className="kpi-dropdown-empty">{t("dashboard.stockDropdown.empty")}</div>
      ) : (
        products.map((p) => (
          <div className="kpi-dropdown-row" key={p.id}>
            <span className="kpi-dropdown-row-text">
              <span className="kpi-dropdown-row-name">{p.name}</span>
              <span className="kpi-dropdown-row-category">{p.categoryName ?? t("dashboard.stockDropdown.noCategory")}</span>
            </span>
            <span className="kpi-dropdown-row-value mono-num">
              {formatNumber(p.quantity)} {unitLabel(p.unit)}
            </span>
          </div>
        ))
      )}
    </>
  );
}

/** Shared by "Сатуулар" and "Орточо чек" — which products actually drove
 * those numbers, ranked by units sold (same data as the table below). */
function TopProductsDropdown({ t, topProducts }: { t: TFn; topProducts: TopProduct[] | null }) {
  return (
    <>
      <div className="kpi-dropdown-header">{t("dashboard.topProductsDropdown.title")}</div>
      {topProducts === null ? (
        <div style={{ padding: "var(--space-3) var(--space-4)" }}>
          <SkeletonRows rows={5} height={20} />
        </div>
      ) : topProducts.length === 0 ? (
        <div className="kpi-dropdown-empty">{t("dashboard.topProductsDropdown.empty")}</div>
      ) : (
        topProducts.map((p) => (
          <div className="kpi-dropdown-row" key={p.productId}>
            <span className="kpi-dropdown-row-text">
              <span className="kpi-dropdown-row-name">{p.name}</span>
              <span className="kpi-dropdown-row-category">{p.categoryName ?? t("dashboard.stockDropdown.noCategory")}</span>
            </span>
            <span className="kpi-dropdown-row-value mono-num">{formatNumber(p.soldQuantity)}</span>
          </div>
        ))
      )}
    </>
  );
}
