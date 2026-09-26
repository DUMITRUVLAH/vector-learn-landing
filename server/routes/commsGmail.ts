/**
 * COMMS-301 — conectarea cutiei Gmail proprii prin OAuth 2.0 (Google). Montat la /api/comms/gmail.
 *
 *   POST /oauth/start      → { url } către ecranul de consimțământ Google (state semnat + PKCE)
 *   GET  /oauth/callback   ← Google redirecționează aici cu ?code&state; creează/actualizează canalul
 *   POST /sync             sincronizează cutiile workspace-ului (plasa de siguranță când nu e Pub/Sub)
 *
 * Fiecare agent își conectează PROPRIA cutie — trimiterea pleacă din adresa lui reală, iar
 * răspunsurile clientului se văd în CRM. Detalii, scope-uri și verificarea Google: docs/comms/gmail.md.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { commChannels } from "../db/schema/comms";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCommsAccess } from "../lib/comms/access";
import { encryptCredentials, publicBaseUrl } from "../lib/comms/channelStore";
import {
  buildAuthUrl,
  ensureGmailWatch,
  exchangeCode,
  gmailConfigured,
  gmailRedirectUri,
  newPkce,
  signState,
  syncGmailChannel,
  verifyState,
} from "../lib/comms/gmailService";
import { CommsError } from "../lib/comms/types";
import { newWebhookSecret } from "../lib/comms/util";

export const commsGmailRoutes = new Hono<{ Variables: AuthVariables }>();
commsGmailRoutes.use("/*", requireAuth);
commsGmailRoutes.use("/*", requireCommsAccess);

commsGmailRoutes.post("/oauth/start", zValidator("json", z.object({ name: z.string().trim().max(120).optional() })), async (c) => {
  if (!gmailConfigured()) {
    return c.json(
      { error: "gmail_not_configured", message: "Integrarea Gmail nu e configurată pe platformă (GOOGLE_OAUTH_CLIENT_ID / SECRET)." },
      503
    );
  }
  const user = c.get("user");
  const { verifier, challenge } = newPkce();
  let state: string;
  try {
    state = signState({
      tenantId: user.tenantId,
      userId: user.id,
      name: c.req.valid("json").name || `Gmail ${user.name ?? user.email}`,
      verifier,
      exp: Date.now() + 10 * 60_000,
    });
  } catch (err) {
    if (err instanceof CommsError) return c.json({ error: err.code, message: err.message }, err.httpStatus);
    throw err;
  }
  const url = buildAuthUrl({ state, challenge, redirectUri: gmailRedirectUri(publicBaseUrl(c.req.url)), loginHint: user.email });
  return c.json({ url });
});

commsGmailRoutes.get("/oauth/callback", async (c) => {
  const base = publicBaseUrl(c.req.url);
  const back = (q: string) => c.redirect(`${base}/#/business/crm/canale?${q}`, 302);
  const user = c.get("user");
  const state = verifyState(c.req.query("state"));
  // State-ul e legat de omul care a pornit fluxul: un link de callback furat nu leagă cutia
  // altcuiva de sesiunea atacatorului.
  if (!state || state.userId !== user.id || state.tenantId !== user.tenantId) return back("gmail=invalid_state");
  if (c.req.query("error")) return back(`gmail=denied`);
  const code = c.req.query("code");
  if (!code) return back("gmail=no_code");

  try {
    const { email, sub, name, creds } = await exchangeCode(code, state.verifier, gmailRedirectUri(base));
    const [existing] = await db
      .select()
      .from(commChannels)
      .where(and(eq(commChannels.kind, "gmail"), eq(commChannels.externalId, email)));
    if (existing && existing.tenantId !== user.tenantId) return back("gmail=already_connected");

    let channelId: string;
    if (existing) {
      await db
        .update(commChannels)
        .set({
          credentialsEnc: encryptCredentials(creds),
          status: "active",
          lastError: null,
          connectedBy: user.id,
          config: { ...(existing.config ?? {}), email, sub, displayName: name ?? user.name ?? null },
          updatedAt: new Date(),
        })
        .where(eq(commChannels.id, existing.id));
      channelId = existing.id;
    } else {
      const [row] = await db
        .insert(commChannels)
        .values({
          tenantId: user.tenantId,
          kind: "gmail",
          name: state.name.slice(0, 120),
          status: "active",
          externalId: email,
          credentialsEnc: encryptCredentials(creds),
          config: { email, sub, displayName: name ?? user.name ?? null, autoCreateLead: false },
          webhookSecret: newWebhookSecret(),
          connectedBy: user.id,
        })
        .returning();
      channelId = row.id;
    }

    // Push-ul (dacă e configurat) + prima sincronizare scurtă. Niciuna nu are voie să strice conectarea.
    try {
      const [ch] = await db.select().from(commChannels).where(eq(commChannels.id, channelId));
      if (ch) await ensureGmailWatch(ch, true);
      await syncGmailChannel(channelId);
    } catch (e) {
      console.warn("[comms/gmail] prima sincronizare a eșuat", e instanceof Error ? e.message : e);
    }
    return back("gmail=connected");
  } catch (err) {
    const code = err instanceof CommsError ? err.code : "error";
    return back(`gmail=${encodeURIComponent(code)}`);
  }
});

/**
 * Sincronizare la cerere — inboxul o cheamă la deschidere. Limitată la o dată pe minut per cutie,
 * ca un inbox ținut deschis să nu consume cota Gmail (6.000 unități/minut/utilizator).
 */
commsGmailRoutes.post("/sync", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(commChannels)
    .where(and(eq(commChannels.tenantId, user.tenantId), eq(commChannels.kind, "gmail"), eq(commChannels.status, "active")));
  let messages = 0;
  const errors: string[] = [];
  for (const ch of rows) {
    const cfg = (ch.config ?? {}) as Record<string, unknown>;
    if (cfg.mock === true) continue;
    const last = Date.parse(String(cfg.lastSyncAt ?? "")) || 0;
    if (Date.now() - last < 60_000) continue;
    try {
      messages += (await syncGmailChannel(ch.id)).messages;
    } catch (err) {
      errors.push(`${ch.name}: ${err instanceof Error ? err.message : "eroare"}`);
    }
  }
  return c.json({ ok: errors.length === 0, messages, errors });
});
