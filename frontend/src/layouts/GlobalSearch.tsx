import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Package, Search, ShieldCheck, User, X } from "lucide-react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import * as productService from "../services/product.service";
import * as customerService from "../services/customer.service";
import * as saleService from "../services/sale.service";
import { useAuth } from "../hooks/useAuth";
import { formatDate, formatMoney } from "../utils/format";
import type { Customer, Product, SerialLookupResult } from "../types";

export function GlobalSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [serialHits, setSerialHits] = useState<SerialLookupResult[]>([]);
  const { session } = useAuth();
  const trackSerials = !!session?.business.trackSerials;
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setProducts([]);
      setCustomers([]);
      setSerialHits([]);
      return;
    }
    setLoading(true);
    // IMEI/serial lookup only for shops that track them, and only once the
    // query is long enough to plausibly be a serial number.
    const lookupSerial = trackSerials && debouncedQuery.trim().length >= 4;
    Promise.all([
      productService.listProducts({ search: debouncedQuery, pageSize: 5 }).then((r) => r.items),
      customerService.listCustomers(debouncedQuery).then((r) => r.slice(0, 5)),
      lookupSerial ? saleService.findBySerial(debouncedQuery.trim()).catch(() => []) : Promise.resolve([]),
    ])
      .then(([p, c, s]) => {
        setProducts(p);
        setCustomers(c);
        setSerialHits(s);
      })
      .finally(() => setLoading(false));
  }, [debouncedQuery, trackSerials]);

  const hasResults = products.length > 0 || customers.length > 0 || serialHits.length > 0;

  function goToSerialHit(hit: SerialLookupResult) {
    setOpen(false);
    setQuery("");
    navigate(hit.customer ? `/customers/${hit.customer.id}` : `/products?q=${encodeURIComponent(hit.productName)}`);
  }

  function goToProduct(p: Product) {
    setOpen(false);
    setQuery("");
    navigate(`/products?q=${encodeURIComponent(p.name)}`);
  }

  function goToCustomer(c: Customer) {
    setOpen(false);
    setQuery("");
    navigate(`/customers/${c.id}`);
  }

  return (
    <div className="header-search" ref={rootRef}>
      <Search size={16} />
      <input
        placeholder={t("header.searchPlaceholder")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => query && setOpen(true)}
      />
      {query && (
        <button
          className="header-search-clear"
          aria-label={t("header.searchClear")}
          onClick={() => {
            setQuery("");
            setProducts([]);
            setCustomers([]);
            setSerialHits([]);
          }}
        >
          <X size={14} />
        </button>
      )}

      {open && query && (
        <div className="header-search-results card animate-in">
          {loading ? (
            <div className="header-search-empty">{t("header.searching")}</div>
          ) : !hasResults ? (
            <div className="header-search-empty">{t("header.noResults")}</div>
          ) : (
            <>
              {serialHits.length > 0 && (
                <div className="header-search-group">
                  <span className="header-search-group-label">{t("header.serialSales")}</span>
                  {serialHits.map((hit) => {
                    const warrantyActive = !!hit.warrantyUntil && new Date(hit.warrantyUntil) >= new Date();
                    return (
                      <button key={`${hit.saleId}-${hit.serial}`} className="header-search-item" onClick={() => goToSerialHit(hit)}>
                        <ShieldCheck size={15} />
                        <span className="header-search-item-name">
                          {hit.productName}
                          <span className="text-muted" style={{ display: "block", fontSize: "var(--font-size-xs)" }}>
                            {t("header.serialSoldOn", { date: formatDate(hit.soldAt) })}
                            {hit.customer ? ` · ${hit.customer.name}` : ""}
                          </span>
                        </span>
                        {hit.warrantyUntil && (
                          <span className={`badge ${warrantyActive ? "badge-success" : "badge-neutral"}`}>
                            {warrantyActive
                              ? t("header.warrantyUntil", { date: formatDate(hit.warrantyUntil) })
                              : t("header.warrantyExpired")}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {products.length > 0 && (
                <div className="header-search-group">
                  <span className="header-search-group-label">{t("header.products")}</span>
                  {products.map((p) => (
                    <button key={p.id} className="header-search-item" onClick={() => goToProduct(p)}>
                      <Package size={15} />
                      <span className="header-search-item-name">{p.name}</span>
                      <span className="text-muted mono-num" style={{ fontSize: "var(--font-size-xs)" }}>
                        {formatMoney(p.salePrice)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {customers.length > 0 && (
                <div className="header-search-group">
                  <span className="header-search-group-label">{t("header.customers")}</span>
                  {customers.map((c) => (
                    <button key={c.id} className="header-search-item" onClick={() => goToCustomer(c)}>
                      <User size={15} />
                      <span className="header-search-item-name">{c.name}</span>
                      {c.phone && (
                        <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                          {c.phone}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
