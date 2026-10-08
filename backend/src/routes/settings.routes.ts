import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { asyncHandler } from "../utils/asyncHandler";
import { currencySettingsSchema } from "../validators/settings.validator";
import * as currencyService from "../services/currency.service";
import {
  applyTemplateHandler,
  createLocationHandler,
  getBusinessHandler,
  listLocationsHandler,
  updateLocationHandler,
  templatesHandler,
  updateBusinessHandler,
  updateProductConfigHandler,
} from "../controllers/settings.controller";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/business", getBusinessHandler);
router.put("/business", requirePermission("settings.business"), updateBusinessHandler);
router.get("/templates", templatesHandler);
router.post("/business-type", requirePermission("settings.business"), applyTemplateHandler);
router.put("/product-config", requirePermission("settings.products"), updateProductConfigHandler);
router.get("/locations", listLocationsHandler);
router.get(
  "/currency",
  requirePermission("settings.products"),
  asyncHandler(async (req, res) => {
    res.json(await currencyService.getCurrencySettings(req.auth!.businessId));
  }),
);
router.put(
  "/currency",
  requirePermission("settings.products"),
  asyncHandler(async (req, res) => {
    res.json(await currencyService.updateCurrencySettings(req.auth!.businessId, currencySettingsSchema.parse(req.body)));
  }),
);
router.post("/locations", requirePermission("settings.business"), createLocationHandler);
router.put("/locations/:id", requirePermission("settings.business"), updateLocationHandler);

export default router;
