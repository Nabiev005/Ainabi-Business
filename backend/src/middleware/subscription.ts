import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { Feature, SubscriptionInfo } from "../config/plans";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      subscription?: SubscriptionInfo;
      isPlatformAdmin?: boolean;
    }
  }
}

/**
 * Blocks a module the business's plan doesn't include (e.g. the pipeline on
 * BASIC). Reading stays possible on an expired subscription — the write
 * block for that lives in requireAuth — so this only looks at the plan.
 * Must run after requireAuth.
 */
export function requireFeature(feature: Feature) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.isPlatformAdmin) return next();
    // subscription.features already includes what a business keeps from before the plan split.
    if (!req.subscription?.features.includes(feature)) {
      throw new ApiError(402, "Бул бөлүм сиздин тарифке кирбейт. Тарифти жогорулатыңыз.", { code: "PLAN_FEATURE", feature });
    }
    next();
  };
}
