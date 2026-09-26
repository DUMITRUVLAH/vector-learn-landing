/**
 * CRM — comunicarea cu lead-ul: email, telefon, WhatsApp.
 *
 * DECIZIA DE PORTARE: nicio tabelă nouă. `lead_interactions` are deja enum-ul
 * `call | email | whatsapp | sms | meeting` și un `metadata` jsonb. Un al doilea
 * jurnal de atingeri ar însemna două cronologii ale aceluiași lead, iar cea pe
 * care o vede omul ar depinde de ecranul pe care e.
 *
 * Ce aduce în plus față de „acțiunile rapide" din fișa leadului: acelea deschid
 * aplicația de mail sau telefonul și NU lasă nicio urmă. Peste o lună, cronologia
 * arată tăcere acolo unde de fapt au plecat cinci emailuri. Aici, trimiterea se
 * face din aplicație și se scrie în cronologie în aceeași operație.
 *
 * Trimiterea trece OBLIGATORIU prin `emailSendDecision`. Adresa unui lead e text
 * scris de om, adesea greșit; un hard bounce se pune în cârca reputației
 * domeniului `finflow.best`, iar Resend suspendă contul peste ~5% bounce rate.
 * Adică o listă de lead-uri prost curățată poate strica livrarea emailurilor
 * pentru toți clienții produsului — de-aici garda, și de-aici faptul că un email
 * blocat NU e o eroare, ci un rezultat pe care îl spunem omului.
 *
 * Montat la /api/crm/comms.
 */
import { loadOrg } from "../lib/docs/orgInfo";
import { crmSender } from "../lib/docs/documentEmail";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions } from "../db/schema/leads";
import { stopCadencesOnReply } from "../lib/crm/cadences";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { emailSendDecision } from "../lib/emailGuard";

export const crmCommsRoutes = new Hono<{ Variables: AuthVariables }>();
crmCommsRoutes.use("/*", requireAuth);

/** Canalele pe care le poate înregistra CRM-ul. Aceleași ca enum-ul din bază. */
const CHANNELS = ["call", "email", "whatsapp", "sms", "meeting", "note"] as const;

const emailInput = z.object({
  leadId: z.string().uuid(),
  subject: z.string().min(1, "Subiectul e obligatoriu").max(200),
  body: z.string().min(1, "Mesajul e gol").max(10_000),
  /** Implicit adresa lead-ului; alta doar dacă omul o scrie explicit. */
  to: z.string().email().nullish(),
});

const logInput = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(CHANNELS),
  direction: z.enum(["inbound", "outbound", "internal"]).default("outbound"),
  body: z.string().max(2000).nullish(),
  /** Durata apelului, în secunde — se vede în rapoarte ca timp vorbit. */
  durationSec: z.number().int().min(0).max(86_400).nullish(),
  outcome: z.string().max(80).nullish(),
});

function isMissingSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /relation .* does not exist|column .* does not exist|undefined_table|undefined_column/i.test(msg);
}

async function loadLead(tenantId: string, leadId: string) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
  return lead;
}

// ─── Email ───────────────────────────────────────────────────────────────────

crmCommsRoutes.post("/email", zValidator("json", emailInput), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const lead = await loadLead(user.tenantId, body.leadId);
  // Un id din alt workspace nu e „negăsit din întâmplare": e exact cererea care
  // ar trimite un email în numele firmei noastre către clientul altcuiva.
  if (!lead) return c.json({ error: "not_found" }, 404);

  const to = (body.to ?? lead.email ?? "").trim();
  if (!to) return c.json({ error: "no_address", message: "Lead-ul nu are adresă de email." }, 400);

  const decision = emailSendDecision(to);
  let status: "sent" | "blocked" | "failed" = "sent";
  let detail: string | null = null;

  if (!decision.allowed) {
    status = "blocked";
    detail =
      decision.reason?.includes("non-production")
        ? "Mediul acesta nu trimite e-mailuri reale (protecție anti-trimitere din teste)."
        : "Adresa e blocată de politica de trimitere (domeniu demo sau nelivrabil).";
  } else {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      status = "failed";
      detail = "Serviciul de e-mail nu e configurat.";
    } else {
      // CRM-U03: clientul vede numele firmei, nu adresa generică a serverului, iar răspunsul lui
      // ajunge la vânzătorul care a scris — nu în noreply.
      const org = await loadOrg(user.tenantId);
      const from = crmSender(org.name);
      const replyTo = (user as { email?: string }).email ?? null;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [to],
            subject: body.subject,
            text: body.body,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });
        if (!res.ok) {
          status = "failed";
          detail = `Serviciul de e-mail a răspuns ${res.status}.`;
        }
      } catch (err) {
        status = "failed";
        detail = err instanceof Error ? err.message : "Trimiterea a eșuat.";
      }
    }
  }

  /**
   * Se scrie în cronologie ȘI când n-a plecat.
   *
   * Un email blocat sau picat care nu lasă urmă e mai rău decât unul netrimis:
   * agentul crede că a scris clientului, clientul nu știe nimic, iar peste două
   * săptămâni nimeni nu poate reconstitui de ce s-a rupt legătura.
   */
  const [interaction] = await db
    .insert(leadInteractions)
    .values({
      tenantId: user.tenantId,
      leadId: lead.id,
      type: "email",
      direction: "outbound",
      body: `${body.subject}\n\n${body.body}`.slice(0, 2000),
      metadata: { to, subject: body.subject, status, detail },
      userId: user.id,
    })
    .returning();

  if (status === "sent") return c.json({ status, interaction });
  // 200, nu eroare: acțiunea s-a consumat și a lăsat urmă. Ce s-a întâmplat e în
  // `status`, iar interfața are ce să-i arate omului.
  return c.json({ status, detail, interaction });
});

