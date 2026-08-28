import type { MiddlewareHandler } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { parPayerModules, parPayers, parRequests, platformAdmins } from "../db/schema/par";
import { isModuleDefaultEnabled, isModuleEnabledForTenant } from "../lib/platformModules";
import type { AuthVariables } from "./requireAuth";

export function requireModuleEntitlement(moduleKey: string): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) { await next(); return; } // requireAuth on the target router returns the canonical 401.
    const [superadmin] = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(eq(platformAdmins.userId, user.id));
    if (superadmin) { await next(); return; }
    // PLATFORM-001: comutatorul de workspace din Consola Platformă are ultimul cuvânt.
    // Doar un „oprit" EXPLICIT blochează — lipsa rândului lasă lucrurile deschise, ca înainte.
    if (!(await isModuleEnabledForTenant(user.tenantId, moduleKey))) {
      return c.json({ error: "module_disabled", module: moduleKey }, 403);
    }
    let payerId = c.req.query("payer_id") ?? null;
    const match = new URL(c.req.url).pathname.match(/^\/api\/par\/([0-9a-f-]{36})(?:\/|$)/i);
    if (!payerId && match) {
      const [request] = await db.select({ payerId: parRequests.payerId }).from(parRequests)
        .where(and(eq(parRequests.id, match[1]), eq(parRequests.tenantId, user.tenantId)));
      payerId = request?.payerId ?? null;
    }
    // Verificarea per entitate juridică. Lipsa rândului cade pe implicitul din cod (PAR pornit),
    // altfel o organizație creată înainte de consolă ar primi 403 la un modul „implicit".
    const conditions = [eq(parPayerModules.tenantId, user.tenantId), eq(parPayerModules.moduleKey, moduleKey)];
    if (payerId) conditions.push(eq(parPayerModules.payerId, payerId));
    const rows = await db.select({ enabled: parPayerModules.enabled }).from(parPayerModules).where(and(...conditions));
    const allowed = rows.length ? rows.some((r) => r.enabled) : isModuleDefaultEnabled(moduleKey);
    if (!allowed) return c.json({ error: "module_disabled", module: moduleKey }, 403);
    await next();
  };
}

export async function hasPayerModuleEntitlement(
  userId: string,
  tenantId: string,
  payerId: string | null | undefined,
  moduleKey: string,
): Promise<boolean> {
  if (!payerId) return true;
  const [superadmin] = await db.select({ id: platformAdmins.id }).from(platformAdmins)
    .where(eq(platformAdmins.userId, userId));
  if (superadmin) return true;
  const [row] = await db.select({ enabled: parPayerModules.enabled }).from(parPayerModules).where(and(
    eq(parPayerModules.tenantId, tenantId),
    eq(parPayerModules.payerId, payerId),
    eq(parPayerModules.moduleKey, moduleKey),
  )).limit(1);
  // Fără rând = implicitul produsului: PAR îl are orice organizație, restul nu.
  return row ? row.enabled : isModuleDefaultEnabled(moduleKey);
}

/**
 * Organizațiile (entitățile juridice) pentru care modulul e activ.
 * Pentru un modul implicit (PAR) înseamnă TOATE organizațiile workspace-ului, mai puțin cele
 * oprite explicit — altfel lista ar ascunde exact organizațiile care nu au fost niciodată
 * configurate, deși ele au acces la modul.
 */
export async function enabledPayerIds(tenantId: string, moduleKey: string): Promise<string[]> {
  const rows = await db.select({ payerId: parPayerModules.payerId, enabled: parPayerModules.enabled })
    .from(parPayerModules)
    .where(and(eq(parPayerModules.tenantId, tenantId), eq(parPayerModules.moduleKey, moduleKey)));
  if (!isModuleDefaultEnabled(moduleKey)) {
    return rows.filter((row) => row.enabled).map((row) => row.payerId);
  }
  const disabled = new Set(rows.filter((row) => !row.enabled).map((row) => row.payerId));
  const all = await db.select({ id: parPayers.id }).from(parPayers).where(eq(parPayers.tenantId, tenantId));
  return all.map((p) => p.id).filter((id) => !disabled.has(id));
}
