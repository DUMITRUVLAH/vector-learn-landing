/**
 * COMMS-301 — administrarea canalelor de mesaje. Montat la /api/comms/channels.
 *
 *   GET    /                 lista canalelor workspace-ului + ce e configurat pe platformă
 *   POST   /                 conectează un canal (WhatsApp / Telegram / Viber) cu credențialele lui
 *   PATCH  /:id              nume, activ/dezactivat, setări (autoCreateLead, senderName)
 *   POST   /:id/credentials  schimbă tokenul (rotație / token scurs)
 *   POST   /:id/test         re-verifică credențialele la furnizor
 *   DELETE /:id              deconectează: oprește webhook-ul, șterge secretele, PĂSTREAZĂ istoricul
 *   GET    /:id/events       ultimele webhook-uri primite (depanare)
 *   POST   /:id/simulate     mesaj primit simulat — doar pe canalele „mock" (demo/e2e fără chei reale)
 *
 * Gmail NU se conectează de aici cu un token lipit, ci prin OAuth (routes/commsGmail.ts).
 * Secretele nu ies niciodată în răspuns (`publicChannel`).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../db/client";
import { commChannels, commWebhookEvents, type CommChannel } from "../db/schema/comms";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import { getAdapter } from "../lib/comms/registry";
import {
  encryptCredentials,
  isMockChannel,
  mockAllowed,
  providerFetch,
  publicBaseUrl,
  publicChannel,
  decryptCredentials,
  webhookUrlFor,
} from "../lib/comms/channelStore";
import { ingestEvents } from "../lib/comms/ingest";
import { gmailConfigured, revokeGmail } from "../lib/comms/gmailService";
import { CommsError, type Credentials } from "../lib/comms/types";
import { newWebhookSecret } from "../lib/comms/util";

export const commsChannelsRoutes = new Hono<{ Variables: AuthVariables }>();
commsChannelsRoutes.use("/*", requireAuth);
const manage = requireCrmPermission("comms.manage");

const credentialsSchema = z.record(z.string().max(4000)).default({});

const createInput = z.object({
  kind: z.enum(["whatsapp", "telegram", "viber"]),
  name: z.string().trim().min(1).max(120),
  credentials: credentialsSchema,
  config: z
    .object({
      senderName: z.string().max(28).optional(),
      autoCreateLead: z.boolean().optional(),
      graphVersion: z.string().regex(/^v\d{2}\.\d$/).optional(),
    })
    .default({}),
  /** Canal simulat — nimic nu pleacă spre furnizor. Permis doar în afara producției (sau COMMS_ALLOW_MOCK=1). */
  mock: z.boolean().optional(),
});

const patchInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  config: z
    .object({
      senderName: z.string().max(28).optional(),
      autoCreateLead: z.boolean().optional(),
    })
    .optional(),
});

function sendError(c: { json: (b: unknown, s: number) => Response }, err: unknown) {
  if (err instanceof CommsError) return c.json({ error: err.code, message: err.message }, err.httpStatus);
  throw err;
}

async function loadChannel(tenantId: string, id: string): Promise<CommChannel | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [ch] = await db
    .select()
    .from(commChannels)
    .where(and(eq(commChannels.id, id), eq(commChannels.tenantId, tenantId)));
  return ch ?? null;
}

/** Același bot/număr nu poate fi legat de două canale — mesajele n-ar ști unde să intre. */
async function assertExternalFree(kind: string, externalId: string, selfId: string) {
  const [other] = await db
    .select({ id: commChannels.id, tenantId: commChannels.tenantId })
    .from(commChannels)
    .where(and(eq(commChannels.kind, kind), eq(commChannels.externalId, externalId), ne(commChannels.id, selfId)));
  if (other) {
    throw new CommsError("already_connected", "Acest cont e deja conectat la un workspace. Deconectează-l acolo întâi.", 409);
  }
}

commsChannelsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const base = publicBaseUrl(c.req.url);
  const rows = await db
    .select()
    .from(commChannels)
    .where(eq(commChannels.tenantId, user.tenantId))
    .orderBy(commChannels.createdAt);
  return c.json({
    channels: rows.map((r) => publicChannel(r, base)),
    platform: {
      gmailConfigured: gmailConfigured(),
      gmailPush: Boolean(process.env.GMAIL_PUBSUB_TOPIC),
      whatsappPlatformApp: Boolean(process.env.META_APP_SECRET),
      mockAllowed: mockAllowed(),
      encryptionKeySet: Boolean(process.env.ENCRYPTION_KEY),
      publicBaseUrl: base,
    },
  });
});

commsChannelsRoutes.post("/", manage, zValidator("json", createInput), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const base = publicBaseUrl(c.req.url);
  const secret = newWebhookSecret();

  if (body.mock) {
    if (!mockAllowed()) return c.json({ error: "mock_forbidden", message: "Canalele simulate nu sunt permise în producție." }, 403);
    const [row] = await db
      .insert(commChannels)
      .values({
        tenantId: user.tenantId,
        kind: body.kind,
        name: body.name,
        status: "active",
        externalId: `mock-${body.kind}-${secret.slice(0, 12)}`,
        config: {
          ...body.config,
          mock: true,
          ...(body.kind === "telegram" ? { botUsername: "demo_crm_bot" } : {}),
          ...(body.kind === "viber" ? { botUri: "democrmbot", senderName: body.config.senderName ?? "Demo" } : {}),
          ...(body.kind === "whatsapp" ? { displayPhone: "+373 60 000 000", wabaId: "mock-waba" } : {}),
        },
        webhookSecret: secret,
        connectedBy: user.id,
      })
      .returning();
    return c.json({ channel: publicChannel(row, base), manualSteps: [] }, 201);
  }

  const adapter = getAdapter(body.kind)!;
  const creds: Credentials = Object.fromEntries(Object.entries(body.credentials).map(([k, v]) => [k, v.trim()]));

  // Rândul se creează ÎNAINTE de `connect`: Viber verifică URL-ul chiar în timpul `set_webhook`,
  // iar webhook-ul trebuie să găsească deja canalul după segmentul secret.
  const [pending] = await db
    .insert(commChannels)
    .values({
      tenantId: user.tenantId,
      kind: body.kind,
      name: body.name,
      status: "pending",
      credentialsEnc: encryptCredentials(creds),
      config: body.config,
      webhookSecret: secret,
      connectedBy: user.id,
    })
    .returning();

  try {
    if (adapter.identify) {
      await assertExternalFree(body.kind, await adapter.identify({ creds, config: body.config, fetch: providerFetch() }), pending.id);
    }
    const result = await adapter.connect({
      creds,
      config: body.config,
      fetch: providerFetch(),
      webhookUrl: webhookUrlFor(base, body.kind, secret),
      webhookSecret: secret,
    });
    await assertExternalFree(body.kind, result.externalId, pending.id);
    const [row] = await db
      .update(commChannels)
      .set({
        externalId: result.externalId,
        config: { ...body.config, ...result.config },
        status: "active",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(commChannels.id, pending.id))
      .returning();
    return c.json({ channel: publicChannel(row, base), manualSteps: result.manualSteps ?? [] }, 201);
  } catch (err) {
    await db.delete(commChannels).where(eq(commChannels.id, pending.id));
    return sendError(c, err);
  }
});

commsChannelsRoutes.patch("/:id", manage, zValidator("json", patchInput), async (c) => {
  const user = c.get("user");
  const ch = await loadChannel(user.tenantId, c.req.param("id"));
  if (!ch) return c.json({ error: "not_found" }, 404);
  const body = c.req.valid("json");
  if (body.status === "active" && !ch.credentialsEnc && !isMockChannel(ch)) {
    return c.json({ error: "reconnect_required", message: "Canalul a fost deconectat — conectează-l din nou cu un token." }, 409);
  }
  const [row] = await db
    .update(commChannels)
    .set({
      ...(body.name ? { name: body.name } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.config ? { config: { ...(ch.config ?? {}), ...body.config } } : {}),
      updatedAt: new Date(),
    })
    .where(eq(commChannels.id, ch.id))
    .returning();
  return c.json({ channel: publicChannel(row, publicBaseUrl(c.req.url)) });
});

