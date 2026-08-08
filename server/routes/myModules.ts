/**
 * PLATFORM-001 — ce module vede workspace-ul CURENT.
 *
 * Îl consumă shell-ul FinFlow ca să știe ce secțiuni de meniu și ce dale de modul arată.
 * Fail-open prin construcție (vezi lib/platformModules): dacă nu se poate citi nimic,
 * clientul vede tot — o consolă de administrare nu are voie să golească aplicația
 * cuiva fiindcă o interogare a picat.
 */
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { MODULE_CATALOG, getTenantModuleMap } from "../lib/platformModules";

export const myModulesRoutes = new Hono<{ Variables: AuthVariables }>();
myModulesRoutes.use("*", requireAuth);

/** GET /api/modules — catalogul, cu starea pentru workspace-ul utilizatorului autentificat. */
myModulesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const map = await getTenantModuleMap(user.tenantId);
  return c.json({
    modules: MODULE_CATALOG.map((m) => ({ ...m, enabled: map[m.key] !== false })),
    enabled: MODULE_CATALOG.filter((m) => map[m.key] !== false).map((m) => m.key),
  });
});
