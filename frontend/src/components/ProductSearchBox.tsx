import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanBarcode } from "lucide-react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import * as productService from "../services/product.service";
import { formatMoney, formatNumber, unitLabel } from "../utils/format";
import type { Product, ScanInfo } from "../types";

interface ProductSearchBoxProps {
  onPick: (product: Product, scan: ScanInfo | null) => void;
  /** Show this branch's stock in the results. */
  locationId?: string;
  placeholder?: string;
  /** Called when Enter is pressed on a code nothing matched. */
  onNotFound?: (code: string) => void;
  autoFocus?: boolean;
}

/**
 * One box for both ways of finding a product: type to search (name, SKU,
 * barcode, attributes) and pick from the list, or scan — a scanner "types"
 * the code and presses Enter, which resolves product / package / scale
 * barcodes exactly.
 */
export function ProductSearchBox({ onPick, locationId, placeholder, onNotFound, autoFocus }: ProductSearchBoxProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query, 250);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!debounced.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    productService
      .listProducts({ search: debounced.trim(), status: "ACTIVE", pageSize: 8, locationId })
      .then((res) => {
        if (!cancelled) {
          setResults(res.items);
          setActive(0);
        }
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, locationId]);

  function pick(product: Product, scan: ScanInfo | null) {
    onPick(product, scan);
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  async function handleEnter() {
    const code = query.trim();
    if (!code) return;
    // Exact barcode first (covers packages and scale labels) …
    try {
      const scanned = await productService.findByBarcode(code, locationId);
      const { scan, ...product } = scanned;
      pick(product, scan);
      return;
    } catch {
      // … otherwise take the highlighted search result, if any.
    }
    if (results[active]) pick(results[active], null);
    else onNotFound?.(code);
  }

  return (
    <div className="product-search" ref={rootRef}>
      <div className="input-with-icon">
        <ScanBarcode size={16} />
        <input
          ref={inputRef}
          className="input"
          autoFocus={autoFocus}
          placeholder={placeholder ?? t("productSearch.placeholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              handleEnter();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </div>
      {open && query.trim() && (
        <div className="product-search-results">
          {loading && results.length === 0 ? (
            <div className="product-search-empty">{t("header.searching")}</div>
          ) : results.length === 0 ? (
            <div className="product-search-empty">{t("productSearch.noResults")}</div>
          ) : (
            results.map((p, index) => (
              <button
                type="button"
                key={p.id}
                className={`product-search-item ${index === active ? "active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(p, null)}
              >
                <span className="product-search-item-name">{p.name}</span>
                <span className="product-search-item-meta">
                  {formatNumber(p.locationQuantity ?? p.quantity)} {unitLabel(p.unit)} · {formatMoney(p.salePrice)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
