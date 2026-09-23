import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Wallet } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { Pagination } from "../../components/ui/Pagination";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../hooks/useToast";
import * as shiftService from "../../services/shift.service";
import { extractErrorMessage } from "../../services/api";
import { formatDateTime, formatMoney } from "../../utils/format";
import type { CashShift, CashShiftListItem } from "../../types";

/** The cash flow of a shift, line by line, ending in the expected drawer amount. */
function ShiftBreakdown({ shift }: { shift: CashShift }) {
  const { t } = useTranslation();
  const b = shift.breakdown;
  const rows: [string, number, "+" | "−" | ""][] = [
    [t("shifts.breakdown.openingCash"), b.openingCash, ""],
    [t("shifts.breakdown.cashSales"), b.cashSales, "+"],
    [t("shifts.breakdown.cashRefunds"), b.cashRefunds, "−"],
    [t("shifts.breakdown.debtPaymentsCash"), b.debtPaymentsCash, "+"],
    [t("shifts.breakdown.repairCash"), b.repairCash, "+"],
    [t("shifts.breakdown.purchasesCash"), b.purchasesCash, "−"],
    [t("shifts.breakdown.cashIn"), b.cashIn, "+"],
    [t("shifts.breakdown.cashOut"), b.cashOut, "−"],
  ];
  return (
    <div className="stack gap-3">
      <table className="table">
        <tbody>
          {rows
            .filter(([, value, sign]) => value !== 0 || sign === "")
            .map(([label, value, sign]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className={`table-cell-num mono-num ${sign === "−" ? "text-danger" : ""}`}>
                  {sign}
                  {formatMoney(value)}
                </td>
              </tr>
            ))}
          <tr className="doc-total-row">
            <td>{t("shifts.expectedCash")}</td>
            <td className="table-cell-num mono-num">{formatMoney(shift.expectedCash)}</td>
          </tr>
          {shift.countedCash !== null && (
            <>
              <tr>
                <td>{t("shifts.countedCash")}</td>
                <td className="table-cell-num mono-num">{formatMoney(shift.countedCash)}</td>
              </tr>
              <tr>
                <td>{t("shifts.difference")}</td>
                <td className={`table-cell-num mono-num ${(shift.difference ?? 0) < 0 ? "text-danger" : (shift.difference ?? 0) > 0 ? "text-success" : ""}`}>
                  {(shift.difference ?? 0) > 0 ? "+" : ""}
                  {formatMoney(shift.difference ?? 0)}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">{t("shifts.breakdown.cardSales")}</div>
          <div className="stat-tile-value">{formatMoney(b.cardSales)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">{t("shifts.breakdown.qrSales")}</div>
          <div className="stat-tile-value">{formatMoney(b.qrSales)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">{t("shifts.breakdown.debtSales")}</div>
          <div className="stat-tile-value">{formatMoney(b.debtSales)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">{t("shifts.breakdown.salesCount")}</div>
          <div className="stat-tile-value">{b.salesCount}</div>
        </div>
      </div>
      {shift.movements.length > 0 && (
        <div className="stack gap-1">
          <strong style={{ fontSize: "var(--font-size-sm)" }}>{t("shifts.movements")}</strong>
          {shift.movements.map((m) => (
            <div key={m.id} className="row gap-2" style={{ fontSize: "var(--font-size-sm)" }}>
              {m.type === "IN" ? <ArrowDownCircle size={14} color="var(--color-success-text)" /> : <ArrowUpCircle size={14} color="var(--color-danger-text)" />}
              <span className="spacer">
                {m.reason ?? "—"} <span className="text-muted">· {formatDateTime(m.createdAt)}</span>
              </span>
              <span className="mono-num">{formatMoney(m.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Shifts() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [current, setCurrent] = useState<CashShift | null | undefined>(undefined);
  const [history, setHistory] = useState<CashShiftListItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [openingCash, setOpeningCash] = useState("");
  const [cashModal, setCashModal] = useState<"IN" | "OUT" | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashReason, setCashReason] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<CashShift | null>(null);

  const loadCurrent = useCallback(() => {
    shiftService.getCurrentShift().then(setCurrent).catch(() => setCurrent(null));
  }, []);

  const loadHistory = useCallback(() => {
    shiftService
      .listShifts({ page, pageSize: 15 })
      .then((res) => {
        setHistory(res.items);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      })
      .catch(() => setHistory([]));
  }, [page]);

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function run<T>(action: () => Promise<T>, success: string) {
    setBusy(true);
    try {
      const result = await action();
      showToast({ variant: "success", title: success });
      return result;
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    const shift = await run(() => shiftService.openShift(Number(openingCash) || 0), t("shifts.opened"));
    if (shift) {
      setCurrent(shift);
      setOpeningCash("");
      loadHistory();
    }
  }

  async function addCash() {
    if (!cashModal || !(Number(cashAmount) > 0)) return;
    const shift = await run(() => shiftService.addCashMovement({ type: cashModal, amount: Number(cashAmount), reason: cashReason || null }), t("shifts.cashSaved"));
    if (shift) {
      setCurrent(shift);
      setCashModal(null);
      setCashAmount("");
      setCashReason("");
    }
  }

  async function close() {
    if (!current || countedCash === "") return;
    const shift = await run(() => shiftService.closeShift(current.id, Number(countedCash), closeNote || null), t("shifts.closed"));
    if (shift) {
      setCloseOpen(false);
      setCountedCash("");
      setCloseNote("");
      setCurrent(null);
      setDetail(shift);
      loadHistory();
    }
  }

  const diffPreview = current && countedCash !== "" ? Number(countedCash) - current.expectedCash : null;

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("shifts.title")}</h1>
          <p className="page-subtitle">{t("shifts.subtitle")}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Wallet size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t("shifts.current")}
          </h2>
          {current && <Badge variant="success">{t("shifts.openSince", { date: formatDateTime(current.openedAt) })}</Badge>}
        </div>
        <div className="card-pad">
          {current === undefined ? (
            <SkeletonRows rows={3} height={40} />
          ) : current === null ? (
            <div className="stack gap-3" style={{ maxWidth: 360 }}>
              <p className="text-muted" style={{ margin: 0 }}>
                {t("shifts.noOpen")}
              </p>
              <div className="field">
                <label className="field-label">{t("shifts.openingCash")}</label>
                <input type="number" min={0} className="input" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0" />
              </div>
              <button className="btn btn-primary" onClick={open} disabled={busy}>
                <Unlock size={16} /> {t("shifts.open")}
              </button>
            </div>
          ) : (
            <div className="stack gap-4">
              <ShiftBreakdown shift={current} />
              <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                <button className="btn btn-secondary" onClick={() => setCashModal("IN")}>
                  <ArrowDownCircle size={16} /> {t("shifts.cashIn")}
                </button>
                <button className="btn btn-secondary" onClick={() => setCashModal("OUT")}>
                  <ArrowUpCircle size={16} /> {t("shifts.cashOut")}
                </button>
                <span className="spacer" />
                <button className="btn btn-danger" onClick={() => setCloseOpen(true)}>
                  <Lock size={16} /> {t("shifts.close")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t("shifts.history")}</h2>
        </div>
        {history === null ? (
          <div className="card-pad">
            <SkeletonRows rows={5} height={44} />
          </div>
        ) : history.length === 0 ? (
          <EmptyState icon={<Wallet size={26} />} title={t("shifts.historyEmpty")} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("shifts.cashier")}</th>
                    <th>{t("shifts.openedAt")}</th>
                    <th>{t("shifts.closedAt")}</th>
                    <th className="table-cell-num">{t("shifts.expectedCash")}</th>
                    <th className="table-cell-num">{t("shifts.countedCash")}</th>
                    <th className="table-cell-num">{t("shifts.difference")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <tr key={s.id} className="table-row-clickable" onClick={() => shiftService.getShift(s.id).then(setDetail).catch(() => undefined)}>
                      <td style={{ fontWeight: 600 }}>{s.employeeName}</td>
                      <td className="text-muted">{formatDateTime(s.openedAt)}</td>
                      <td className="text-muted">{s.closedAt ? formatDateTime(s.closedAt) : <Badge variant="success">{t("shifts.statusOpen")}</Badge>}</td>
                      <td className="table-cell-num">{s.expectedCash !== null ? formatMoney(s.expectedCash) : "—"}</td>
                      <td className="table-cell-num">{s.countedCash !== null ? formatMoney(s.countedCash) : "—"}</td>
                      <td className={`table-cell-num ${(s.difference ?? 0) < 0 ? "text-danger" : (s.difference ?? 0) > 0 ? "text-success" : ""}`}>
                        {s.difference !== null ? `${s.difference > 0 ? "+" : ""}${formatMoney(s.difference)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={15} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal open={cashModal !== null} onClose={() => setCashModal(null)}>
        <div className="stack gap-4">
          <h2 className="card-title">{cashModal === "IN" ? t("shifts.cashIn") : t("shifts.cashOut")}</h2>
          <div className="field">
            <label className="field-label">{t("shifts.amount")}</label>
            <input type="number" min={0} autoFocus className="input" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">{t("shifts.reason")}</label>
            <input className="input" value={cashReason} onChange={(e) => setCashReason(e.target.value)} placeholder={cashModal === "IN" ? t("shifts.reasonInPlaceholder") : t("shifts.reasonOutPlaceholder")} />
          </div>
          <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-secondary" onClick={() => setCashModal(null)}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" onClick={addCash} disabled={busy || !(Number(cashAmount) > 0)}>
              {t("common.save")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={closeOpen} onClose={() => setCloseOpen(false)}>
        {current && (
          <div className="stack gap-4">
            <h2 className="card-title">{t("shifts.close")}</h2>
            <div className="row" style={{ fontWeight: 600 }}>
              <span className="spacer">{t("shifts.expectedCash")}</span>
              <span className="mono-num">{formatMoney(current.expectedCash)}</span>
            </div>
            <div className="field">
              <label className="field-label">{t("shifts.countedCash")}</label>
              <input type="number" min={0} autoFocus className="input" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
              {diffPreview !== null && diffPreview !== 0 && (
                <span className={`field-hint ${diffPreview < 0 ? "text-danger" : "text-success"}`}>
                  {diffPreview < 0 ? t("shifts.shortage", { amount: formatMoney(-diffPreview) }) : t("shifts.surplus", { amount: formatMoney(diffPreview) })}
                </span>
              )}
            </div>
            <input className="input" placeholder={t("shifts.notePlaceholder")} value={closeNote} onChange={(e) => setCloseNote(e.target.value)} />
            <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setCloseOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-danger" onClick={close} disabled={busy || countedCash === ""}>
                {t("shifts.close")}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div className="stack gap-4">
            <div>
              <h2 className="card-title">{t("shifts.report")}</h2>
              <p className="card-subtitle">
                {detail.employeeName} · {formatDateTime(detail.openedAt)}
                {detail.closedAt ? ` — ${formatDateTime(detail.closedAt)}` : ""}
              </p>
            </div>
            <ShiftBreakdown shift={detail} />
            {detail.note && <p className="text-muted">{detail.note}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
