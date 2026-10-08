import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { asyncHandler } from "../utils/asyncHandler";
import { createWholesaleOrderSchema, wholesaleSettingsSchema, wholesaleStatusSchema } from "../validators/wholesale.validator";
import * as wholesale from "../services/wholesale.service";

const router = Router();
router.use(requireAuth, businessRateLimit);

const buy = requirePermission("wholesale.buy");
const listQuery = z.object({ search: z.string().max(100).optional(), page: z.coerce.number().int().positive().max(500).default(1) });

router.get(
  "/settings",
  requirePermission("settings.business"),
  asyncHandler(async (req, res) => {
    res.json(await wholesale.getSettings(req.auth!.businessId));
  }),
);
router.put(
  "/settings",
  requirePermission("settings.business"),
  asyncHandler(async (req, res) => {
    res.json(await wholesale.updateSettings(req.auth!.businessId, wholesaleSettingsSchema.parse(req.body)));
  }),
);

router.get(
  "/suppliers",
  buy,
  asyncHandler(async (req, res) => {
    res.json(await wholesale.listSuppliers(req.auth!.businessId, listQuery.parse(req.query).search));
  }),
);
router.get(
  "/suppliers/:id/products",
  buy,
  asyncHandler(async (req, res) => {
    res.json(await wholesale.listSupplierProducts(req.auth!.businessId, req.params.id, listQuery.parse(req.query)));
  }),
);

router.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const { side } = z.object({ side: z.enum(["BUYER", "SELLER"]) }).parse(req.query);
    res.json(await wholesale.listOrders(req.auth!.businessId, req.auth!.role, side));
  }),
);
router.get(
  "/orders/incoming-count",
  requirePermission("wholesale.sell"),
  asyncHandler(async (req, res) => {
    res.json({ count: await wholesale.incomingCount(req.auth!.businessId) });
  }),
);
router.get(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    res.json(await wholesale.getOrder(req.auth!.businessId, req.auth!.role, req.params.id));
  }),
);
router.post(
  "/orders",
  buy,
  asyncHandler(async (req, res) => {
    res.status(201).json(await wholesale.createOrder(req.auth!.businessId, req.auth!.employeeId, createWholesaleOrderSchema.parse(req.body)));
  }),
);
router.post(
  "/orders/:id/status",
  asyncHandler(async (req, res) => {
    res.json(await wholesale.changeStatus(req.auth!.businessId, req.auth!.employeeId, req.auth!.role, req.params.id, wholesaleStatusSchema.parse(req.body)));
  }),
);

export default router;
