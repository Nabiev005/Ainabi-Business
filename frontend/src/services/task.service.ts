import { api } from "./api";
import type { Role } from "../types";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type TaskPriority = "LOW" | "NORMAL" | "HIGH";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  overdue: boolean;
  assigneeId: string;
  assigneeName: string;
  createdById: string;
  createdByName: string;
  seen: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskPayload {
  title: string;
  description?: string | null;
  assigneeId: string;
  priority: TaskPriority;
  /** yyyy-mm-dd */
  dueDate?: string | null;
}

export async function listTasks(params: { scope: "mine" | "all"; status?: TaskStatus | "OPEN"; assigneeId?: string }): Promise<Task[]> {
  const { data } = await api.get<Task[]>("/tasks", { params });
  return data;
}

export async function getTaskNotifications(): Promise<{ unseen: number; tasks: Task[] }> {
  const { data } = await api.get<{ unseen: number; tasks: Task[] }>("/tasks/notifications");
  return data;
}

export async function markTasksSeen(): Promise<void> {
  await api.post("/tasks/notifications/seen");
}

export async function createTask(payload: TaskPayload): Promise<Task> {
  const { data } = await api.post<Task>("/tasks", payload);
  return data;
}

export async function updateTask(id: string, payload: Partial<TaskPayload>): Promise<Task> {
  const { data } = await api.put<Task>(`/tasks/${id}`, payload);
  return data;
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  const { data } = await api.post<Task>(`/tasks/${id}/status`, { status });
  return data;
}

export async function deleteTask(id: string): Promise<void> {
  await api.delete(`/tasks/${id}`);
}

export async function listAssignees(): Promise<{ id: string; name: string; role: Role }[]> {
  const { data } = await api.get<{ id: string; name: string; role: Role }[]>("/tasks/assignees");
  return data;
}
