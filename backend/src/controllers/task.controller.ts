import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { createTaskSchema, taskQuerySchema, taskStatusSchema, updateTaskSchema } from "../validators/task.validator";
import * as taskService from "../services/task.service";

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = taskQuerySchema.parse(req.query);
  res.json(await taskService.listTasks(req.auth!.businessId, req.auth!.employeeId, req.auth!.role, query));
});

export const assigneesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await taskService.listAssignees(req.auth!.businessId));
});

export const notificationsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await taskService.myTaskNotifications(req.auth!.businessId, req.auth!.employeeId));
});

export const markSeenHandler = asyncHandler(async (req: Request, res: Response) => {
  await taskService.markMyTasksSeen(req.auth!.businessId, req.auth!.employeeId);
  res.status(204).send();
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createTaskSchema.parse(req.body);
  res.status(201).json(await taskService.createTask(req.auth!.businessId, req.auth!.employeeId, input));
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateTaskSchema.parse(req.body);
  res.json(await taskService.updateTask(req.auth!.businessId, req.params.id, input));
});

export const statusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { status } = taskStatusSchema.parse(req.body);
  res.json(await taskService.changeTaskStatus(req.auth!.businessId, req.auth!.employeeId, req.auth!.role, req.params.id, status));
});

export const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  await taskService.deleteTask(req.auth!.businessId, req.params.id);
  res.status(204).send();
});
