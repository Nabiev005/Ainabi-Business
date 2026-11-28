import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BellRing, CheckCircle2, Gift, HeartHandshake, MessageCircle, Phone, Search, Send, Sparkles, Star, UserX, Users } from "lucide-react";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { useToast } from "../../hooks/useToast";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as crmService from "../../services/crm.service";
import type { CrmCustomerRow, CrmOverview, CrmSegment, FollowUp } from "../../services/crm.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatMoney } from "../../utils/format";
import { whatsappShareLink } from "../../utils/messages";
import "./Crm.css";

const SEGMENTS: { key: Exclude<CrmSegment, "tag">; icon: typeof Users }[] = [
  { key: "lapsed", icon: UserX },
  { key: "top", icon: Star },
  { key: "newcomers", icon: Sparkles },
  { key: "birthdays", icon: Gift },
  { key: "all", icon: Users },
];
const LAPSED_DAYS = [30, 60, 90];

/** Puts the customer's first name into a message template ("{name}"). */
const fillTemplate = (template: string, row: Pick<CrmCustomerRow, "name">) => template.replace(/\{name\}/g, row.name.split(" ")[0] || row.name);

/** CRM (Max): segments to work with, follow-ups due, and WhatsApp messages to a whole segment. */
export default function Crm() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { showToast } = useToast();
  const shop = session?.business.name ?? "";
  const [segment, setSegment] = useState<CrmSegment>("lapsed");
  const [tag, setTag] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const [overview, setOverview] = useState<CrmOverview | null>(null);
  const [rows, setRows] = useState<CrmCustomerRow[] | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[] | null>(null);
  const [campaign, setCampaign] = useState(false);

  const fail = useCallback((error: unknown) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }), [showToast, t]);

  const loadOverview = useCallback(() => {
    crmService.getOverview(days).then(setOverview).catch(fail);
    crmService.listFollowUps("due").then(setFollowUps).catch(fail);
  }, [days, fail]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    setRows(null);
    crmService
      .listCustomers({ segment, days, tag: tag ?? undefined, search: debounced || undefined })
      .then(setRows)
      .catch(fail);
  }, [segment, days, tag, debounced, fail]);

  const pickSegment = (key: CrmSegment, tagName: string | null = null) => {
    setSegment(key);
    setTag(tagName);
  };

  const withPhone = useMemo(() => (rows ?? []).filter((r) => !!r.phone), [rows]);

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("crm.title")}</h1>
          <p className="page-subtitle">{t("crm.subtitle")}</p>
        </div>
      </div>

      <div className="crm-kpis">
        <div className="card card-pad crm-kpi">
          <span>{t("crm.kpi.customers")}</span>
          <strong className="mono-num">{overview?.customers ?? "—"}</strong>
          <small>{t("crm.kpi.buyers", { count: overview?.buyers ?? 0 })}</small>
        </div>
        <div className="card card-pad crm-kpi">
          <span>{t("crm.kpi.repeat")}</span>
          <strong className="mono-num">{overview ? `${overview.repeatRate}%` : "—"}</strong>
          <small>{t("crm.kpi.repeatHint")}</small>
        </div>
        <div className="card card-pad crm-kpi">
          <span>{t("crm.kpi.lapsed", { days })}</span>
          <strong className="mono-num">{overview?.segments.lapsed ?? "—"}</strong>
          <small>{t("crm.kpi.lapsedHint")}</small>
        </div>
        <div className={`card card-pad crm-kpi ${overview?.followUpsDue ? "crm-kpi-alert" : ""}`}>
          <span>{t("crm.kpi.followUps")}</span>
          <strong className="mono-num">{overview?.followUpsDue ?? "—"}</strong>
          <small>{t("crm.kpi.followUpsHint")}</small>
        </div>
      </div>

      {followUps && followUps.length > 0 && <FollowUpList items={followUps} onChanged={loadOverview} />}

      <div className="card">
        <div className="crm-segments">
          {SEGMENTS.map(({ key, icon: Icon }) => {
            const count = key === "all" ? overview?.customers : overview?.segments[key];
            return (
              <button key={key} className={`crm-segment ${segment === key ? "active" : ""}`} onClick={() => pickSegment(key)}>
                <Icon size={17} />
                <span>{t(`crm.segments.${key}`, { days })}</span>
                {count !== undefined && <b className="mono-num">{count}</b>}
              </button>
            );
          })}
        </div>
        {overview && overview.tags.length > 0 && (
          <div className="crm-tags-filter">
            <span className="text-muted">{t("crm.tagsFilter")}</span>
            {overview.tags.map((x) => (
              <button
                key={x.tag}
                className={`crm-tag ${segment === "tag" && tag === x.tag ? "active" : ""}`}
                onClick={() => (segment === "tag" && tag === x.tag ? pickSegment("all") : pickSegment("tag", x.tag))}
              >
                {x.tag} <span>{x.count}</span>
              </button>
            ))}
          </div>
        )}
        <div className="filter-bar crm-toolbar">
          <div className="input-with-icon" style={{ flex: "1 1 220px", maxWidth: 360 }}>
            <Search size={16} />
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("crm.search")} />
          </div>
          {segment === "lapsed" && (
            <select className="select" style={{ width: "auto" }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {LAPSED_DAYS.map((d) => (
                <option key={d} value={d}>
                  {t("crm.lapsedFor", { days: d })}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-primary" disabled={withPhone.length === 0} onClick={() => setCampaign(true)}>
            <Send size={16} /> {t("crm.campaign.open", { count: withPhone.length })}
          </button>
        </div>
        <p className="crm-segment-hint text-muted">{t(`crm.hints.${segment}`, { days, tag })}</p>

        {rows === null ? (
          <div className="card-pad">
            <SkeletonRows rows={5} height={44} />
          </div>
        ) : rows.length === 0 ? (
          <div className="card-pad">
            <EmptyState icon={<HeartHandshake size={26} />} title={t("crm.empty.title")} subtitle={t(`crm.empty.${segment}`, { days })} />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("crm.table.customer")}</th>
                  <th className="table-cell-num">{t("crm.table.purchases")}</th>
                  <th className="table-cell-num">{t("crm.table.spent")}</th>
                  <th className="table-cell-num">{t("crm.table.average")}</th>
                  <th>{segment === "birthdays" ? t("crm.table.birthday") : t("crm.table.last")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/customers/${r.id}`} className="crm-name">
                        {r.name}
                      </Link>
                      <div className="crm-row-meta">
                        {r.phone && <span className="text-muted">{r.phone}</span>}
                        {r.tags.map((x) => (
                          <span key={x} className="crm-tag crm-tag-static">
                            {x}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="table-cell-num">{r.purchaseCount}</td>
                    <td className="table-cell-num">{formatMoney(r.totalSpent)}</td>
                    <td className="table-cell-num">{r.purchaseCount ? formatMoney(r.averageCheck) : "—"}</td>
                    <td className="text-muted">
                      {segment === "birthdays" && r.daysToBirthday !== null
                        ? r.daysToBirthday === 0
                          ? t("crm.birthdayToday")
                          : t("crm.birthdayIn", { count: r.daysToBirthday })
                        : r.daysSinceLastPurchase === null
                          ? t("crm.neverBought")
                          : r.daysSinceLastPurchase === 0
                            ? t("crm.today")
                            : t("crm.daysAgo", { count: r.daysSinceLastPurchase })}
                    </td>
                    <td>
                      <div className="table-actions">
                        {r.phone && (
                          <>
                            <a className="btn btn-ghost btn-icon btn-sm" href={`tel:${r.phone}`} title={t("crm.call")}>
                              <Phone size={15} />
                            </a>
                            <a
                              className="btn btn-ghost btn-icon btn-sm"
                              href={whatsappShareLink(r.phone, fillTemplate(t(`crm.templates.${segment}`, { tag, shop }), r))}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="WhatsApp"
                            >
                              <MessageCircle size={15} />
                            </a>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CampaignModal open={campaign} onClose={() => setCampaign(false)} rows={withPhone} segment={segment} tag={tag} />
    </div>
  );
}

/** Follow-ups due today or overdue, with call / WhatsApp / done. */
function FollowUpList({ items, onChanged }: { items: FollowUp[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const { showToast } = useToast();

  async function done(id: string) {
    try {
      await crmService.setDone(id, true);
      showToast({ variant: "success", title: t("crm.followUps.closed") });
      onChanged();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title row gap-2">
          <BellRing size={17} /> {t("crm.followUps.title")}
        </h2>
      </div>
      <div className="crm-followups">
        {items.map((f) => (
          <div key={f.id} className="crm-followup">
            <div className="crm-followup-body">
              <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                <Link to={`/customers/${f.customerId}`} className="crm-name">
                  {f.customerName}
                </Link>
                {f.overdue ? <Badge variant="danger">{t("crm.followUps.overdue", { date: formatDate(f.dueAt!) })}</Badge> : <Badge variant="warning">{t("crm.followUps.today")}</Badge>}
              </div>
              <p>{f.text}</p>
            </div>
            <div className="table-actions">
              {f.customerPhone && (
                <>
                  <a className="btn btn-ghost btn-icon btn-sm" href={`tel:${f.customerPhone}`} title={t("crm.call")}>
                    <Phone size={15} />
                  </a>
                  <a className="btn btn-ghost btn-icon btn-sm" href={whatsappShareLink(f.customerPhone, "")} target="_blank" rel="noopener noreferrer" title="WhatsApp">
                    <MessageCircle size={15} />
                  </a>
                </>
              )}
              {can("customers.manage") && (
                <button className="btn btn-secondary btn-sm" onClick={() => done(f.id)}>
                  <CheckCircle2 size={15} /> {t("crm.followUps.done")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * WhatsApp to a whole segment. WhatsApp has no free bulk sending, so the
 * message is prepared once and sent person by person (one tap each); every
 * send is written to the customer's timeline.
 */
function CampaignModal({ open, onClose, rows, segment, tag }: { open: boolean; onClose: () => void; rows: CrmCustomerRow[]; segment: CrmSegment; tag: string | null }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { can } = usePermissions();
  const [text, setText] = useState("");
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setText(t(`crm.templates.${segment}`, { tag, shop: session?.business.name ?? "" }));
    setSent(new Set());
  }, [open, segment, tag, session, t]);

  function send(row: CrmCustomerRow) {
    const message = fillTemplate(text, row);
    window.open(whatsappShareLink(row.phone, message), "_blank", "noopener");
    setSent((prev) => new Set(prev).add(row.id));
    if (can("customers.manage")) {
      crmService.addActivity(row.id, { kind: "MESSAGE", text: message }).catch(() => undefined);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="wide">
      <div className="stack gap-4">
        <h2 className="card-title">{t("crm.campaign.title", { count: rows.length })}</h2>
        <div className="field">
          <label className="field-label">{t("crm.campaign.text")}</label>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          <span className="field-hint">{t("crm.campaign.hint")}</span>
        </div>
        <div className="crm-campaign-list">
          {rows.map((r) => (
            <div key={r.id} className={`crm-campaign-row ${sent.has(r.id) ? "sent" : ""}`}>
              <div>
                <strong>{r.name}</strong>
                <span className="text-muted">{r.phone}</span>
              </div>
              <button className={`btn btn-sm ${sent.has(r.id) ? "btn-secondary" : "btn-primary"}`} onClick={() => send(r)} disabled={!text.trim()}>
                {sent.has(r.id) ? (
                  <>
                    <CheckCircle2 size={15} /> {t("crm.campaign.sent")}
                  </>
                ) : (
                  <>
                    <MessageCircle size={15} /> {t("crm.campaign.send")}
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
        <div className="row gap-3" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <span className="text-muted">{t("crm.campaign.progress", { sent: sent.size, total: rows.length })}</span>
          <button className="btn btn-secondary" onClick={onClose}>
            {t("crm.campaign.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
