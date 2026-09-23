import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { createRepairSchema, repairQuerySchema, repairStatusSchema, updateRepairSchema } from "../validators/repair.validator";
import * as repairService from "../services/repair.service";

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = repairQuerySchema.parse(req.query);
  res.json(await repairService.listRepairs(req.auth!.businessId, query));
});

export const getHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await repairService.getRepair(req.auth!.businessId, req.params.id));
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createRepairSchema.parse(req.body);
  res.status(201).json(await repairService.createRepair(req.auth!.businessId, req.auth!.employeeId, input));
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateRepairSchema.parse(req.body);
  res.json(await repairService.updateRepair(req.auth!.businessId, req.params.id, input));
});

export const statusHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = repairStatusSchema.parse(req.body);
  res.json(await repairService.changeRepairStatus(req.auth!.businessId, req.auth!.employeeId, req.params.id, input));
});
