/**
 * PLATFORM-002 — captarea automată a erorilor de pe server.
 *
 * Se montează o singură dată, peste tot `/api/*`, și prinde două lucruri pe care nimeni
 * nu le raporta până acum:
 *
 *   • orice răspuns **5xx** — adică exact ce vede clientul ca „a apărut o eroare"
 *   • orice **404 pe /api/\***  — în repo-ul ăsta, o rută nemontată cade în fallback-ul SPA
 *     și pagina crapă cu „Unexpected token '<'". E clasa de bug-uri #1 (44 de routere au
 *     fost orfane odată), deci merită tratată ca eroare, nu ca „resursă inexistentă".
 *
 * Nu blochează niciodată răspunsul: înregistrarea se face după ce răspunsul e gata, iar
 * orice eșec al ei e înghițit.
 */
import type { MiddlewareHandler } from "hono";
import { recordError } from "../lib/errorTelemetry";
import { alertOwnerOnNewError } from "../lib/errorAlerts";
import type { User } from "../db/schema";

/** Contextul de utilizator e disponibil doar pe rutele care au trecut prin requireAuth. */
function actorOf(c: { get: (k: string) => unknown }): { tenantId: string | null; userId: string | null; email: string | null } {
  const user = c.get("user") as User | undefined;
  return user
    ? { tenantId: user.tenantId, userId: user.id, email: user.email }
    : { tenantId: null, userId: null, email: null };
}

export const errorCapture: MiddlewareHandler = async (c, next) => {
  await next();

  const status = c.res.status;
  const path = new URL(c.req.url).pathname;

  // Endpoint-ul de telemetrie e exclus — altfel o eroare la raportarea unei erori s-ar
  // raporta pe sine, la nesfârșit.
  if (path.startsWith("/api/telemetry")) return;

  const isServerError = status >= 500;
  const isMissingApiRoute = status === 404 && path.startsWith("/api/");
  if (!isServerError && !isMissingApiRoute) return;

  // Corpul răspunsului e un stream consumabil o singură dată: îl clonăm ca să citim
  // mesajul fără să-l furăm clientului.
  let message = isMissingApiRoute ? "Rută API inexistentă" : `HTTP ${status}`;
  try {
    const clone = c.res.clone();
    const text = await clone.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: unknown };
        if (typeof parsed.error === "string") message = parsed.error;
      } catch {
        message = text.slice(0, 300);
      }
    }
  } catch {
    /* păstrăm mesajul implicit */
  }

  const actor = actorOf(c);
  void recordError({
    kind: isMissingApiRoute ? "api_route_missing" : "server_5xx",
    message,
    location: path,
    method: c.req.method,
    statusCode: status,
    tenantId: actor.tenantId,
    userId: actor.userId,
    userEmail: actor.email,
    userAgent: c.req.header("user-agent") ?? null,
    ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  }).then((result) => {
    if (result?.isNew) {
      void alertOwnerOnNewError({
        groupId: result.groupId,
        kind: isMissingApiRoute ? "api_route_missing" : "server_5xx",
        message,
        location: path,
        userEmail: actor.email,
      });
    }
  });
};
