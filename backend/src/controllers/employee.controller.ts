import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { inviteEmployeeSchema, resetEmployeePasswordSchema, updateEmployeeSchema } from "../validators/employee.validator";
import * as employeeService from "../services/employee.service";

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const employees = await employeeService.listEmployees(req.auth!.businessId);
  res.json(employees);
});

export const inviteHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = inviteEmployeeSchema.parse(req.body);
  const employee = await employeeService.inviteEmployee(req.auth!.businessId, input);
  res.status(201).json(employee);
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateEmployeeSchema.parse(req.body);
  const employee = await employeeService.updateEmployee(req.auth!.businessId, req.params.id, input);
  res.json(employee);
});

export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { password } = resetEmployeePasswordSchema.parse(req.body);
  await employeeService.resetEmployeePassword(req.auth!.businessId, req.params.id, password);
  res.status(204).send();
});

export const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  await employeeService.removeEmployee(req.auth!.businessId, req.params.id);
  res.status(204).send();
});
