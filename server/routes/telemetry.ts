/**
 * PLATFORM-002 — `POST /api/telemetry/error`: erorile din BROWSER.
 *
 * Jumătate din erorile pe care le vede un client nu ajung niciodată pe server: pagina crapă
 * la randare, un `undefined` aruncă într-un handler, o promisiune e respinsă. Fără acest
 * endpoint, proprietarul află de ele doar dacă îl sună clientul.
 *
 * Deliberat FĂRĂ `requireAuth`: cele mai urâte crash-uri se întâmplă exact pe ecranele
 * nelogate (login, invitație, pagina publică) — un raport care cere sesiune n-ar prinde
 * tocmai cazurile alea. În schimb, pentru că e public:
 *   • limitare de rată per IP, ca să nu poată fi umplută baza
 *   • câmpurile sunt tăiate la lungime și validate cu zod
 *   • dacă există totuși o sesiune, atașăm utilizatorul și workspace-ul din ea — niciodată
 *     din corpul cererii, ca nimeni să nu poată pune erori în cârca altui client
 */
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SESSION_COOKIE, getSessionUser } from "../auth/session";
import { recordError } from "../lib/errorTelemetry";
import { alertOwnerOnNewError } from "../lib/errorAlerts";

export const telemetryRoutes = new Hono();

const reportSchema = z.object({
  kind: z.enum(["client_crash", "client_unhandled", "client_api_error"]),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional().nullable(),
  /** Ruta din SPA (`/business/par`), nu URL-ul complet. */
  location: z.string().max(300).optional().nullable(),
  url: z.string().max(1000).optional().nullable(),
  statusCode: z.number().int().min(100).max(599).optional().nullable(),
  method: z.string().max(10).optional().nullable(),
});

/** Limitare simplă în memorie: 30 de rapoarte / IP / 5 minute. */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  // Curățare oportunistă, ca Map-ul să nu crească la nesfârșit într-un proces lung.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return list.length > MAX_PER_WINDOW;
}

telemetryRoutes.post("/error", zValidator("json", reportSchema), async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? "unknown";
  if (rateLimited(ip)) return c.json({ ok: true, throttled: true });

  const body = c.req.valid("json");

  // Identitatea vine EXCLUSIV din sesiune, niciodată din corpul cererii.
  let tenantId: string | null = null;
  let userId: string | null = null;
  let userEmail: string | null = null;
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    try {
      const session = await getSessionUser(token);
      if (session) {
        tenantId = session.user.tenantId;
        userId = session.user.id;
        userEmail = session.user.email;
      }
    } catch {
      /* raportul rămâne anonim */
    }
  }

  const result = await recordError({
    kind: body.kind,
    message: body.message,
    stack: body.stack ?? null,
    location: body.location ?? null,
    url: body.url ?? null,
    statusCode: body.statusCode ?? null,
    method: body.method ?? null,
    tenantId,
    userId,
    userEmail,
    userAgent: c.req.header("user-agent") ?? null,
    ipAddress: ip === "unknown" ? null : ip,
  });

  if (result?.isNew) {
    void alertOwnerOnNewError({
      groupId: result.groupId,
      kind: body.kind,
      message: body.message,
      location: body.location ?? null,
      userEmail,
    });
  }

  return c.json({ ok: true });
});
