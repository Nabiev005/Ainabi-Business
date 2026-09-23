import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { translate } from "../i18n/messages";
import {
  analogsSchema,
  importSchema,
  productQuerySchema,
  productSchema,
  variantGroupSchema,
} from "../validators/product.validator";
import * as productService from "../services/product.service";

const locationQuery = z.object({ locationId: z.string().optional() });

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = productQuerySchema.parse(req.query);
  const result = await productService.listProducts(req.auth!.businessId, query);
  res.json(result);
});

export const getHandler = asyncHandler(async (req: Request, res: Response) => {
  const { locationId } = locationQuery.parse(req.query);
  const product = await productService.getProduct(req.auth!.businessId, req.params.id, locationId);
  res.json(product);
});

export const getByBarcodeHandler = asyncHandler(async (req: Request, res: Response) => {
  const { locationId } = locationQuery.parse(req.query);
  const product = await productService.findByBarcode(req.auth!.businessId, req.params.barcode, locationId);
  res.json(product);
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = productSchema.parse(req.body);
  const product = await productService.createProduct(req.auth!.businessId, input, req.auth!.employeeId);
  res.status(201).json(product);
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = productSchema.parse(req.body);
  const product = await productService.updateProduct(req.auth!.businessId, req.params.id, input);
  res.json(product);
});

export const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  await productService.deleteProduct(req.auth!.businessId, req.params.id);
  res.status(204).send();
});

export const createVariantGroupHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = variantGroupSchema.parse(req.body);
  const result = await productService.createVariantGroup(req.auth!.businessId, input, req.auth!.employeeId);
  res.status(201).json(result);
});

export const getVariantGroupHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await productService.getVariantGroup(req.auth!.businessId, req.params.groupId));
});

export const getAnalogsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { locationId } = locationQuery.parse(req.query);
  res.json(await productService.getAnalogs(req.auth!.businessId, req.params.id, locationId));
});

export const setAnalogsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { analogIds } = analogsSchema.parse(req.body);
  res.json(await productService.setAnalogs(req.auth!.businessId, req.params.id, analogIds));
});

export const listSerialsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { status } = z.object({ status: z.enum(["IN_STOCK", "SOLD"]).optional() }).parse(req.query);
  res.json(await productService.listSerials(req.auth!.businessId, req.params.id, status));
});

export const listBatchesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await productService.listBatches(req.auth!.businessId, req.params.id));
});

export const importHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = importSchema.parse(req.body);
  const result = await productService.importProducts(req.auth!.businessId, input, req.auth!.employeeId);
  // Row errors are collected (not thrown), so translate them here.
  res.json({
    ...result,
    errors: result.errors.map((e) => ({
      row: e.row,
      message: e.message.startsWith("[") ? translate("Киргизилген маалыматта ката бар.", req.lang) : translate(e.message, req.lang),
    })),
  });
});

