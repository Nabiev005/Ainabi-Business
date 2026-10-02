import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../hooks/useToast";
import * as pipelineService from "../../services/pipeline.service";
import type { PipelineStage } from "../../services/pipeline.service";
import { extractErrorMessage } from "../../services/api";

const PALETTE = ["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#0d9488", "#ec4899", "#64748b"];

interface StageRow {
  /** null = not saved yet. */
  id: string | null;
  name: string;
  color: string;
  blocksSale: boolean;
}

interface StagesModalProps {
  open: boolean;
  onClose: () => void;
  stages: PipelineStage[];
  /** Called after any save so the board reloads. */
  onSaved: () => void;
}

/**
 * The owner's pipeline editor: add, rename, recolour, reorder and delete
 * stages, and mark which ones keep products off the POS. Saved in one go.
 */
export function StagesModal({ open, onClose, stages, onSaved }: StagesModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [rows, setRows] = useState<StageRow[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(stages.map((s) => ({ id: s.id, name: s.name, color: s.color, blocksSale: s.blocksSale })));
    setRemoved([]);
  }, [open, stages]);

  function update(index: number, patch: Partial<StageRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function move(index: number, delta: number) {
    setRows((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(index: number) {
    const row = rows[index];
    if (row.id) setRemoved((prev) => [...prev, row.id!]);
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function add() {
    setRows((prev) => [...prev, { id: null, name: "", color: PALETTE[prev.length % PALETTE.length], blocksSale: false }]);
  }

  async function save() {
    if (rows.some((r) => !r.name.trim())) {
      showToast({ variant: "error", title: t("pipeline.stages.nameRequired") });
      return;
    }
    setSaving(true);
    try {
      for (const id of removed) await pipelineService.deleteStage(id);
      const ids: string[] = [];
      for (const row of rows) {
        const payload = { name: row.name.trim(), color: row.color, blocksSale: row.blocksSale };
        if (row.id) {
          const original = stages.find((s) => s.id === row.id);
          if (!original || original.name !== payload.name || original.color !== payload.color || original.blocksSale !== payload.blocksSale) {
            await pipelineService.updateStage(row.id, payload);
          }
          ids.push(row.id);
        } else {
          ids.push((await pipelineService.createStage(payload)).id);
        }
      }
      if (ids.length > 0) await pipelineService.reorderStages(ids);
      showToast({ variant: "success", title: t("pipeline.stages.saved") });
      onSaved();
      onClose();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="wide">
      <div className="stack gap-4">
        <div className="stack gap-1">
          <h2 className="card-title">{t("pipeline.stages.title")}</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
            {t("pipeline.stages.hint")}
          </p>
        </div>

        <div className="stack gap-2">
          {rows.map((row, i) => (
            <div key={row.id ?? `new-${i}`} className="stage-row">
              <div className="stage-row-order">
                <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("pipeline.stages.up")}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={t("pipeline.stages.down")}>
                  <ArrowDown size={14} />
                </button>
              </div>
              <input type="color" className="stage-row-color" value={row.color} onChange={(e) => update(i, { color: e.target.value })} aria-label={t("pipeline.stages.color")} />
              <input className="input" value={row.name} maxLength={60} placeholder={t("pipeline.stages.namePlaceholder")} onChange={(e) => update(i, { name: e.target.value })} />
              <label className="stage-row-block" title={t("pipeline.stages.blocksSaleHint")}>
                <input type="checkbox" checked={row.blocksSale} onChange={(e) => update(i, { blocksSale: e.target.checked })} />
                {t("pipeline.stages.blocksSale")}
              </label>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(i)} aria-label={t("common.delete")}>
                <Trash2 size={16} color="var(--color-danger-text)" />
              </button>
            </div>
          ))}
          {rows.length === 0 && <p className="text-muted">{t("pipeline.stages.empty")}</p>}
        </div>

        <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={add} disabled={rows.length >= 30}>
          <Plus size={16} /> {t("pipeline.stages.add")}
        </button>

        {removed.length > 0 && <p className="field-hint">{t("pipeline.stages.deleteWarning")}</p>}

        <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
