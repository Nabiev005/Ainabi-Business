import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import * as catalogService from "../services/catalog.service";

/** No sign-in: the shop windows owners share on Instagram. */
const router = Router();

const querySchema = z.object({
  search: z.string().max(100).optional(),
  categoryId: z.string().max(40).optional(),
  page: z.coerce.number().int().positive().max(500).default(1),
});

router.get(
  "/catalog/:slug",
  asyncHandler(async (req, res) => {
    const slug = z.string().regex(/^[a-z0-9-]{3,40}$/i).parse(req.params.slug);
    const data = await catalogService.publicCatalog(slug, querySchema.parse(req.query));
    // Visitors from one Instagram post hit the same page — let browsers and the CDN reuse it briefly.
    res.set("Cache-Control", "public, max-age=60");
    res.json(data);
  }),
);

export default router;
