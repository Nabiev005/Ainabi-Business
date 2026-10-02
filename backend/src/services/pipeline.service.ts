import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { toNumber } from "../utils/money";
import type { Db } from "../utils/stockLedger";
import type { Lang } from "../i18n/messages";
import { PipelineBoardQuery, StageInput } from "../validators/pipeline.validator";

/**
 * The product pipeline is a CRM-style board: each business defines its own
 * stages (Кабыл алынды → Текшерилүүдө → Сатыкка даяр …), new products enter
 * the first stage, and every move is logged in ProductStageEvent. A stage
 * flagged `blocksSale` keeps its products off the POS until they move on.
 */

const DEFAULT_STAGES: Record<Lang, { name: string; color: string; blocksSale: boolean }[]> = {
  ky: [
    { name: "Кабыл алынды", color: "#3b82f6", blocksSale: false },
    { name: "Текшерилүүдө", color: "#f59e0b", blocksSale: true },
    { name: "Сатыкка даяр", color: "#10b981", blocksSale: false },
  ],
  ru: [
    { name: "Принят", color: "#3b82f6", blocksSale: false },
    { name: "На проверке", color: "#f59e0b", blocksSale: true },
    { name: "Готов к продаже", color: "#10b981", blocksSale: false },
  ],
};

const CARDS_PER_STAGE = 200;

function serializeStage(stage: { id: string; name: string; color: string; position: number; blocksSale: boolean }) {
  return { id: stage.id, name: stage.name, color: stage.color, position: stage.position, blocksSale: stage.blocksSale };
}

export async function listStages(businessId: string) {
  const stages = await prisma.pipelineStage.findMany({ where: { businessId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return stages.map(serializeStage);
}

/** A first visit to the board gets a sensible starter pipeline the owner can then edit. */
async function ensureStages(businessId: string, lang: Lang) {
  const count = await prisma.pipelineStage.count({ where: { businessId } });
  if (count > 0) return;
  await prisma.pipelineStage.createMany({
    data: DEFAULT_STAGES[lang].map((s, position) => ({ businessId, ...s, position })),
  });
}

/** Where a newly created product lands: the first stage, if the business uses the pipeline. */
export async function firstStageId(db: Db, businessId: string): Promise<string | null> {
  const stage = await db.pipelineStage.findFirst({ where: { businessId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return stage?.id ?? null;
}

export async function getBoard(businessId: string, lang: Lang, query: PipelineBoardQuery) {
  await ensureStages(businessId, lang);
  const search = query.search?.trim();
  const productWhere: Prisma.ProductWhereInput = {
    businessId,
    status: "ACTIVE",
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search } },
            { attributesText: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const stages = await listStages(businessId);
  // One column per stage, plus "no stage" for products that predate the pipeline.
  const columns = [...stages.map((s) => ({ stage: s as ReturnType<typeof serializeStage> | null, stageId: s.id as string | null })), { stage: null, stageId: null }];

  const results = await Promise.all(
    columns.map(async ({ stageId }) => {
      const where = { ...productWhere, stageId };
      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: { category: { select: { name: true } } },
          orderBy: [{ stageChangedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          take: CARDS_PER_STAGE,
        }),
        prisma.product.count({ where }),
      ]);
      return { products, total };
    }),
  );

  return {
    stages,
    columns: columns.map(({ stage, stageId }, i) => ({
      stageId,
      stage,
      total: results[i].total,
      products: results[i].products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        categoryName: p.category?.name ?? null,
        quantity: toNumber(p.quantity),
        unit: p.unit,
        salePrice: toNumber(p.salePrice),
        imageUrl: p.imageUrl,
        stageChangedAt: p.stageChangedAt,
      })),
    })),
  };
}

const MAX_STAGES = 30;

export async function createStage(businessId: string, input: StageInput) {
  const count = await prisma.pipelineStage.count({ where: { businessId } });
  if (count >= MAX_STAGES) throw ApiError.badRequest("Эң көп 30 этап кошууга болот.");
  const last = await prisma.pipelineStage.findFirst({ where: { businessId }, orderBy: { position: "desc" } });
  const stage = await prisma.pipelineStage.create({
    data: { businessId, name: input.name, color: input.color, blocksSale: input.blocksSale, position: (last?.position ?? -1) + 1 },
  });
  return serializeStage(stage);
}

export async function updateStage(businessId: string, id: string, input: StageInput) {
  const stage = await prisma.pipelineStage.findFirst({ where: { id, businessId } });
  if (!stage) throw ApiError.notFound("Этап табылган жок.");
  const updated = await prisma.pipelineStage.update({
    where: { id },
    data: { name: input.name, color: input.color, blocksSale: input.blocksSale },
  });
  return serializeStage(updated);
}

/** Deleting a stage moves its products to "no stage" (they're never deleted). */
export async function deleteStage(businessId: string, id: string) {
  const stage = await prisma.pipelineStage.findFirst({ where: { id, businessId } });
  if (!stage) throw ApiError.notFound("Этап табылган жок.");
  await prisma.$transaction([
    prisma.product.updateMany({ where: { businessId, stageId: id }, data: { stageId: null, stageChangedAt: new Date() } }),
    prisma.pipelineStage.delete({ where: { id } }),
  ]);
}

export async function reorderStages(businessId: string, ids: string[]) {
  const stages = await prisma.pipelineStage.findMany({ where: { businessId }, select: { id: true } });
  const known = new Set(stages.map((s) => s.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) throw ApiError.badRequest("Этаптардын тизмеси туура эмес.");
  await prisma.$transaction(ids.map((id, position) => prisma.pipelineStage.update({ where: { id }, data: { position } })));
  return listStages(businessId);
}

export async function moveProducts(businessId: string, employeeId: string, productIds: string[], stageId: string | null) {
  if (stageId) {
    const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, businessId } });
    if (!stage) throw ApiError.notFound("Этап табылган жок.");
  }
  const ids = [...new Set(productIds)];
  const products = await prisma.product.findMany({ where: { id: { in: ids }, businessId }, select: { id: true, stageId: true } });
  if (products.length !== ids.length) throw ApiError.badRequest("Тандалган товарлардын айрымдары табылган жок.");

  const moving = products.filter((p) => p.stageId !== stageId);
  if (moving.length === 0) return { moved: 0 };
  const now = new Date();
  await prisma.$transaction([
    prisma.product.updateMany({ where: { id: { in: moving.map((p) => p.id) } }, data: { stageId, stageChangedAt: now } }),
    prisma.productStageEvent.createMany({
      data: moving.map((p) => ({ businessId, productId: p.id, fromStageId: p.stageId, toStageId: stageId, employeeId, createdAt: now })),
    }),
  ]);
  return { moved: moving.length };
}

/** Stage history of one product (shown in the product's drawer on the board). */
export async function productHistory(businessId: string, productId: string) {
  const events = await prisma.productStageEvent.findMany({
    where: { businessId, productId },
    include: { fromStage: true, toStage: true, employee: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return events.map((e) => ({
    id: e.id,
    fromStage: e.fromStage?.name ?? null,
    toStage: e.toStage?.name ?? null,
    employeeName: e.employee?.user.name ?? null,
    createdAt: e.createdAt,
  }));
}
