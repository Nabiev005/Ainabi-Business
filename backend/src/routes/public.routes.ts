import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import * as catalogService from "../services/catalog.service";
import { env } from "../config/env";

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

// Every public page, shop windows included, for search engines (listed in robots.txt).
router.get(
  "/sitemap.xml",
  asyncHandler(async (_req, res) => {
    const base = env.clientUrls[0].replace(/\/$/, "");
    const shops = await catalogService.listedCatalogs();
    const url = (path: string, lastmod?: Date) =>
      `  <url><loc>${base}${path}</loc>${lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ""}</url>`;
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      url("/"),
      url("/privacy"),
      url("/terms"),
      ...shops.map((s) => url(`/c/${encodeURIComponent(s.slug)}`, s.updatedAt)),
      "</urlset>",
    ].join("\n");
    res.set("Cache-Control", "public, max-age=3600");
    res.type("application/xml").send(body);
  }),
);

export default router;
