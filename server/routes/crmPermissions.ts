/**
 * CRM Faza 9 — ce poate face utilizatorul curent.
 *
 * Montat la /api/crm/permissions.
 *
 * Interfața cere lista o dată și ascunde ce n-are rost să arate. Ascunderea NU e apărarea:
 * fiecare rută administrativă are propria poartă (`requireCrmPermission`) — asta e doar ca omul
 * să nu vadă butoane care oricum ar da 403.
 */
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { listPermissions } from "../lib/crm/permissions";

export const crmPermissionsRoutes = new Hono<{ Variables: AuthVariables }>();
crmPermissionsRoutes.use("/*", requireAuth);

crmPermissionsRoutes.get("/", async (c) => {
  const user = c.get("user");
  return c.json({ role: user.role, permissions: listPermissions(user.role) });
});
