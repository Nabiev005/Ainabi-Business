import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { prisma } from "../config/prisma";
import { applyTemplateSchema, updateBusinessSchema, updateProductConfigSchema } from "../validators/settings.validator";
import * as settingsService from "../services/settings.service";

export const getBusinessHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await settingsService.getBusiness(req.auth!.businessId));
});

export const updateBusinessHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateBusinessSchema.parse(req.body);
  res.json(await settingsService.updateBusiness(req.auth!.businessId, input));
});

export const templatesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(settingsService.listTemplates(req.lang));
});

export const applyTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = applyTemplateSchema.parse(req.body);
  const business = await prisma.$transaction((tx) => settingsService.applyTemplate(tx, req.auth!.businessId, input, req.lang));
  res.json(business);
});

export const updateProductConfigHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateProductConfigSchema.parse(req.body);
  res.json(await settingsService.updateProductConfig(req.auth!.businessId, input));
});
