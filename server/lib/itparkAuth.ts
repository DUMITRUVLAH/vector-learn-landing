/**
 * ITPARK-003: Helper pentru roluri ITPARK
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §7
 *
 * Nu se creează tabel junction separat. Derivăm accesul din:
 * - Admin/Manager → acces contabil (poate edita dosare)
 * - Auditor (itpark_settings.auditorUserId = userId) → read-only + poate marca „verificat"
 * - Oricine altcineva autentificat în tenant → viewer (read-only total)
 */
import type { Context } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { itparkSettings } from "../db/schema/itpark";
import type { AuthVariables } from "../middleware/requireAuth";

export type ItparkRole = "accountant" | "auditor" | "viewer";

/**
 * Determină rolul ITPARK al unui user în contextul curent:
 * - "accountant": admin sau manager (poate edita dosare)
 * - "auditor": user desemnat prin itpark_settings.auditorUserId
 * - "viewer": orice alt user autentificat în tenant
 */
export async function getItparkRole(
  userId: string,
  tenantId: string
): Promise<ItparkRole> {
  // Fetch settings pentru tenant
  const settings = await db
    .select({ auditorUserId: itparkSettings.auditorUserId })
    .from(itparkSettings)
    .where(eq(itparkSettings.tenantId, tenantId))
    .limit(1);

  if (settings.length > 0 && settings[0].auditorUserId === userId) {
    return "auditor";
  }

  return "viewer"; // va fi suprascris de caller dacă user.role e admin/manager
}

/**
 * requireItparkRole(role, c) — helper de gating inline pentru rute ITPARK.
 * Returnează null dacă accesul e permis, sau un Response cu 403 dacă nu.
 *
 * Ierarhia de acces:
 * - "accountant": admin | manager (userRoleEnum)
 * - "auditor": admin | manager | userul desemnat ca auditor
 * - "viewer": orice user autentificat
 *
 * Utilizare în rute:
 *   const deny = await requireItparkRole("accountant", c);
 *   if (deny) return deny;
 */
export async function requireItparkRole(
  role: ItparkRole,
  c: Context<{ Variables: AuthVariables }>
): Promise<Response | null> {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "unauthenticated" }, 401) as unknown as Response;
  }

  if (role === "viewer") {
    // Orice user autentificat are acces viewer
    return null;
  }

  const isAdminOrManager = user.role === "admin" || user.role === "manager";

  if (role === "accountant") {
    if (!isAdminOrManager) {
      return c.json({ error: "forbidden", required: "accountant (admin|manager)" }, 403) as unknown as Response;
    }
    return null;
  }

  if (role === "auditor") {
    if (isAdminOrManager) return null; // admin/manager au totul

    // Verifică dacă e auditorul desemnat
    const settings = await db
      .select({ auditorUserId: itparkSettings.auditorUserId })
      .from(itparkSettings)
      .where(and(eq(itparkSettings.tenantId, user.tenantId)))
      .limit(1);

    const isAuditor = settings.length > 0 && settings[0].auditorUserId === user.id;
    if (!isAuditor) {
      return c.json({ error: "forbidden", required: "auditor" }, 403) as unknown as Response;
    }
    return null;
  }

  return c.json({ error: "forbidden" }, 403) as unknown as Response;
}
