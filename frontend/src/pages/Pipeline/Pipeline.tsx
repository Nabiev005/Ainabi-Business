import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, History, Package, Search, Settings2 } from "lucide-react";
import { Skeleton } from "../../components/ui/Skeleton";
import { Modal } from "../../components/ui/Modal";
import { StagesModal } from "./StagesModal";
import { usePermissions } from "../../hooks/usePermissions";
import { useToast } from "../../hooks/useToast";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as pipelineService from "../../services/pipeline.service";
import type { PipelineBoard, PipelineCard, StageHistoryEntry } from "../../services/pipeline.service";
import { extractErrorMessage } from "../../services/api";
import { formatDateTime, formatMoney, formatNumber, unitLabel } from "../../utils/format";
import "./Pipeline.css";

const NO_STAGE = "__none__";

export default function Pipeline() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const { showToast } = useToast();
  const canMove = can("pipeline.move");
  const canConfigure = can("pipeline.configure");

  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [dragging, setDragging] = useState<{ productId: string; from: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ card: PipelineCard; stageKey: string } | null>(null);
  const [history, setHistory] = useState<StageHistoryEntry[] | null>(null);

  const load = useCallback(() => {
    pipelineService
      .getBoard(debouncedSearch)
      .then(setBoard)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [debouncedSearch, showToast, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setHistory(null);
    pipelineService.getProductHistory(selected.card.id).then(setHistory).catch(() => setHistory([]));
  }, [selected]);

  const keyOf = (stageId: string | null) => stageId ?? NO_STAGE;

  async function move(productId: string, from: string, to: string) {
    if (from === to || !board) return;
    // Optimistic: move the card right away, roll back by reloading on failure.
    const card = board.columns.find((c) => keyOf(c.stageId) === from)?.products.find((p) => p.id === productId);
    if (!card) return;
    setBoard({
      ...board,
      columns: board.columns.map((c) => {
        const key = keyOf(c.stageId);
        if (key === from) return { ...c, total: c.total - 1, products: c.products.filter((p) => p.id !== productId) };
        if (key === to) return { ...c, total: c.total + 1, products: [{ ...card, stageChangedAt: new Date().toISOString() }, ...c.products] };
        return c;
      }),
    });
    try {
      await pipelineService.moveProducts([productId], to === NO_STAGE ? null : to);
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
      load();
    }
  }

  // The "no stage" column only shows up when something is actually in it.
  const columns = board?.columns.filter((c) => c.stageId !== null || c.total > 0) ?? [];

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("pipeline.title")}</h1>
          <p className="page-subtitle">{canMove ? t("pipeline.subtitle") : t("pipeline.subtitleReadOnly")}</p>
        </div>
        <div className="row gap-2">
          <div className="input-with-icon" style={{ minWidth: 220 }}>
            <Search size={16} />
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("pipeline.search")} />
          </div>
          {canConfigure && (
            <button className="btn btn-secondary" onClick={() => setStagesOpen(true)}>
              <Settings2 size={16} /> {t("pipeline.configure")}
            </button>
          )}
        </div>
      </div>

      {!board ? (
        <div className="pipeline-board">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={360} radius="16px" />
          ))}
        </div>
      ) : (
        <div className="pipeline-board">
          {columns.map((column) => {
            const key = keyOf(column.stageId);
            const color = column.stage?.color ?? "var(--color-text-muted)";
            return (
              <div
                key={key}
                className={`pipeline-column ${dropTarget === key ? "pipeline-column-drop" : ""}`}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setDropTarget(key);
                }}
                onDragLeave={() => setDropTarget((current) => (current === key ? null : current))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropTarget(null);
                  if (dragging) move(dragging.productId, dragging.from, key);
                  setDragging(null);
                }}
              >
                <div className="pipeline-column-header" style={{ borderTopColor: color }}>
                  <span className="pipeline-column-dot" style={{ background: color }} />
                  <span className="pipeline-column-name">{column.stage?.name ?? t("pipeline.noStage")}</span>
                  <span className="pipeline-column-count">{column.total}</span>
                  {column.stage?.blocksSale && (
                    <span className="pipeline-column-block" title={t("pipeline.blocksSaleHint")}>
                      <Ban size={13} />
                    </span>
                  )}
                </div>

                <div className="pipeline-column-body">
                  {column.products.length === 0 ? (
                    <div className="pipeline-column-empty">{canMove ? t("pipeline.dropHere") : t("pipeline.emptyStage")}</div>
                  ) : (
                    column.products.map((card) => (
                      <div
                        key={card.id}
                        className={`pipeline-card ${dragging?.productId === card.id ? "pipeline-card-dragging" : ""}`}
                        draggable={canMove}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          setDragging({ productId: card.id, from: key });
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setDropTarget(null);
                        }}
                        onClick={() => setSelected({ card, stageKey: key })}
                      >
                        <div className="pipeline-card-thumb">{card.imageUrl ? <img src={card.imageUrl} alt="" /> : <Package size={16} />}</div>
                        <div className="pipeline-card-info">
                          <span className="pipeline-card-name">{card.name}</span>
                          <span className="pipeline-card-meta">
                            {formatNumber(card.quantity)} {unitLabel(card.unit)} · {formatMoney(card.salePrice)}
                          </span>
                          {card.categoryName && <span className="pipeline-card-meta">{card.categoryName}</span>}
                        </div>
                      </div>
                    ))
                  )}
                  {column.total > column.products.length && (
                    <div className="pipeline-column-more">{t("pipeline.more", { count: column.total - column.products.length })}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && board && (
          <div className="stack gap-4">
            <div className="stack gap-1">
              <h2 className="card-title">{selected.card.name}</h2>
              <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
                {selected.card.sku ?? ""} · {formatNumber(selected.card.quantity)} {unitLabel(selected.card.unit)} · {formatMoney(selected.card.salePrice)}
              </span>
            </div>

            {canMove && (
              <div className="field">
                <label className="field-label">{t("pipeline.moveTo")}</label>
                <select
                  className="select"
                  value={selected.stageKey}
                  onChange={(e) => {
                    move(selected.card.id, selected.stageKey, e.target.value);
                    setSelected(null);
                  }}
                >
                  {board.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value={NO_STAGE}>{t("pipeline.noStage")}</option>
                </select>
              </div>
            )}

            <div className="stack gap-2">
              <span className="field-label row gap-1">
                <History size={14} /> {t("pipeline.history")}
              </span>
              {history === null ? (
                <Skeleton height={60} />
              ) : history.length === 0 ? (
                <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
                  {t("pipeline.historyEmpty")}
                </span>
              ) : (
                <ul className="pipeline-history">
                  {history.map((h) => (
                    <li key={h.id}>
                      <span>
                        {h.fromStage ?? t("pipeline.noStage")} → <strong>{h.toStage ?? t("pipeline.noStage")}</strong>
                      </span>
                      <span className="text-muted">
                        {h.employeeName ?? "—"} · {formatDateTime(h.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>
                {t("common.close")}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <StagesModal open={stagesOpen} onClose={() => setStagesOpen(false)} stages={board?.stages ?? []} onSaved={load} />
    </div>
  );
}
