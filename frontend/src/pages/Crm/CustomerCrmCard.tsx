import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, CheckCircle2, HeartHandshake, MessageCircle, Phone, Plus, StickyNote, Trash2, X } from "lucide-react";
import { usePermissions } from "../../hooks/usePermissions";
import { useToast } from "../../hooks/useToast";
import * as crmService from "../../services/crm.service";
import type { ActivityKind, CrmActivity } from "../../services/crm.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatDateTime } from "../../utils/format";
import "./Crm.css";

const KINDS: { kind: ActivityKind; icon: typeof StickyNote }[] = [
  { kind: "NOTE", icon: StickyNote },
  { kind: "CALL", icon: Phone },
  { kind: "FOLLOW_UP", icon: BellRing },
];
const KIND_ICON: Record<ActivityKind, typeof StickyNote> = { NOTE: StickyNote, CALL: Phone, MESSAGE: MessageCircle, FOLLOW_UP: BellRing };

/** "YYYY-MM-DD" for a date input, N days from today. */
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** On the customer's page (Max): tags, birthday and the timeline of notes, calls, messages and follow-ups. */
export function CustomerCrmCard({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const { showToast } = useToast();
  const canEdit = can("customers.manage");
  const [tags, setTags] = useState<string[]>([]);
  const [birthday, setBirthday] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [items, setItems] = useState<CrmActivity[] | null>(null);
  const [kind, setKind] = useState<ActivityKind>("NOTE");
  const [text, setText] = useState("");
  const [dueAt, setDueAt] = useState(inDays(3));
  const [saving, setSaving] = useState(false);

  const fail = useCallback(
    (error: unknown) => showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) }),
    [showToast, t],
  );

  const load = useCallback(() => {
    crmService
      .getTimeline(customerId)
      .then((data) => {
        setTags(data.tags);
        setBirthday(data.birthday ?? "");
        setItems(data.items);
      })
      .catch(fail);
  }, [customerId, fail]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile(nextTags: string[], nextBirthday: string) {
    try {
      const saved = await crmService.saveProfile(customerId, { tags: nextTags, birthday: nextBirthday || null });
      setTags(saved.tags);
      setBirthday(saved.birthday ?? "");
    } catch (error) {
      fail(error);
    }
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    setTagInput("");
    void saveProfile([...tags, tag], birthday);
  }

  async function addActivity() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await crmService.addActivity(customerId, {
        kind,
        text: text.trim(),
        dueAt: kind === "FOLLOW_UP" ? new Date(`${dueAt}T10:00:00`).toISOString() : null,
      });
      setText("");
      showToast({ variant: "success", title: t(kind === "FOLLOW_UP" ? "crm.card.followUpSaved" : "crm.card.saved") });
      load();
    } catch (error) {
      fail(error);
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(a: CrmActivity) {
    try {
      await crmService.setDone(a.id, !a.doneAt);
      load();
    } catch (error) {
      fail(error);
    }
  }

  async function remove(a: CrmActivity) {
    try {
      await crmService.deleteActivity(a.id);
      load();
    } catch (error) {
      fail(error);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title row gap-2">
          <HeartHandshake size={17} /> {t("crm.card.title")}
        </h2>
      </div>
      <div className="card-pad crm-card-grid">
        <div className="stack gap-4">
          <div className="field">
            <label className="field-label">{t("crm.card.tags")}</label>
            <div className="crm-tag-editor">
              {tags.map((tag) => (
                <span key={tag} className="crm-tag crm-tag-static">
                  {tag}
                  {canEdit && (
                    <button type="button" onClick={() => saveProfile(tags.filter((x) => x !== tag), birthday)} aria-label={t("crm.card.removeTag", { tag })}>
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
              {tags.length === 0 && <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>{t("crm.card.noTags")}</span>}
            </div>
            {canEdit && tags.length < 10 && (
              <div className="row gap-2" style={{ marginTop: 8 }}>
                <input
                  className="input"
                  value={tagInput}
                  maxLength={30}
                  placeholder={t("crm.card.tagPlaceholder")}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <button className="btn btn-secondary" onClick={addTag} disabled={!tagInput.trim()}>
                  <Plus size={16} />
                </button>
              </div>
            )}
          </div>
          <div className="field">
            <label className="field-label">{t("crm.card.birthday")}</label>
            <input
              type="date"
              className="input"
              value={birthday}
              max={inDays(0)}
              disabled={!canEdit}
              onChange={(e) => {
                setBirthday(e.target.value);
                void saveProfile(tags, e.target.value);
              }}
            />
            <span className="field-hint">{t("crm.card.birthdayHint")}</span>
          </div>
        </div>

        <div className="stack gap-4">
          {canEdit && (
            <div className="stack gap-3">
              <div className="crm-kind-tabs">
                {KINDS.map(({ kind: k, icon: Icon }) => (
                  <button key={k} className={`crm-segment ${kind === k ? "active" : ""}`} onClick={() => setKind(k)}>
                    <Icon size={15} /> {t(`crm.kinds.${k}`)}
                  </button>
                ))}
              </div>
              <textarea
                className="input"
                rows={2}
                maxLength={1000}
                value={text}
                placeholder={t(`crm.card.placeholder.${kind}`)}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="row gap-3" style={{ flexWrap: "wrap" }}>
                {kind === "FOLLOW_UP" && (
                  <label className="row gap-2" style={{ fontSize: "var(--font-size-sm)" }}>
                    {t("crm.card.when")}
                    <input type="date" className="input" style={{ width: "auto" }} value={dueAt} min={inDays(0)} onChange={(e) => setDueAt(e.target.value)} />
                  </label>
                )}
                <button className="btn btn-primary" onClick={addActivity} disabled={saving || !text.trim() || (kind === "FOLLOW_UP" && !dueAt)}>
                  {t("crm.card.add")}
                </button>
              </div>
            </div>
          )}

          {items && items.length === 0 && <p className="text-muted" style={{ margin: 0 }}>{t("crm.card.empty")}</p>}
          {items && items.length > 0 && (
            <ul className="crm-timeline">
              {items.map((a) => {
                const Icon = a.kind === "FOLLOW_UP" && a.doneAt ? CheckCircle2 : KIND_ICON[a.kind];
                return (
                  <li key={a.id}>
                    <span className={`crm-timeline-icon ${a.kind === "FOLLOW_UP" ? (a.doneAt ? "done" : "follow") : ""}`}>
                      <Icon size={15} />
                    </span>
                    <div>
                      <p>{a.text}</p>
                      <small>
                        {t(`crm.kinds.${a.kind}`)}, {formatDateTime(a.createdAt)}
                        {a.employeeName ? `, ${a.employeeName}` : ""}
                        {a.kind === "FOLLOW_UP" && a.dueAt && !a.doneAt ? `. ${t("crm.card.due", { date: formatDate(a.dueAt) })}` : ""}
                      </small>
                    </div>
                    {canEdit && (
                      <div className="table-actions">
                        {a.kind === "FOLLOW_UP" && (
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleDone(a)}>
                            {a.doneAt ? t("crm.card.reopen") : t("crm.followUps.done")}
                          </button>
                        )}
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(a)} title={t("crm.card.delete")}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
