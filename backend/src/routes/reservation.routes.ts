import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { asyncHandler } from "../utils/asyncHandler";
import { createReservationSchema, reservationQuerySchema } from "../validators/reservation.validator";
import * as reservations from "../services/reservation.service";

const router = Router();
router.use(requireAuth, businessRateLimit, requirePermission("reservations.manage"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await reservations.listReservations(req.auth!.businessId, reservationQuerySchema.parse(req.query).status));
  }),
);
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await reservations.getReservation(req.auth!.businessId, req.params.id));
  }),
);
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createReservationSchema.parse(req.body);
    res.status(201).json(await reservations.createReservation(req.auth!.businessId, req.auth!.employeeId, input));
  }),
);
router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    res.json(await reservations.cancelReservation(req.auth!.businessId, req.params.id));
  }),
);

export default router;
