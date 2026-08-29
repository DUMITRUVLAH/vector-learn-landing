/**
 * PLATFORM-002 — captarea automată a erorilor de pe server.
 *
 * Se montează o singură dată, peste tot `/api/*`, și prinde două lucruri pe care nimeni
 * nu le raporta până acum:
 *
 *   • orice răspuns **5xx** — adică exact ce vede clientul ca „a apărut o eroare"
 *   • un 404 pe /api/\* care poartă marcajul `route_not_found` al catch-all-ului din app.ts —
 *     adică n-a matchuit NICIO rută reală. E clasa de bug-uri #1 (44 de routere au fost
 *     orfane odată). Un 404 cu ORICE alt cod (`not_found`, `unknown_id`…) e dat de o rută
 *     care EXISTĂ și a decis explicit „resursa asta nu există" — business normal, filtrat
 *     ca zgomot mai jos, nu ca rută lipsă.
 *
 * Nu blochează niciodată răspunsul: înregistrarea se face după ce răspunsul e gata, iar
 * orice eșec al ei e înghițit.
 */
import type { MiddlewareHandler } from "hono";
import { recordError } from "../lib/errorTelemetry";
import { alertOwnerOnNewError } from "../lib/errorAlerts";
import type { User } from "../db/schema";
import { clientIp } from "../lib/clientIp";

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
  const isApi404 = status === 404 && path.startsWith("/api/");
  if (!isServerError && !isApi404) return;

  // Corpul răspunsului e un stream consumabil o singură dată: îl clonăm ca să citim
  // mesajul fără să-l furăm clientului.
  let message = `HTTP ${status}`;
  let bodyIsJson = false;
  try {
    const clone = c.res.clone();
    const text = await clone.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: unknown };
        bodyIsJson = true;
        if (typeof parsed.error === "string") message = parsed.error;
      } catch {
        message = text.slice(0, 300);
      }
    }
  } catch {
    /* păstrăm mesajul implicit */
  }

  // `app.all("/api/*", ...)` de la capătul lui app.ts prinde ce n-a matchuit NICIO rută
  // reală și răspunde cu marcajul `error: "route_not_found"` — asta, și DOAR asta, e o rută
  // lipsă. Orice altă rută existentă care alege să răspundă 404 (guard de uuid pe un id
  // greșit, PO neemis încă, PAR inexistent etc.) întoarce alt cod ("not_found", "unknown_id"…)
  // — business normal, nu o rută lipsă. Fără distincția asta, orice 404 legitim al unei rute
  // reale (ex. GET /api/par/:id/purchase-order înainte de emitere) intra în consolă drept
  // "rută API lipsă", deși ruta există și funcționează corect. `!bodyIsJson` rămâne ca plasă
  // pentru cazul (ex. în teste izolate) în care nu există deloc catch-all-ul de mai sus și
  // cererea pică pe 404-ul implicit, text simplu, al Hono.
  const isMissingApiRoute = isApi404 && (message === "route_not_found" || !bodyIsJson);
  if (!isServerError && !isMissingApiRoute) return;
  if (isMissingApiRoute && message === `HTTP ${status}`) message = "Rută API inexistentă";

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
    ipAddress: clientIp(c) ?? null,
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
