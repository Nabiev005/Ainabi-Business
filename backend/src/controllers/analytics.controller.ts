import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { reportQuerySchema } from "../validators/report.validator";
import { monthlyPlanSchema } from "../validators/analytics.validator";
import * as analyticsService from "../services/analytics.service";

export const analyticsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = reportQuerySchema.parse(req.query);
  res.json(await analyticsService.buildAnalytics(req.auth!.businessId, query));
});

export const setPlanHandler = asyncHandler(async (req: Request, res: Response) => {
  const { monthlyRevenuePlan } = monthlyPlanSchema.parse(req.body);
  res.json(await analyticsService.setMonthlyPlan(req.auth!.businessId, monthlyRevenuePlan));
});
