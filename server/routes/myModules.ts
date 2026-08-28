/**
 * PLATFORM-001 — ce module vede workspace-ul CURENT.
 *
 * Îl consumă shell-ul FinFlow ca să știe ce secțiuni de meniu și ce dale de modul arată.
 * Implicitul e PAR (vezi lib/platformModules): orice organizație îl are fără nicio setare,
 * restul modulelor se aprind de proprietar din Consola Platformă. O interogare picată nu
 * golește aplicația clientului — cade tot pe implicitul din cod, deci PAR rămâne vizibil.
 *
 * Superadminul primește tot catalogul: el testează modulele înainte să le dea clienților,
 * iar `requireModuleEntitlement` oricum îl lasă să treacă — meniul trebuie să spună la fel.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { platformAdmins } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { MODULE_CATALOG, getTenantModuleMap } from "../lib/platformModules";

export const myModulesRoutes = new Hono<{ Variables: AuthVariables }>();
myModulesRoutes.use("*", requireAuth);

/** GET /api/modules — catalogul, cu starea pentru workspace-ul utilizatorului autentificat. */
myModulesRoutes.get("/", async (c) => {
  const user = c.get("user");
  let isSuperadmin = false;
  try {
    const [row] = await db
      .select({ id: platformAdmins.id })
      .from(platformAdmins)
      .where(eq(platformAdmins.userId, user.id))
      .limit(1);
    isSuperadmin = !!row;
  } catch {
    isSuperadmin = false; // tabela lipsă → tratăm ca utilizator obișnuit, nu ca proprietar
  }
  const map = isSuperadmin ? null : await getTenantModuleMap(user.tenantId);
  const enabledFor = (key: string) => map === null || map[key] !== false;
  return c.json({
    modules: MODULE_CATALOG.map((m) => ({ ...m, enabled: enabledFor(m.key) })),
    enabled: MODULE_CATALOG.filter((m) => enabledFor(m.key)).map((m) => m.key),
  });
});
