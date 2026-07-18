import type { MiddlewareHandler } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { parPayerModules, parRequests, platformAdmins } from "../db/schema/par";
import type { AuthVariables } from "./requireAuth";

export function requireModuleEntitlement(moduleKey: string): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) { await next(); return; } // requireAuth on the target router returns the canonical 401.
    const [superadmin] = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(eq(platformAdmins.userId, user.id));
    if (superadmin) { await next(); return; }
    let payerId = c.req.query("payer_id") ?? null;
    const match = new URL(c.req.url).pathname.match(/^\/api\/par\/([0-9a-f-]{36})(?:\/|$)/i);
    if (!payerId && match) {
      const [request] = await db.select({ payerId: parRequests.payerId }).from(parRequests)
        .where(and(eq(parRequests.id, match[1]), eq(parRequests.tenantId, user.tenantId)));
      payerId = request?.payerId ?? null;
    }
    const conditions = [eq(parPayerModules.tenantId, user.tenantId), eq(parPayerModules.moduleKey, moduleKey), eq(parPayerModules.enabled, true)];
    if (payerId) conditions.push(eq(parPayerModules.payerId, payerId));
    const [enabled] = await db.select({ id: parPayerModules.id }).from(parPayerModules).where(and(...conditions)).limit(1);
    if (!enabled) return c.json({ error: "module_disabled", module: moduleKey }, 403);
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
  const [enabled] = await db.select({ id: parPayerModules.id }).from(parPayerModules).where(and(
    eq(parPayerModules.tenantId, tenantId),
    eq(parPayerModules.payerId, payerId),
    eq(parPayerModules.moduleKey, moduleKey),
    eq(parPayerModules.enabled, true),
  )).limit(1);
  return !!enabled;
}

export async function enabledPayerIds(tenantId: string, moduleKey: string): Promise<string[]> {
  const rows = await db.select({ payerId: parPayerModules.payerId }).from(parPayerModules).where(and(
    eq(parPayerModules.tenantId, tenantId),
    eq(parPayerModules.moduleKey, moduleKey),
    eq(parPayerModules.enabled, true),
  ));
  return rows.map((row) => row.payerId);
}
