import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { moveProductsSchema, pipelineBoardQuerySchema, reorderStagesSchema, stageSchema } from "../validators/pipeline.validator";
import * as pipelineService from "../services/pipeline.service";

export const boardHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = pipelineBoardQuerySchema.parse(req.query);
  res.json(await pipelineService.getBoard(req.auth!.businessId, req.lang, query));
});

export const listStagesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await pipelineService.listStages(req.auth!.businessId));
});

export const createStageHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = stageSchema.parse(req.body);
  res.status(201).json(await pipelineService.createStage(req.auth!.businessId, input));
});

export const updateStageHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = stageSchema.parse(req.body);
  res.json(await pipelineService.updateStage(req.auth!.businessId, req.params.id, input));
});

export const deleteStageHandler = asyncHandler(async (req: Request, res: Response) => {
  await pipelineService.deleteStage(req.auth!.businessId, req.params.id);
  res.status(204).send();
});

export const reorderStagesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = reorderStagesSchema.parse(req.body);
  res.json(await pipelineService.reorderStages(req.auth!.businessId, ids));
});

export const moveHandler = asyncHandler(async (req: Request, res: Response) => {
  const { productIds, stageId } = moveProductsSchema.parse(req.body);
  res.json(await pipelineService.moveProducts(req.auth!.businessId, req.auth!.employeeId, productIds, stageId));
});

export const historyHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await pipelineService.productHistory(req.auth!.businessId, req.params.productId));
});
