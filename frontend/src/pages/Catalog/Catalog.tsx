import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Minus, Package, Phone, Plus, Search, ShoppingBag, X } from "lucide-react";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as catalogService from "../../services/catalog.service";
import type { PublicCatalog } from "../../services/catalog.service";
import { formatMoney } from "../../utils/format";
import { whatsappLink } from "../../utils/whatsapp";
import "./Catalog.css";

type Item = PublicCatalog["items"][number];

/** The shop window a customer opens from Instagram: browse, fill a bag, send the order on WhatsApp. */
export default function Catalog() {
  const { slug = "" } = useParams();
  const { t } = useTranslation();
  const [data, setData] = useState<PublicCatalog | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [bag, setBag] = useState<Map<string, { item: Item; qty: number }>>(new Map());
  const [bagOpen, setBagOpen] = useState(false);
  const debounced = useDebouncedValue(search, 350);

  useEffect(() => {
    setPage(1);
  }, [debounced, categoryId]);

  useEffect(() => {
    let cancelled = false;
    catalogService
      .getPublicCatalog(slug, { search: debounced || undefined, categoryId, page })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setItems((prev) => (page === 1 ? d.items : [...prev, ...d.items]));
        document.title = d.shop.name;
      })
      .catch(() => !cancelled && setNotFound(true));
    return () => {
      cancelled = true;
    };
  }, [slug, debounced, categoryId, page]);

  const bagList = [...bag.values()];
  const bagCount = bagList.reduce((s, l) => s + l.qty, 0);
  const bagTotal = bagList.reduce((s, l) => s + l.qty * l.item.price, 0);

  function change(item: Item, delta: number) {
    setBag((prev) => {
      const next = new Map(prev);
      const qty = (next.get(item.id)?.qty ?? 0) + delta;
      if (qty <= 0) next.delete(item.id);
      else next.set(item.id, { item, qty: item.quantity !== null ? Math.min(qty, item.quantity) : qty });
      return next;
    });
  }

  const orderLink = useMemo(() => {
    if (!data?.shop.whatsapp || bagList.length === 0) return null;
    const lines = [
      t("catalog.orderGreeting", { shop: data.shop.name }),
      ...bagList.map((l) => `• ${l.item.name} × ${l.qty} = ${formatMoney(l.item.price * l.qty)}`),
      t("catalog.orderTotal", { total: formatMoney(bagTotal) }),
    ];
    return whatsappLink(data.shop.whatsapp, lines.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, bag, t]);

  if (notFound) {
    return (
      <div className="catalog-page catalog-missing">
        <Package size={40} />
        <h1>{t("catalog.notFound")}</h1>
      </div>
    );
  }

  return (
    <div className="catalog-page">
      <header className="catalog-header">
        <div className="catalog-header-inner">
          <div className="stack" style={{ minWidth: 0 }}>
            <h1 className="catalog-shop">{data?.shop.name ?? "…"}</h1>
            <div className="catalog-meta">
              {data?.shop.address && (
                <span>
                  <MapPin size={13} /> {data.shop.address}
                </span>
              )}
              {data?.shop.phone && (
                <a href={`tel:${data.shop.phone}`}>
                  <Phone size={13} /> {data.shop.phone}
                </a>
              )}
            </div>
          </div>
          <LanguageSwitcher />
        </div>
        {data?.shop.note && <p className="catalog-note">{data.shop.note}</p>}
        <div className="catalog-search">
          <Search size={16} />
          <input placeholder={t("catalog.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {data && data.categories.length > 1 && (
          <div className="catalog-chips">
            <button className={!categoryId ? "active" : ""} onClick={() => setCategoryId(undefined)}>
              {t("catalog.all")}
            </button>
            {data.categories.map((c) => (
              <button key={c.id} className={categoryId === c.id ? "active" : ""} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="catalog-grid">
        {items.map((item) => {
          const inBag = bag.get(item.id)?.qty ?? 0;
          return (
            <div key={item.id} className="catalog-card">
              <div className="catalog-photo">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" /> : <Package size={28} />}</div>
              <div className="catalog-card-body">
                <span className="catalog-name">{item.name}</span>
                {item.category && <span className="catalog-cat">{item.category}</span>}
                <span className="catalog-price">{formatMoney(item.price)}</span>
                {item.quantity !== null && <span className="catalog-cat">{t("catalog.inStock", { count: item.quantity })}</span>}
                {inBag === 0 ? (
                  <button className="catalog-add" onClick={() => change(item, 1)}>
                    <Plus size={14} /> {t("catalog.add")}
                  </button>
                ) : (
                  <div className="catalog-qty">
                    <button onClick={() => change(item, -1)} aria-label="-">
                      <Minus size={14} />
                    </button>
                    <span>{inBag}</span>
                    <button onClick={() => change(item, 1)} aria-label="+">
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </main>

      {data && items.length === 0 && <p className="catalog-empty">{t("catalog.empty")}</p>}
      {data && page < data.totalPages && (
        <div className="catalog-more">
          <button onClick={() => setPage((p) => p + 1)}>{t("catalog.more")}</button>
        </div>
      )}

      {bagCount > 0 && (
        <button className="catalog-bagbar" onClick={() => setBagOpen(true)}>
          <ShoppingBag size={18} /> {t("catalog.bag", { count: bagCount })} · {formatMoney(bagTotal)}
        </button>
      )}

      {bagOpen && (
        <div className="catalog-sheet-backdrop" onClick={() => setBagOpen(false)}>
          <div className="catalog-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{t("catalog.bagTitle")}</strong>
              <button className="catalog-icon" onClick={() => setBagOpen(false)} aria-label="close">
                <X size={18} />
              </button>
            </div>
            {bagList.map((l) => (
              <div key={l.item.id} className="catalog-bagline">
                <span>{l.item.name}</span>
                <div className="catalog-qty">
                  <button onClick={() => change(l.item, -1)}>
                    <Minus size={14} />
                  </button>
                  <span>{l.qty}</span>
                  <button onClick={() => change(l.item, 1)}>
                    <Plus size={14} />
                  </button>
                </div>
                <strong>{formatMoney(l.item.price * l.qty)}</strong>
              </div>
            ))}
            <div className="catalog-bagline">
              <strong>{t("catalog.total")}</strong>
              <span />
              <strong>{formatMoney(bagTotal)}</strong>
            </div>
            {orderLink ? (
              <a className="catalog-order" href={orderLink} target="_blank" rel="noreferrer">
                {t("catalog.order")}
              </a>
            ) : (
              data?.shop.phone && (
                <a className="catalog-order" href={`tel:${data.shop.phone}`}>
                  <Phone size={16} /> {t("catalog.call")}
                </a>
              )
            )}
          </div>
        </div>
      )}

      <footer className="catalog-footer">{t("catalog.poweredBy")}</footer>
    </div>
  );
}
