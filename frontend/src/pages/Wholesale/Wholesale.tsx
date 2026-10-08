import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Handshake, MapPin, Search, Store } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { usePermissions } from "../../hooks/usePermissions";
import { useToast } from "../../hooks/useToast";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as wholesaleService from "../../services/wholesale.service";
import type { WholesaleOrder, WholesaleSupplier } from "../../services/wholesale.service";
import { extractErrorMessage } from "../../services/api";
import { formatDateTime, formatMoney } from "../../utils/format";
import { SupplierShop } from "./SupplierShop";
import { OrderModal, STATUS_BADGE } from "./OrderModal";
import "./Wholesale.css";

type Tab = "suppliers" | "buying" | "selling";

export default function Wholesale() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const { showToast } = useToast();
  const canBuy = can("wholesale.buy");
  const canSell = can("wholesale.sell");
  const [tab, setTab] = useState<Tab>(canBuy ? "suppliers" : "selling");
  const [suppliers, setSuppliers] = useState<WholesaleSupplier[] | null>(null);
  const [search, setSearch] = useState("");
  const [shop, setShop] = useState<WholesaleSupplier | null>(null);
  const [orders, setOrders] = useState<WholesaleOrder[] | null>(null);
  const [open, setOpen] = useState<WholesaleOrder | null>(null);
  const debounced = useDebouncedValue(search, 350);

  useEffect(() => {
    if (tab !== "suppliers") return;
    setSuppliers(null);
    wholesaleService
      .listSuppliers(debounced || undefined)
      .then(setSuppliers)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [tab, debounced, showToast, t]);

  const loadOrders = useCallback(() => {
    if (tab === "suppliers") return;
    setOrders(null);
    wholesaleService
      .listOrders(tab === "buying" ? "BUYER" : "SELLER")
      .then(setOrders)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [tab, showToast, t]);

  useEffect(loadOrders, [loadOrders]);

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("wholesale.title")}</h1>
          <p className="page-subtitle">{t("wholesale.subtitle")}</p>
        </div>
      </div>

      <div className="card card-pad">
        <div className="tabs">
          {canBuy && (
            <button className={`tab ${tab === "suppliers" ? "active" : ""}`} onClick={() => { setTab("suppliers"); setShop(null); }}>
              {t("wholesale.tabs.suppliers")}
            </button>
          )}
          {canBuy && (
            <button className={`tab ${tab === "buying" ? "active" : ""}`} onClick={() => setTab("buying")}>
              {t("wholesale.tabs.buying")}
            </button>
          )}
          {canSell && (
            <button className={`tab ${tab === "selling" ? "active" : ""}`} onClick={() => setTab("selling")}>
              {t("wholesale.tabs.selling")}
            </button>
          )}
        </div>
      </div>

      {tab === "suppliers" &&
        (shop ? (
          <SupplierShop supplier={shop} onBack={() => setShop(null)} onOrdered={() => { setShop(null); setTab("buying"); }} />
        ) : (
          <div className="stack gap-4">
            <div className="input-with-icon" style={{ maxWidth: 420 }}>
              <Search size={16} />
              <input className="input" placeholder={t("wholesale.searchSuppliers")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {suppliers === null ? null : suppliers.length === 0 ? (
              <div className="card card-pad">
                <EmptyState icon={<Handshake size={26} />} title={t("wholesale.noSuppliers")} subtitle={t("wholesale.noSuppliersSubtitle")} />
              </div>
            ) : (
              <div className="wholesale-suppliers">
                {suppliers.map((s) => (
                  <button key={s.id} className="card card-pad card-hoverable wholesale-supplier" onClick={() => setShop(s)}>
                    <div className="row gap-2">
                      <Store size={18} />
                      <strong>{s.name}</strong>
                    </div>
                    {s.address && (
                      <span className="text-muted row gap-1" style={{ fontSize: "var(--font-size-xs)" }}>
                        <MapPin size={12} /> {s.address}
                      </span>
                    )}
                    {s.note && <span style={{ fontSize: "var(--font-size-sm)" }}>{s.note}</span>}
                    <Badge variant="info">{t("wholesale.productsCount", { count: s.productsCount })}</Badge>
                  </button>
                ))}
              </div>
            )}
            {can("settings.business") && (
              <p className="field-hint">
                {t("wholesale.becomeSeller")} <Link to="/settings">{t("nav.settings")}</Link>
              </p>
            )}
          </div>
        ))}

      {tab !== "suppliers" && (
        <div className="card">
          {orders === null ? null : orders.length === 0 ? (
            <div className="card-pad">
              <EmptyState icon={<Handshake size={26} />} title={t("wholesale.noOrders")} subtitle={tab === "selling" ? t("wholesale.noIncomingSubtitle") : t("wholesale.noOrdersSubtitle")} />
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("wholesale.table.date")}</th>
                    <th>{tab === "selling" ? t("wholesale.table.buyer") : t("wholesale.table.seller")}</th>
                    <th className="table-cell-num">{t("wholesale.table.items")}</th>
                    <th className="table-cell-num">{t("wholesale.total")}</th>
                    <th>{t("wholesale.table.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="table-row-clickable" onClick={() => setOpen(o)} style={{ cursor: "pointer" }}>
                      <td className="text-muted">{formatDateTime(o.createdAt)}</td>
                      <td style={{ fontWeight: 700 }}>{tab === "selling" ? o.buyer.name : o.seller.name}</td>
                      <td className="table-cell-num">{o.items.length}</td>
                      <td className="table-cell-num mono-num">{formatMoney(o.total)}</td>
                      <td>
                        <Badge variant={STATUS_BADGE[o.status]}>{t(`wholesale.status.${o.status}`)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <OrderModal
        order={open}
        onClose={() => setOpen(null)}
        onChanged={(o) => {
          setOpen(o);
          setOrders((list) => list?.map((x) => (x.id === o.id ? o : x)) ?? null);
        }}
      />
    </div>
  );
}
