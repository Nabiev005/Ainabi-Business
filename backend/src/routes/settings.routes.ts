import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requireRole } from "../middleware/requireRole";
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
router.put("/business", requireRole("OWNER"), updateBusinessHandler);
router.get("/templates", templatesHandler);
router.post("/business-type", requireRole("OWNER"), applyTemplateHandler);
router.put("/product-config", requireRole("OWNER", "ADMIN"), updateProductConfigHandler);
router.get("/locations", listLocationsHandler);
router.post("/locations", requireRole("OWNER"), createLocationHandler);
router.put("/locations/:id", requireRole("OWNER"), updateLocationHandler);

export default router;
