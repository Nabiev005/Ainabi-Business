import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { alertsHandler, lowStockHandler, salesDynamicsHandler, summaryHandler, topProductsHandler } from "../controllers/dashboard.controller";
import { requirePermission } from "../middleware/requireRole";

const router = Router();

router.use(requireAuth, businessRateLimit);
// Revenue / profit figures — finance roles only.
router.get("/summary", requirePermission("reports.view"), summaryHandler);
router.get("/sales-dynamics", requirePermission("reports.view"), salesDynamicsHandler);
router.get("/top-products", requirePermission("reports.view"), topProductsHandler);
// No money in these — every role gets the stock / attention badges.
router.get("/low-stock", requirePermission("products.view"), lowStockHandler);
router.get("/alerts", requirePermission("products.view"), alertsHandler);

export default router;
