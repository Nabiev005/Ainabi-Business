import { Prisma, Task } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { hasPermission, Role } from "../config/permissions";
import { CreateTaskInput, TaskQuery, UpdateTaskInput } from "../validators/task.validator";

const include = {
  assignee: { include: { user: { select: { name: true } } } },
  createdBy: { include: { user: { select: { name: true } } } },
} satisfies Prisma.TaskInclude;

type TaskWithPeople = Task & { assignee: { user: { name: string } }; createdBy: { user: { name: string } } };

function serializeTask(task: TaskWithPeople) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    overdue: !!task.dueDate && task.dueDate < startOfToday && (task.status === "TODO" || task.status === "IN_PROGRESS"),
    assigneeId: task.assigneeId,
    assigneeName: task.assignee.user.name,
    createdById: task.createdById,
    createdByName: task.createdBy.user.name,
    seen: !!task.seenAt,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

async function assertAssignee(businessId: string, assigneeId: string) {
  const employee = await prisma.employee.findFirst({ where: { id: assigneeId, businessId, status: "ACTIVE" } });
  if (!employee) throw ApiError.badRequest("Кызматкер табылган жок.");
}

/** Loads a task of this business the caller may act on: their own, or any with tasks.manage. */
async function findVisibleTask(businessId: string, employeeId: string, role: Role, id: string) {
  const task = await prisma.task.findFirst({ where: { id, businessId } });
  if (!task) throw ApiError.notFound("Тапшырма табылган жок.");
  if (task.assigneeId !== employeeId && !hasPermission(role, "tasks.manage")) throw ApiError.forbidden();
  return task;
}

export async function listTasks(businessId: string, employeeId: string, role: Role, query: TaskQuery) {
  const all = query.scope === "all";
  if (all && !hasPermission(role, "tasks.manage")) throw ApiError.forbidden();

  const where: Prisma.TaskWhereInput = {
    businessId,
    ...(all ? (query.assigneeId ? { assigneeId: query.assigneeId } : {}) : { assigneeId: employeeId }),
    ...(query.status === "OPEN"
      ? { status: { in: ["TODO", "IN_PROGRESS"] } }
      : query.status
        ? { status: query.status }
        : {}),
  };
  const tasks = await prisma.task.findMany({
    where,
    include,
    // Open work first, then the most urgent.
    orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
  });
  return tasks.map(serializeTask);
}

/** Who a task can be given to — active employees, name and role only. */
export async function listAssignees(businessId: string) {
  const employees = await prisma.employee.findMany({
    where: { businessId, status: "ACTIVE" },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return employees.map((e) => ({ id: e.id, name: e.user.name, role: e.role }));
}

/** What the bell shows: my open tasks, newest first, with how many I haven't seen yet. */
export async function myTaskNotifications(businessId: string, employeeId: string) {
  const where: Prisma.TaskWhereInput = { businessId, assigneeId: employeeId, status: { in: ["TODO", "IN_PROGRESS"] } };
  const [tasks, unseen] = await Promise.all([
    prisma.task.findMany({ where, include, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.task.count({ where: { ...where, seenAt: null } }),
  ]);
  return { unseen, tasks: tasks.map(serializeTask) };
}

export async function markMyTasksSeen(businessId: string, employeeId: string) {
  await prisma.task.updateMany({ where: { businessId, assigneeId: employeeId, seenAt: null }, data: { seenAt: new Date() } });
}

export async function createTask(businessId: string, employeeId: string, input: CreateTaskInput) {
  await assertAssignee(businessId, input.assigneeId);
  const task = await prisma.task.create({
    data: {
      businessId,
      title: input.title,
      description: input.description || null,
      assigneeId: input.assigneeId,
      createdById: employeeId,
      priority: input.priority,
      dueDate: input.dueDate ? new Date(`${input.dueDate}T23:59:59`) : null,
      // Assigning a task to yourself isn't news.
      seenAt: input.assigneeId === employeeId ? new Date() : null,
    },
    include,
  });
  return serializeTask(task);
}

export async function updateTask(businessId: string, id: string, input: UpdateTaskInput) {
  const task = await prisma.task.findFirst({ where: { id, businessId } });
  if (!task) throw ApiError.notFound("Тапшырма табылган жок.");
  if (input.assigneeId) await assertAssignee(businessId, input.assigneeId);
  const reassigned = !!input.assigneeId && input.assigneeId !== task.assigneeId;

  const updated = await prisma.task.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description === undefined ? undefined : input.description || null,
      assigneeId: input.assigneeId,
      priority: input.priority,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(`${input.dueDate}T23:59:59`) : null,
      // The new assignee gets it as a fresh notification.
      ...(reassigned ? { seenAt: null } : {}),
    },
    include,
  });
  return serializeTask(updated);
}

export async function changeTaskStatus(businessId: string, employeeId: string, role: Role, id: string, status: Task["status"]) {
  await findVisibleTask(businessId, employeeId, role, id);
  // Only a manager can cancel a task; the assignee reports progress.
  if (status === "CANCELLED" && !hasPermission(role, "tasks.manage")) throw ApiError.forbidden();
  const updated = await prisma.task.update({
    where: { id },
    data: { status, completedAt: status === "DONE" ? new Date() : null, seenAt: new Date() },
    include,
  });
  return serializeTask(updated);
}

export async function deleteTask(businessId: string, id: string) {
  const task = await prisma.task.findFirst({ where: { id, businessId } });
  if (!task) throw ApiError.notFound("Тапшырма табылган жок.");
  await prisma.task.delete({ where: { id } });
}
