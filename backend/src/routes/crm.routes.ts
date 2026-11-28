import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { requireFeature } from "../middleware/subscription";
import { asyncHandler } from "../utils/asyncHandler";
import { activitySchema, crmProfileSchema, followUpQuerySchema, segmentQuerySchema } from "../validators/crm.validator";
import * as crm from "../services/crm.service";

// CRM is a Max module. Reading follows the customers page; writing needs customers.manage.
const router = Router();
router.use(requireAuth, businessRateLimit, requireFeature("crm"), requirePermission("customers.view"));
const manage = requirePermission("customers.manage");

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(req.query);
    res.json(await crm.overview(req.auth!.businessId, days));
  }),
);

router.get(
  "/customers",
  asyncHandler(async (req, res) => {
    res.json(await crm.listSegment(req.auth!.businessId, segmentQuerySchema.parse(req.query)));
  }),
);

router.get(
  "/follow-ups",
  asyncHandler(async (req, res) => {
    res.json(await crm.listFollowUps(req.auth!.businessId, followUpQuerySchema.parse(req.query).when));
  }),
);

router.get(
  "/customers/:id/activities",
  asyncHandler(async (req, res) => {
    res.json(await crm.listActivities(req.auth!.businessId, req.params.id));
  }),
);

router.post(
  "/customers/:id/activities",
  manage,
  asyncHandler(async (req, res) => {
    res.status(201).json(await crm.addActivity(req.auth!.businessId, req.auth!.employeeId, req.params.id, activitySchema.parse(req.body)));
  }),
);

router.put(
  "/customers/:id/profile",
  manage,
  asyncHandler(async (req, res) => {
    res.json(await crm.updateProfile(req.auth!.businessId, req.params.id, crmProfileSchema.parse(req.body)));
  }),
);

router.post(
  "/activities/:id/done",
  manage,
  asyncHandler(async (req, res) => {
    const { done } = z.object({ done: z.boolean().default(true) }).parse(req.body ?? {});
    res.json(await crm.setFollowUpDone(req.auth!.businessId, req.params.id, done));
  }),
);

router.delete(
  "/activities/:id",
  manage,
  asyncHandler(async (req, res) => {
    await crm.deleteActivity(req.auth!.businessId, req.params.id);
    res.status(204).send();
  }),
);

export default router;
