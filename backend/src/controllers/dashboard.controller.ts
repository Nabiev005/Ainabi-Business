import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { dashboardQuerySchema } from "../validators/dashboard.validator";
import * as dashboardService from "../services/dashboard.service";

export const summaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = dashboardQuerySchema.parse(req.query);
  const result = await dashboardService.getDashboard(req.auth!.businessId, query);
  res.json(result);
});

export const salesDynamicsHandler = asyncHandler(async (req: Request, res: Response) => {
  const days = req.query.days ? Number(req.query.days) : 7;
  const result = await dashboardService.getSalesDynamics(req.auth!.businessId, days);
  res.json(result);
});

export const topProductsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = dashboardQuerySchema.parse(req.query);
  const result = await dashboardService.getTopProducts(req.auth!.businessId, query);
  res.json(result);
});

export const alertsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await dashboardService.getAlerts(req.auth!.businessId, req.auth!.employeeId));
});

export const lowStockHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await dashboardService.getLowStock(req.auth!.businessId);
  res.json(result);
});
