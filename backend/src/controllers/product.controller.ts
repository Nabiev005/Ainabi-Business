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
import { hasPermission } from "../config/permissions";

const locationQuery = z.object({ locationId: z.string().optional() });

/** Roles without "costs.view" (the cashier) never receive the purchase
 * price or anything derived from it. */
function forViewer<T extends { purchasePrice?: unknown; profit?: unknown; marginPercent?: unknown }>(req: Request, product: T) {
  if (hasPermission(req.auth!.role, "costs.view")) return product;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { purchasePrice, profit, marginPercent, ...rest } = product;
  return rest;
}

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = productQuerySchema.parse(req.query);
  const result = await productService.listProducts(req.auth!.businessId, query);
  res.json({ ...result, items: result.items.map((p) => forViewer(req, p)) });
});

export const getHandler = asyncHandler(async (req: Request, res: Response) => {
  const { locationId } = locationQuery.parse(req.query);
  const product = await productService.getProduct(req.auth!.businessId, req.params.id, locationId);
  res.json(forViewer(req, product));
});

export const getByBarcodeHandler = asyncHandler(async (req: Request, res: Response) => {
  const { locationId } = locationQuery.parse(req.query);
  const product = await productService.findByBarcode(req.auth!.businessId, req.params.barcode, locationId);
  res.json(forViewer(req, product));
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
  const group = await productService.getVariantGroup(req.auth!.businessId, req.params.groupId);
  res.json({ ...group, variants: group.variants.map((p) => forViewer(req, p)) });
});

export const getAnalogsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { locationId } = locationQuery.parse(req.query);
  const analogs = await productService.getAnalogs(req.auth!.businessId, req.params.id, locationId);
  res.json(analogs.map((p) => forViewer(req, p)));
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