commsChannelsRoutes.post("/:id/credentials", manage, zValidator("json", z.object({ credentials: credentialsSchema })), async (c) => {
  const user = c.get("user");
  const ch = await loadChannel(user.tenantId, c.req.param("id"));
  if (!ch) return c.json({ error: "not_found" }, 404);
  if (ch.kind === "gmail" || isMockChannel(ch)) return c.json({ error: "not_supported" }, 400);
  const adapter = getAdapter(ch.kind)!;
  const creds: Credentials = { ...decryptCredentials(ch), ...c.req.valid("json").credentials };
  const base = publicBaseUrl(c.req.url);
  // Tokenul nou se salvează ÎNAINTE de connect (Viber îl folosește la verificarea webhook-ului).
  const previous = ch.credentialsEnc;
  await db.update(commChannels).set({ credentialsEnc: encryptCredentials(creds) }).where(eq(commChannels.id, ch.id));
  try {
    if (adapter.identify) {
      const id = await adapter.identify({ creds, config: (ch.config ?? {}) as Record<string, unknown>, fetch: providerFetch() });
      if (ch.externalId && id !== ch.externalId) {
        throw new CommsError("different_account", "Tokenul nou aparține altui bot/număr. Conectează-l ca un canal nou.", 409);
      }
      await assertExternalFree(ch.kind, id, ch.id);
    }
    const result = await adapter.connect({
      creds,
      config: (ch.config ?? {}) as Record<string, unknown>,
      fetch: providerFetch(),
      webhookUrl: webhookUrlFor(base, ch.kind, ch.webhookSecret),
      webhookSecret: ch.webhookSecret,
    });
    if (ch.externalId && result.externalId !== ch.externalId) {
      throw new CommsError("different_account", "Tokenul nou aparține altui bot/număr. Conectează-l ca un canal nou.", 409);
    }
    await assertExternalFree(ch.kind, result.externalId, ch.id);
    const [row] = await db
      .update(commChannels)
      .set({
        externalId: result.externalId,
        config: { ...(ch.config ?? {}), ...result.config },
        status: "active",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(commChannels.id, ch.id))
      .returning();
    return c.json({ channel: publicChannel(row, base), manualSteps: result.manualSteps ?? [] });
  } catch (err) {
    await db.update(commChannels).set({ credentialsEnc: previous }).where(eq(commChannels.id, ch.id));
    return sendError(c, err);
  }
});

commsChannelsRoutes.post("/:id/test", manage, async (c) => {
  const user = c.get("user");
  const ch = await loadChannel(user.tenantId, c.req.param("id"));
  if (!ch) return c.json({ error: "not_found" }, 404);
  if (isMockChannel(ch)) return c.json({ ok: true, detail: "Canal simulat — nu există furnizor de verificat." });
  if (ch.kind === "gmail") {
    try {
      const { freshGmailCreds } = await import("../lib/comms/gmailService");
      await freshGmailCreds(ch);
      return c.json({ ok: true, detail: "Accesul la Gmail e valid." });
    } catch (err) {
      return c.json({ ok: false, detail: err instanceof Error ? err.message : "Eroare" });
    }
  }
  const adapter = getAdapter(ch.kind)!;
  try {
    const result = await adapter.connect({
      creds: decryptCredentials(ch),
      config: (ch.config ?? {}) as Record<string, unknown>,
      fetch: providerFetch(),
      webhookUrl: webhookUrlFor(publicBaseUrl(c.req.url), ch.kind, ch.webhookSecret),
      webhookSecret: ch.webhookSecret,
    });
    await db
      .update(commChannels)
      .set({ config: { ...(ch.config ?? {}), ...result.config }, lastError: null, status: ch.status === "error" ? "active" : ch.status, updatedAt: new Date() })
      .where(eq(commChannels.id, ch.id));
    return c.json({ ok: true, detail: "Credențialele sunt valide și webhook-ul e setat." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Eroare necunoscută";
    await db.update(commChannels).set({ lastError: msg.slice(0, 1000), updatedAt: new Date() }).where(eq(commChannels.id, ch.id));
    return c.json({ ok: false, detail: msg });
  }
});

commsChannelsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const ch = await loadChannel(user.tenantId, c.req.param("id"));
  if (!ch) return c.json({ error: "not_found" }, 404);
  // Cutia Gmail proprie o poate deconecta omul care a conectat-o; restul canalelor cer dreptul de administrare.
  const ownGmail = ch.kind === "gmail" && ch.connectedBy === user.id;
  if (!ownGmail) {
    const { can } = await import("../lib/crm/permissions");
    if (!can(user.role, "comms.manage")) return c.json({ error: "forbidden", permission: "comms.manage" }, 403);
  }
  if (!isMockChannel(ch)) {
    try {
      if (ch.kind === "gmail") await revokeGmail(ch);
      else await getAdapter(ch.kind)?.disconnect?.({ creds: decryptCredentials(ch), config: (ch.config ?? {}) as Record<string, unknown>, fetch: providerFetch() });
    } catch {
      // furnizorul indisponibil nu ne împiedică să uităm secretele
    }
  }
  // Istoricul conversațiilor rămâne (e istoria relației cu clientul); dispar doar secretele și legătura
  // cu contul extern, ca același bot să poată fi reconectat oriunde.
  await db
    .update(commChannels)
    .set({ status: "disabled", credentialsEnc: null, externalId: null, updatedAt: new Date() })
    .where(eq(commChannels.id, ch.id));
  return c.json({ ok: true });
});

commsChannelsRoutes.get("/:id/events", manage, async (c) => {
  const user = c.get("user");
  const ch = await loadChannel(user.tenantId, c.req.param("id"));
  if (!ch) return c.json({ error: "not_found" }, 404);
  const events = await db
    .select()
    .from(commWebhookEvents)
    .where(eq(commWebhookEvents.channelId, ch.id))
    .orderBy(desc(commWebhookEvents.receivedAt))
    .limit(50);
  return c.json({ events });
});

const simulateInput = z.object({
  from: z.string().trim().min(1).max(255),
  name: z.string().max(200).optional(),
  text: z.string().min(1).max(4000),
  phone: z.string().max(32).optional(),
  email: z.string().email().optional(),
  subject: z.string().max(500).optional(),
  threadId: z.string().max(255).optional(),
  startPayload: z.string().max(64).optional(),
});

commsChannelsRoutes.post("/:id/simulate", manage, zValidator("json", simulateInput), async (c) => {
  const user = c.get("user");
  const ch = await loadChannel(user.tenantId, c.req.param("id"));
  if (!ch) return c.json({ error: "not_found" }, 404);
  if (!isMockChannel(ch)) return c.json({ error: "not_mock", message: "Simularea e permisă doar pe canalele simulate." }, 400);
  const b = c.req.valid("json");
  const result = await ingestEvents(ch, [
    {
      type: "message",
      externalUserId: ch.kind === "gmail" ? b.from.toLowerCase() : b.from,
      displayName: b.name ?? null,
      phone: b.phone ?? null,
      email: b.email ?? (ch.kind === "gmail" ? b.from.toLowerCase() : null),
      externalId: `sim-${crypto.randomUUID()}`,
      threadId: ch.kind === "gmail" ? b.threadId ?? `sim-thread-${crypto.randomUUID()}` : null,
      subject: b.subject ?? null,
      kind: "text",
      body: b.text,
      timestamp: new Date(),
      startPayload: b.startPayload ?? null,
      meta: ch.kind === "gmail" ? { messageIdHeader: `<sim-${Date.now()}@example.invalid>` } : null,
    },
  ]);
  return c.json({ ok: true, result });
});
