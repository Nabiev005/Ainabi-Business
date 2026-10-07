import { Router } from "express";
import {
  changePasswordHandler,
  forgotPasswordHandler,
  googleHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  passwordResetStatusHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/register", registerHandler);
router.post("/login", loginHandler);
router.post("/google", googleHandler);
router.post("/refresh", refreshHandler);
router.post("/logout", logoutHandler);
router.get("/me", requireAuth, meHandler);
router.post("/change-password", requireAuth, changePasswordHandler);
router.get("/password-reset", passwordResetStatusHandler);
router.post("/forgot-password", forgotPasswordHandler);
router.post("/reset-password", resetPasswordHandler);

export default router;
