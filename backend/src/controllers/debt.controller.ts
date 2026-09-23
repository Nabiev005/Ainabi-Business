import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { createDebtPaymentSchema, createDebtSchema } from "../validators/debt.validator";
import * as debtService from "../services/debt.service";

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const debts = await debtService.listDebts(req.auth!.businessId, req.query.status as string | undefined);
  res.json(debts);
});

export const summaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const summary = await debtService.debtSummary(req.auth!.businessId);
  res.json(summary);
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createDebtSchema.parse(req.body);
  const debt = await debtService.createDebt(req.auth!.businessId, input);
  res.status(201).json(debt);
});

export const addPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createDebtPaymentSchema.parse(req.body);
  const payment = await debtService.addPayment(req.auth!.businessId, req.params.id, input, req.auth!.employeeId);
  res.status(201).json(payment);
});
