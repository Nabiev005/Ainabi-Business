import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, CheckCircle2, ClipboardList, Pencil, Play, Plus, RotateCcw, Trash2, XCircle } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { TaskModal } from "./TaskModal";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { useToast } from "../../hooks/useToast";
import * as taskService from "../../services/task.service";
import type { Task, TaskPayload, TaskStatus } from "../../services/task.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatDateTime } from "../../utils/format";
import type { Role } from "../../types";
import "./Tasks.css";

type StatusFilter = "OPEN" | "DONE" | "ALL";

const PRIORITY_BADGE = { LOW: "neutral", NORMAL: "info", HIGH: "danger" } as const;
const STATUS_BADGE = { TODO: "neutral", IN_PROGRESS: "warning", DONE: "success", CANCELLED: "neutral" } as const;

export default function Tasks() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { can } = usePermissions();
  const { showToast } = useToast();
  const canManage = can("tasks.manage");

  const [scope, setScope] = useState<"mine" | "all">(canManage ? "all" : "mine");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [assignees, setAssignees] = useState<{ id: string; name: string; role: Role }[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (canManage) taskService.listAssignees().then(setAssignees).catch(() => undefined);
  }, [canManage]);

  const load = useCallback(() => {
    setTasks(null);
    taskService
      .listTasks({
        scope,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        assigneeId: scope === "all" && assigneeFilter ? assigneeFilter : undefined,
      })
      .then(setTasks)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [scope, statusFilter, assigneeFilter, showToast, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(values: TaskPayload) {
    setSubmitting(true);
    try {
      if (editing) {
        await taskService.updateTask(editing.id, values);
        showToast({ variant: "success", title: t("tasks.updated") });
      } else {
        await taskService.createTask(values);
        showToast({ variant: "success", title: t("tasks.created") });
      }
      setModalOpen(false);
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatus(task: Task, status: TaskStatus) {
    setBusyId(task.id);
    try {
      await taskService.setTaskStatus(task.id, status);
      if (status === "DONE") showToast({ variant: "success", title: t("tasks.completed") });
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await taskService.deleteTask(deleteTarget.id);
      showToast({ variant: "success", title: t("tasks.deleted") });
      setDeleteTarget(null);
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.deleteFailed"), message: extractErrorMessage(error) });
    } finally {
      setDeleting(false);
    }
  }

  const mine = (task: Task) => task.assigneeId === session?.employeeId;

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("tasks.title")}</h1>
          <p className="page-subtitle">{canManage ? t("tasks.subtitleManager") : t("tasks.subtitle")}</p>
        </div>
        {canManage && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus size={18} />
            {t("tasks.add")}
          </button>
        )}
      </div>

      <div className="card">
        <div className="filter-bar" style={{ flexWrap: "wrap" }}>
          {canManage && (
            <div className="tabs">
              <button className={`tab ${scope === "all" ? "active" : ""}`} onClick={() => setScope("all")}>
                {t("tasks.scopeAll")}
              </button>
              <button className={`tab ${scope === "mine" ? "active" : ""}`} onClick={() => setScope("mine")}>
                {t("tasks.scopeMine")}
              </button>
            </div>
          )}
          <div className="tabs">
            {(["OPEN", "DONE", "ALL"] as StatusFilter[]).map((value) => (
              <button key={value} className={`tab ${statusFilter === value ? "active" : ""}`} onClick={() => setStatusFilter(value)}>
                {t(`tasks.filter.${value}`)}
              </button>
            ))}
          </div>
          {canManage && scope === "all" && (
            <select className="select" style={{ maxWidth: 240 }} value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              <option value="">{t("tasks.allEmployees")}</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {tasks === null ? (
          <div className="card-pad">
            <SkeletonRows rows={4} height={72} />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState icon={<ClipboardList size={26} />} title={t("tasks.empty")} subtitle={canManage ? t("tasks.emptyManager") : t("tasks.emptySubtitle")} />
        ) : (
          <div className="task-list">
            {tasks.map((task) => {
              const closed = task.status === "DONE" || task.status === "CANCELLED";
              const canAct = mine(task) || canManage;
              return (
                <div key={task.id} className={`task-item ${closed ? "task-item-closed" : ""} ${task.overdue ? "task-item-overdue" : ""}`}>
                  <div className="task-item-main">
                    <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                      <span className="task-item-title">{task.title}</span>
                      <Badge variant={STATUS_BADGE[task.status]}>{t(`tasks.status.${task.status}`)}</Badge>
                      {task.priority !== "NORMAL" && <Badge variant={PRIORITY_BADGE[task.priority]}>{t(`tasks.priority.${task.priority}`)}</Badge>}
                      {task.overdue && <Badge variant="danger">{t("tasks.overdue")}</Badge>}
                    </div>
                    {task.description && <p className="task-item-desc">{task.description}</p>}
                    <div className="task-item-meta">
                      {scope === "all" && (
                        <span>
                          {t("tasks.assignedTo")}: <strong>{task.assigneeName}</strong>
                        </span>
                      )}
                      <span>
                        {t("tasks.assignedBy")}: {task.createdByName}
                      </span>
                      {task.dueDate && (
                        <span className="row gap-1">
                          <CalendarClock size={13} /> {formatDate(task.dueDate)}
                        </span>
                      )}
                      {task.completedAt && (
                        <span>
                          {t("tasks.completedAt")}: {formatDateTime(task.completedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="task-item-actions">
                    {canAct && task.status === "TODO" && (
                      <button className="btn btn-secondary btn-sm" disabled={busyId === task.id} onClick={() => handleStatus(task, "IN_PROGRESS")}>
                        <Play size={14} /> {t("tasks.start")}
                      </button>
                    )}
                    {canAct && (task.status === "TODO" || task.status === "IN_PROGRESS") && (
                      <button className="btn btn-primary btn-sm" disabled={busyId === task.id} onClick={() => handleStatus(task, "DONE")}>
                        <CheckCircle2 size={14} /> {t("tasks.done")}
                      </button>
                    )}
                    {canAct && closed && (
                      <button className="btn btn-ghost btn-sm" disabled={busyId === task.id} onClick={() => handleStatus(task, "TODO")}>
                        <RotateCcw size={14} /> {t("tasks.reopen")}
                      </button>
                    )}
                    {canManage && (
                      <>
                        {!closed && (
                          <button className="btn btn-ghost btn-icon btn-sm" title={t("tasks.cancel")} onClick={() => handleStatus(task, "CANCELLED")}>
                            <XCircle size={16} />
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          title={t("common.edit")}
                          onClick={() => {
                            setEditing(task);
                            setModalOpen(true);
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" title={t("common.delete")} onClick={() => setDeleteTarget(task)}>
                          <Trash2 size={16} color="var(--color-danger-text)" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        submitting={submitting}
        task={editing}
        assignees={assignees}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("tasks.deleteConfirmTitle")}
        description={deleteTarget ? t("tasks.deleteConfirmDescription", { title: deleteTarget.title }) : undefined}
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
