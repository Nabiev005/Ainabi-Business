import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { customerSchema } from "../validators/customer.validator";
import * as customerService from "../services/customer.service";

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const customers = await customerService.listCustomers(req.auth!.businessId, req.query.search as string | undefined);
  res.json(customers);
});

export const getHandler = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.getCustomer(req.auth!.businessId, req.params.id);
  res.json(customer);
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = customerSchema.parse(req.body);
  const customer = await customerService.createCustomer(req.auth!.businessId, req.auth!.role, input);
  res.status(201).json(customer);
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = customerSchema.parse(req.body);
  const customer = await customerService.updateCustomer(req.auth!.businessId, req.auth!.role, req.params.id, input);
  res.json(customer);
});

export const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  await customerService.deleteCustomer(req.auth!.businessId, req.params.id);
  res.status(204).send();
});
