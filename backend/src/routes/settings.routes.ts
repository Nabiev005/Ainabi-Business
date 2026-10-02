import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
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
router.post("/locations", requirePermission("settings.business"), createLocationHandler);
router.put("/locations/:id", requirePermission("settings.business"), updateLocationHandler);

export default router;
