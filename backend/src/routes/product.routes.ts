import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
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
const view = requirePermission("products.view");
const manage = requirePermission("products.manage");
router.get("/", view, listHandler);
router.get("/barcode/:barcode", view, getByBarcodeHandler);
router.post("/import", manage, importHandler);
router.post("/variant-groups", manage, createVariantGroupHandler);
router.get("/variant-groups/:groupId", view, getVariantGroupHandler);
router.get("/:id", view, getHandler);
router.get("/:id/analogs", view, getAnalogsHandler);
router.put("/:id/analogs", manage, setAnalogsHandler);
router.get("/:id/serials", view, listSerialsHandler);
router.get("/:id/batches", view, listBatchesHandler);
router.post("/", manage, createHandler);
router.put("/:id", manage, updateHandler);
router.delete("/:id", manage, deleteHandler);

export default router;
