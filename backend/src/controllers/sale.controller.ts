import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { createSaleSchema, saleQuerySchema } from "../validators/sale.validator";
import * as saleService from "../services/sale.service";

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = saleQuerySchema.parse(req.query);
  const result = await saleService.listSales(req.auth!.businessId, query);
  res.json(result);
});

export const bySerialHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await saleService.findBySerial(req.auth!.businessId, req.params.serial);
  res.json(result);
});

export const getHandler = asyncHandler(async (req: Request, res: Response) => {
  const sale = await saleService.getSale(req.auth!.businessId, req.params.id);
  res.json(sale);
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSaleSchema.parse(req.body);
  const sale = await saleService.createSale(req.auth!.businessId, req.auth!.employeeId, input);
  res.status(201).json(sale);
});
