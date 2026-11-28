import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ScanLine, TrendingUp } from "lucide-react";
import { formatMoney } from "../../utils/format";

/** Today's figures the scene counts up to. */
const REVENUE = 48_750;
const CHECKS = 37;
/** Last 7 days, as a share of the best day. */
const WEEK = [0.46, 0.62, 0.55, 0.78, 0.7, 0.88, 1];
const RECEIPT = [
  { key: "phone", price: 42_000 },
  { key: "case", price: 1_200 },
  { key: "charger", price: 1_800 },
];

/** A QR-looking 11x11 grid: three corner squares plus fixed pseudo-random dots. */
const QR_SIZE = 11;
const QR = Array.from({ length: QR_SIZE * QR_SIZE }, (_, i) => {
  const x = i % QR_SIZE;
  const y = Math.floor(i / QR_SIZE);
  const finder = (fx: number, fy: number) => {
    const dx = x - fx;
    const dy = y - fy;
    if (dx < 0 || dy < 0 || dx > 2 || dy > 2) return null;
    return true;
  };
  const corner = finder(0, 0) ?? finder(QR_SIZE - 3, 0) ?? finder(0, QR_SIZE - 3);
  if (corner !== null) return corner;
  if ((x === 3 && y < 4) || (y === 3 && x < 4) || (x === QR_SIZE - 4 && y < 4) || (y === 3 && x > QR_SIZE - 5) || (x === 3 && y > QR_SIZE - 5) || (y === QR_SIZE - 4 && x < 4)) return false;
  return (x * 7 + y * 13 + x * y) % 5 < 2;
});

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The hero picture, built from the product's own pieces: the dashboard,
 * the till on a phone and the printed receipt, set in 3D. It plays once on
 * load (screen settles, receipt prints, today's takings count up) and then
 * only leans a little toward the pointer. Decorative, so hidden from screen readers.
 */
export function HeroScene() {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [revenue, setRevenue] = useState(() => (reducedMotion() ? REVENUE : 0));

  // Count today's takings up once, after the screen has settled.
  useEffect(() => {
    if (reducedMotion()) return;
    let frame = 0;
    const start = performance.now() + 700;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 1600));
      setRevenue(Math.round(REVENUE * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Lean toward the pointer (desktop only; touch screens keep the resting angle).
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, (e.clientX - (box.left + box.width / 2)) / (box.width / 1.2)));
        const y = Math.max(-1, Math.min(1, (e.clientY - (box.top + box.height / 2)) / (box.height / 1.2)));
        el.style.setProperty("--lean-x", x.toFixed(3));
        el.style.setProperty("--lean-y", y.toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  const receiptTotal = RECEIPT.reduce((s, r) => s + r.price, 0);

  return (
    <div className="hs" ref={ref} aria-hidden="true">
      <div className="hs-floor" />
      <div className="hs-stage">
        {/* Dashboard */}
        <div className="hs-panel">
          <div className="hs-panel-bar">
            <span />
            <span />
            <span />
            <strong>{t("landing.scene.dashboard")}</strong>
          </div>
          <div className="hs-panel-body">
            <div className="hs-kpis">
              <div className="hs-kpi hs-kpi-main">
                <small>{t("landing.scene.today")}</small>
                <strong>{formatMoney(revenue)}</strong>
                <em>
                  <TrendingUp size={12} /> {t("landing.scene.growth")}
                </em>
              </div>
              <div className="hs-kpi">
                <small>{t("landing.scene.checks")}</small>
                <strong>{CHECKS}</strong>
              </div>
              <div className="hs-kpi">
                <small>{t("landing.scene.profit")}</small>
                <strong>{formatMoney(Math.round(revenue * 0.27))}</strong>
              </div>
            </div>
            <div className="hs-chart">
              {WEEK.map((h, i) => (
                <span key={i} style={{ height: `${h * 100}%`, animationDelay: `${0.5 + i * 0.07}s` }} className={i === WEEK.length - 1 ? "hs-bar-today" : ""} />
              ))}
            </div>
            <div className="hs-rows">
              {(["row1", "row2", "row3"] as const).map((k) => (
                <div className="hs-row" key={k}>
                  <span>{t(`landing.scene.${k}`)}</span>
                  <i />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Till on a phone */}
        <div className="hs-phone">
          <div className="hs-phone-notch" />
          <div className="hs-scan">
            <ScanLine size={18} />
            <div className="hs-scan-code">
              {Array.from({ length: 22 }, (_, i) => (
                <span key={i} style={{ width: i % 3 === 0 ? 3 : i % 4 === 0 ? 1 : 2 }} />
              ))}
            </div>
            <div className="hs-laser" />
          </div>
          <div className="hs-phone-lines">
            {RECEIPT.map((r) => (
              <div key={r.key}>
                <span>{t(`landing.scene.items.${r.key}`)}</span>
                <b>{formatMoney(r.price)}</b>
              </div>
            ))}
          </div>
          <div className="hs-phone-pay">{t("landing.scene.pay", { amount: formatMoney(receiptTotal) })}</div>
        </div>

        {/* Printed receipt */}
        <div className="hs-receipt">
          <strong className="hs-receipt-shop">{t("landing.scene.shop")}</strong>
          <small>{t("landing.scene.receiptNo")}</small>
          <hr />
          {RECEIPT.map((r) => (
            <div className="hs-receipt-line" key={r.key}>
              <span>{t(`landing.scene.items.${r.key}`)}</span>
              <span>{formatMoney(r.price)}</span>
            </div>
          ))}
          <hr />
          <div className="hs-receipt-line hs-receipt-total">
            <span>{t("landing.scene.total")}</span>
            <span>{formatMoney(receiptTotal)}</span>
          </div>
          <div className="hs-receipt-qr">
            {QR.map((on, i) => (
              <span key={i} className={on ? "on" : ""} />
            ))}
          </div>
        </div>

        {/* The moment the sale goes through */}
        <div className="hs-toast">
          <span>
            <Check size={14} />
          </span>
          {t("landing.scene.sold", { amount: formatMoney(receiptTotal) })}
        </div>
      </div>
    </div>
  );
}
