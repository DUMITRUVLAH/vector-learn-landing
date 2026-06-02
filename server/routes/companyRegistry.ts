import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  searchCompanies,
  getCompanyByIdno,
  RegistryError,
} from "../lib/companyRegistry";

/**
 * CONT-PLATA: authenticated proxy over the contafirm.md public registry.
 *   GET /api/registry/companies?q=...   → search by name or IDNO
 *   GET /api/registry/companies/:idno   → full company detail (autofill source)
 */
export const companyRegistryRoutes = new Hono<{ Variables: AuthVariables }>();

companyRegistryRoutes.use("*", requireAuth);

companyRegistryRoutes.get("/companies", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) {
    return c.json({ data: [] });
  }
  const perPage = Number(c.req.query("per_page") ?? 10);
  try {
    const data = await searchCompanies(q, Number.isFinite(perPage) ? perPage : 10);
    return c.json({ data });
  } catch (err) {
    if (err instanceof RegistryError) return c.json({ error: err.message }, err.status === 404 ? 404 : 502);
    return c.json({ error: "registry_error" }, 502);
  }
});

companyRegistryRoutes.get("/companies/:idno", async (c) => {
  const idno = c.req.param("idno");
  try {
    const data = await getCompanyByIdno(idno);
    return c.json({ data });
  } catch (err) {
    if (err instanceof RegistryError) {
      return c.json({ error: err.message }, err.status === 404 ? 404 : 502);
    }
    return c.json({ error: "registry_error" }, 502);
  }
});
