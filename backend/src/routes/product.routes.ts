import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requireRole } from "../middleware/requireRole";
import {
  createHandler,
  createVariantGroupHandler,
  deleteHandler,
  getAnalogsHandler,
  getByBarcodeHandler,
  getHandler,
  getVariantGroupHandler,
  importHandler,
  listBatchesHandler,
  listHandler,
  listSerialsHandler,
  setAnalogsHandler,
  updateHandler,
} from "../controllers/product.controller";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/", listHandler);
router.get("/barcode/:barcode", getByBarcodeHandler);
router.post("/import", requireRole("OWNER", "ADMIN"), importHandler);
router.post("/variant-groups", requireRole("OWNER", "ADMIN"), createVariantGroupHandler);
router.get("/variant-groups/:groupId", getVariantGroupHandler);
router.get("/:id", getHandler);
router.get("/:id/analogs", getAnalogsHandler);
router.put("/:id/analogs", requireRole("OWNER", "ADMIN"), setAnalogsHandler);
router.get("/:id/serials", listSerialsHandler);
router.get("/:id/batches", listBatchesHandler);
router.post("/", requireRole("OWNER", "ADMIN"), createHandler);
router.put("/:id", requireRole("OWNER", "ADMIN"), updateHandler);
router.delete("/:id", requireRole("OWNER", "ADMIN"), deleteHandler);

export default router;