// ─── Înregistrarea manuală a unei atingeri ───────────────────────────────────

crmCommsRoutes.post("/log", zValidator("json", logInput), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const lead = await loadLead(user.tenantId, body.leadId);
  if (!lead) return c.json({ error: "not_found" }, 404);

  const parts: string[] = [];
  if (body.outcome) parts.push(body.outcome);
  if (body.body) parts.push(body.body);
  if (body.durationSec != null && body.durationSec > 0) {
    const m = Math.floor(body.durationSec / 60);
    const s = body.durationSec % 60;
    parts.push(m > 0 ? `${m} min ${s} s` : `${s} s`);
  }

  const [interaction] = await db
    .insert(leadInteractions)
    .values({
      tenantId: user.tenantId,
      leadId: lead.id,
      type: body.channel,
      direction: body.direction,
      body: parts.join(" · ").slice(0, 2000) || null,
      metadata: { durationSec: body.durationSec ?? null, outcome: body.outcome ?? null },
      userId: user.id,
    })
    .returning();

  // Un apel PRIMIT sau un mesaj primit înseamnă că omul a răspuns: urmărirea automată se oprește
  // aici, nu peste două zile, când i-ar pica agentului taskul „sună clientul, nu răspunde".
  if (interaction.direction === "inbound") {
    await stopCadencesOnReply(user.tenantId, lead.id, user.id);
  }

  return c.json(interaction, 201);
});

// ─── Fluxul de activitate al echipei ─────────────────────────────────────────

/**
 * Ultimele atingeri, pe toată echipa. Răspunde la „se lucrează?", întrebare pe
 * care pâlnia n-o poate răspunde: un lead poate sta în aceeași coloană o
 * săptămână și totuși să fie sunat zilnic — sau deloc.
 */
crmCommsRoutes.get("/feed", async (c) => {
  const user = c.get("user");
  const channel = c.req.query("channel");
  const ownerId = c.req.query("owner");

  const filters = [eq(leadInteractions.tenantId, user.tenantId)];
  if (channel && (CHANNELS as readonly string[]).includes(channel)) {
    filters.push(eq(leadInteractions.type, channel as (typeof CHANNELS)[number]));
  } else {
    // Implicit arătăm doar COMUNICAREA. `stage_change` și `system` ar îneca
    // fluxul în zgomot generat de aplicație, nu de oameni.
    filters.push(inArray(leadInteractions.type, ["call", "email", "whatsapp", "sms", "meeting", "note"]));
  }
  if (ownerId) filters.push(eq(leadInteractions.userId, ownerId));

  try {
    const items = await db
      .select({
        id: leadInteractions.id,
        leadId: leadInteractions.leadId,
        leadName: leads.fullName,
        leadCompany: leads.company,
        type: leadInteractions.type,
        direction: leadInteractions.direction,
        body: leadInteractions.body,
        metadata: leadInteractions.metadata,
        occurredAt: leadInteractions.occurredAt,
        userName: users.name,
      })
      .from(leadInteractions)
      .innerJoin(leads, eq(leads.id, leadInteractions.leadId))
      .leftJoin(users, eq(users.id, leadInteractions.userId))
      .where(and(...filters))
      .orderBy(desc(leadInteractions.occurredAt))
      .limit(200);

    return c.json({ items });
  } catch (err) {
    if (isMissingSchemaError(err)) return c.json({ items: [] });
    throw err;
  }
});
