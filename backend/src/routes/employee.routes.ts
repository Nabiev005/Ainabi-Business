import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { deleteHandler, inviteHandler, listHandler, resetPasswordHandler, updateHandler } from "../controllers/employee.controller";

const router = Router();

router.use(requireAuth, businessRateLimit, requirePermission("employees.manage"));
router.get("/", listHandler);
router.post("/", inviteHandler);
router.put("/:id", updateHandler);
router.post("/:id/password", resetPasswordHandler);
router.delete("/:id", deleteHandler);

export default router;
