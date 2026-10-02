import { Router } from "express";
import { changePasswordHandler, googleHandler, loginHandler, logoutHandler, meHandler, refreshHandler, registerHandler } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/register", registerHandler);
router.post("/login", loginHandler);
router.post("/google", googleHandler);
router.post("/refresh", refreshHandler);
router.post("/logout", logoutHandler);
router.get("/me", requireAuth, meHandler);
router.post("/change-password", requireAuth, changePasswordHandler);

export default router;
