/**
 * Ce are voie să facă un superadmin de platformă în contul unui client.
 *
 * SECURITY (audit 2026-08-29): impersonarea deschidea o sesiune normală pe utilizatorul-țintă și
 * NIMIC nu o mai distingea după aceea. Consecințele, în ordinea gravității:
 *   1. superadminul putea APROBA și PLĂTI în numele clientului;
 *   2. `par_audit` înregistra ca autor utilizatorul clientului, iar fișa de aprobări din dosar
 *      purta numele lui — deci o decizie luată din afară arăta identic cu una luată de el;
 *   3. în `platform_audit_log` existau doar `impersonate.start/stop`, fără legătură cu acțiunile.
 *
 * Regula acum: impersonarea e pentru VĂZUT ce vede clientul (motivul pentru care a fost
 * construită) — deciziile care mută bani sau produc semnături sunt refuzate, iar orice altă
 * scriere lasă o urmă cu actorul REAL.
 */
import type { MiddlewareHandler } from "hono";
import { writeAuditLog } from "../lib/auditLogger";
import { clientIp } from "../lib/clientIp";
import type { AuthVariables } from "./requireAuth";

/** Refuză acțiunea când sesiunea curentă e împrumutată. Se montează pe deciziile financiare. */
export const denyWhenImpersonating: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const impersonatedBy = c.get("impersonatedBy");
  if (impersonatedBy) {
    const user = c.get("user");
    await writeAuditLog({
      tenantId: user.tenantId,
      actorId: impersonatedBy,
      actionType: "impersonation_blocked_action",
      targetType: "http_request",
      targetId: null,
      newValue: { method: c.req.method, path: new URL(c.req.url).pathname, asUserId: user.id },
      ipAddress: clientIp(c),
    });
    return c.json(
      {
        error: "impersonation_read_only",
        detail:
          "Sesiunea curentă e deschisă în contul unui client. Aprobările, respingerile și plățile " +
          "trebuie făcute de utilizatorul real — altfel semnătura din dosar ar fi a lui pentru o " +
          "decizie luată de altcineva.",
      },
      403
    );
  }
  await next();
};

/**
 * Lasă acțiunea să treacă, dar o notează cu actorul REAL. Se montează global pe `/api/*`:
 * toate scrierile făcute dintr-o sesiune împrumutată devin vizibile în `audit_log`.
 */
export const logImpersonatedWrites: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  await next();
  const impersonatedBy = c.get("impersonatedBy");
  if (!impersonatedBy) return;
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return;
  if (c.res.status >= 400) return;
  const user = c.get("user");
  if (!user) return;
  await writeAuditLog({
    tenantId: user.tenantId,
    actorId: impersonatedBy,
    actionType: "impersonated_write",
    targetType: "http_request",
    targetId: null,
    newValue: { method: c.req.method, path: new URL(c.req.url).pathname, asUserId: user.id, status: c.res.status },
    ipAddress: clientIp(c),
  });
};
