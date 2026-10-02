import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../components/ui/Modal";
import { useLabels } from "../../hooks/useLabels";
import type { Task, TaskPayload, TaskPriority } from "../../services/task.service";
import type { Role } from "../../types";

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  submitting: boolean;
  /** Editing an existing task; null = new task. */
  task: Task | null;
  assignees: { id: string; name: string; role: Role }[];
  onSubmit: (values: TaskPayload) => Promise<void>;
}

const PRIORITIES: TaskPriority[] = ["LOW", "NORMAL", "HIGH"];

export function TaskModal({ open, onClose, submitting, task, assignees, onSubmit }: TaskModalProps) {
  const { t } = useTranslation();
  const labels = useLabels();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setAssigneeId(task?.assigneeId ?? "");
    setPriority(task?.priority ?? "NORMAL");
    setDueDate(task?.dueDate ? task.dueDate.slice(0, 10) : "");
  }, [open, task]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !assigneeId) return;
    await onSubmit({ title: title.trim(), description: description.trim() || null, assigneeId, priority, dueDate: dueDate || null });
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form className="stack gap-4" onSubmit={handleSubmit}>
        <h2 className="card-title">{task ? t("tasks.modal.editTitle") : t("tasks.modal.title")}</h2>

        <div className="field">
          <label className="field-label">{t("tasks.modal.taskTitle")}</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("tasks.modal.taskTitlePlaceholder")} maxLength={200} required autoFocus />
        </div>

        <div className="field">
          <label className="field-label">{t("tasks.modal.description")}</label>
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("tasks.modal.descriptionPlaceholder")} maxLength={2000} />
        </div>

        <div className="field">
          <label className="field-label">{t("tasks.modal.assignee")}</label>
          <select className="select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required>
            <option value="">{t("tasks.modal.chooseAssignee")}</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {labels.role[a.role]}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("tasks.modal.priority")}</label>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`tasks.priority.${p}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">{t("tasks.modal.dueDate")}</label>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? t("common.saving") : task ? t("common.save") : t("tasks.modal.assign")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
