import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { reportQuerySchema } from "../validators/report.validator";
import * as reportService from "../services/report.service";
import { toCsv } from "../utils/csv";

export const summaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = reportQuerySchema.parse(req.query);
  const report = await reportService.buildReport(req.auth!.businessId, query);
  res.json(report);
});

export const exportCsvHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = reportQuerySchema.parse(req.query);
  const report = await reportService.buildReport(req.auth!.businessId, query);
  const csv = toCsv(
    report.productPerformance.map((p) => ({
      Товар: p.name,
      "Сатылган саны": p.quantitySold,
      "Киреше (сом)": p.revenue,
      "Пайда (сом)": p.profit,
    })),
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="report-${Date.now()}.csv"`);
  res.send(`﻿${csv}`);
});
