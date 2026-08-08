import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { platformAdmins } from "../db/schema/par";
import { isPlatformOwnerEmail } from "../lib/platformOwner";
import type { AuthVariables } from "./requireAuth";

/**
 * Superadmin al platformei: rând în `platform_admins` SAU email de proprietar
 * (vezi lib/platformOwner). Pentru proprietar rândul se materializează la prima
 * accesare, ca restul codului să poată citi doar tabela.
 */
export const requirePlatformAdmin: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  const [admin] = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(eq(platformAdmins.userId, user.id));
  if (admin) {
    await next();
    return;
  }
  if (isPlatformOwnerEmail(user.email)) {
    // Best-effort: dacă inserarea eșuează (tabelă lipsă imediat după deploy), accesul
    // rămâne acordat pe baza emailului — altfel proprietarul ar fi blocat afară din
    // exact unealta cu care ar repara situația.
    try {
      await db.insert(platformAdmins).values({ userId: user.id }).onConflictDoNothing();
    } catch (e) {
      console.warn("[requirePlatformAdmin] owner self-provision skipped:", e instanceof Error ? e.message : e);
    }
    await next();
    return;
  }
  return c.json({ error: "platform_admin_required" }, 403);
};
