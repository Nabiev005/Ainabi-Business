import { api } from "./api";
import type { ProductUnit } from "../types";

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  position: number;
  blocksSale: boolean;
}

export interface PipelineCard {
  id: string;
  name: string;
  sku: string | null;
  categoryName: string | null;
  quantity: number;
  unit: ProductUnit;
  salePrice: number;
  imageUrl: string | null;
  stageChangedAt: string | null;
}

export interface PipelineColumn {
  /** null = products that aren't in any stage yet. */
  stageId: string | null;
  stage: PipelineStage | null;
  total: number;
  products: PipelineCard[];
}

export interface PipelineBoard {
  stages: PipelineStage[];
  columns: PipelineColumn[];
}

export interface StageHistoryEntry {
  id: string;
  fromStage: string | null;
  toStage: string | null;
  employeeName: string | null;
  createdAt: string;
}

export type StagePayload = Pick<PipelineStage, "name" | "color" | "blocksSale">;

export async function getBoard(search?: string): Promise<PipelineBoard> {
  const { data } = await api.get<PipelineBoard>("/pipeline/board", { params: { search: search || undefined } });
  return data;
}

export async function moveProducts(productIds: string[], stageId: string | null): Promise<{ moved: number }> {
  const { data } = await api.post<{ moved: number }>("/pipeline/move", { productIds, stageId });
  return data;
}

export async function getProductHistory(productId: string): Promise<StageHistoryEntry[]> {
  const { data } = await api.get<StageHistoryEntry[]>(`/pipeline/products/${productId}/history`);
  return data;
}

export async function createStage(payload: StagePayload): Promise<PipelineStage> {
  const { data } = await api.post<PipelineStage>("/pipeline/stages", payload);
  return data;
}

export async function updateStage(id: string, payload: StagePayload): Promise<PipelineStage> {
  const { data } = await api.put<PipelineStage>(`/pipeline/stages/${id}`, payload);
  return data;
}

export async function deleteStage(id: string): Promise<void> {
  await api.delete(`/pipeline/stages/${id}`);
}

export async function reorderStages(ids: string[]): Promise<PipelineStage[]> {
  const { data } = await api.put<PipelineStage[]>("/pipeline/stages/reorder", { ids });
  return data;
}
