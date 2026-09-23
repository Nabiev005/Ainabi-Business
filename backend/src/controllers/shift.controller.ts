import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import * as shiftService from "../services/shift.service";

const openSchema = z.object({ openingCash: z.coerce.number().nonnegative().default(0) });
const closeSchema = z.object({ countedCash: z.coerce.number().nonnegative(), note: z.string().trim().max(500).optional().nullable() });
const cashSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amount: z.coerce.number().positive("Сумма 0дон чоң болушу керек"),
  reason: z.string().trim().max(200).optional().nullable(),
});
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const currentHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await shiftService.getCurrentShift(req.auth!.businessId, req.auth!.employeeId));
});

export const openHandler = asyncHandler(async (req: Request, res: Response) => {
  const { openingCash } = openSchema.parse(req.body ?? {});
  res.status(201).json(await shiftService.openShift(req.auth!.businessId, req.auth!.employeeId, openingCash));
});

export const closeHandler = asyncHandler(async (req: Request, res: Response) => {
  const { countedCash, note } = closeSchema.parse(req.body);
  res.json(await shiftService.closeShift(req.auth!.businessId, req.auth!.employeeId, req.auth!.role, req.params.id, countedCash, note));
});

export const cashHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = cashSchema.parse(req.body);
  res.json(await shiftService.addCashMovement(req.auth!.businessId, req.auth!.employeeId, input));
});

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = listSchema.parse(req.query);
  res.json(await shiftService.listShifts(req.auth!.businessId, req.auth!.employeeId, req.auth!.role, page, pageSize));
});

export const getHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await shiftService.getShift(req.auth!.businessId, req.auth!.employeeId, req.auth!.role, req.params.id));
});
