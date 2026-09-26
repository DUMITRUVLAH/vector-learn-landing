/**
 * CRM — captarea lead-urilor din formularele de pe site (cerința 68 din caietul de sarcini
 * Ecosolar, scenariul 1 din F-CRM-CAPTURE-001).
 *
 * Montat la /api/crm/intake. **PUBLIC** — nu trece prin `requireAuth`: vizitatorul unui site nu
 * are sesiune în FinFlow. Tot ce ține locul autentificării:
 *
 *   1. `token` — identifică formularul ȘI workspace-ul. E public prin natura lui (stă în pagina
 *      web), deci nu autorizează decât crearea unui lead: nu citește, nu listează, nu șterge.
 *   2. `allowed_origins` — de pe ce domenii se acceptă cererea (gol = orice, pentru formularele
 *      trimise server-side, care n-au `Origin`).
 *   3. rate limit pe IP — un endpoint public fără el e un formular de spam cu pași în plus.
 *   4. `consentAt` de cel mult 5 minute în urmă — o dată veche înseamnă payload refolosit.
 *
 * Duplicatele NU creează un al doilea lead: aceeași persoană care cere ofertă de două ori într-o
 * lună e un singur client cu două cereri. Al doilea formular adaugă o interacțiune pe leadul
 * existent, ca agentul să vadă că omul a revenit — și întoarce `isDuplicate: true`.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { crmCaptureSources } from "../db/schema/crmCaptureSources";
import { leads, leadInteractions, type NewLead } from "../db/schema/leads";
import { normalizeEmail, normalizePhone } from "../lib/crm/normalize";
import { resolveLeadPipeline, stagesOfPipeline } from "../lib/crm/changeStage";
import { stopCadencesOnReply } from "../lib/crm/cadences";
import { assignLeadAutomatically } from "./crmAssignment";
import { runAutomations } from "./crmAutomations";
import { logCrmAudit } from "../lib/crm/audit";

export const crmIntakeRoutes = new Hono();

/** Consimțământul mai vechi de atât înseamnă payload refolosit, nu un om care tocmai a bifat. */
const MAX_CONSENT_AGE_MS = 5 * 60_000;

const intakeSchema = z.object({
  token: z.string().min(10).max(64),
  fullName: z.string().trim().min(2, "Numele este obligatoriu").max(200),
  phone: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  company: z.string().trim().max(300).optional().nullable(),
  /** Ce a cerut omul, cu cuvintele lui. */
  message: z.string().trim().max(2000).optional().nullable(),
  interestCourse: z.string().trim().max(200).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  gclid: z.string().max(200).optional().nullable(),
  fbclid: z.string().max(200).optional().nullable(),
  /** Textul bifat de vizitator și clipa în care a bifat — dovada GDPR (cerința 63). */
  consentText: z.string().max(500).optional().nullable(),
  consentAt: z.string().datetime().optional().nullable(),
});

/** `https://ecosolar.md/cerere` → `https://ecosolar.md` — comparăm ORIGINI, nu adrese. */
function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

crmIntakeRoutes.post("/webform", zValidator("json", intakeSchema), async (c) => {
  const body = c.req.valid("json");

  const [source] = await db
    .select()
    .from(crmCaptureSources)
    .where(eq(crmCaptureSources.token, body.token));

  // Token necunoscut sau formular oprit → același răspuns. Un mesaj diferit pentru „există dar e
  // oprit" ar spune unui străin că tokenul e valid.
  if (!source || !source.active) return c.json({ error: "invalid_token" }, 401);

  const allowed = source.allowedOrigins ?? [];
  if (allowed.length > 0) {
    const origin = originOf(c.req.header("origin") ?? c.req.header("referer"));
    const ok = origin !== null && allowed.some((a) => originOf(a) === origin || a === origin);
    if (!ok) return c.json({ error: "origin_not_allowed" }, 403);
  }

  if (body.consentAt) {
    const age = Date.now() - new Date(body.consentAt).getTime();
    // Și în viitor e suspect: un ceas al clientului cu 10 minute înainte nu e o dovadă de consimțământ.
    if (!Number.isFinite(age) || age > MAX_CONSENT_AGE_MS || age < -MAX_CONSENT_AGE_MS) {
      return c.json({ error: "consent_expired" }, 400);
    }
  }

  const tenantId = source.tenantId;
  const phoneNormalized = normalizePhone(body.phone);
  const emailNormalized = normalizeEmail(body.email);

  // ── Duplicat? Aceeași persoană care cere ofertă de două ori e un client cu două cereri. ──
  let existing: { id: string } | undefined;
  if (phoneNormalized || emailNormalized) {
    const identifiers = [];
    if (phoneNormalized) identifiers.push(eq(leads.phoneNormalized, phoneNormalized));
    if (emailNormalized) identifiers.push(eq(leads.emailNormalized, emailNormalized));
    const match = identifiers.length === 1 ? identifiers[0] : or(...identifiers);
    [existing] = await db
      .select({ id: leads.id })
      .from(leads)
      // Un duplicat deja unificat în alt lead nu mai e „clientul": cererea nouă trebuie să ajungă
      // pe leadul în care a fost unificat, nu pe o fișă scoasă din listă și de pe tablă.
      .where(and(eq(leads.tenantId, tenantId), isNull(leads.mergedIntoId), match))
      .limit(1);
  }

  const noteBody = [body.message, body.interestCourse ? `Interes: ${body.interestCourse}` : null]
    .filter(Boolean)
    .join("\n") || null;

  if (existing) {
    await db.insert(leadInteractions).values({
      tenantId,
      leadId: existing.id,
      type: "note",
      direction: "inbound",
      body: `Cerere nouă din „${source.name}"${noteBody ? `:\n${noteBody}` : "."}`,
      metadata: {
        captureSourceId: source.id,
        utmSource: body.utmSource ?? null,
        utmCampaign: body.utmCampaign ?? null,
      },
    });
    // Omul a revenit singur, prin formular: e un răspuns, exact ca o interacțiune primită
    // (`POST /leads/:id/interactions` cu direction inbound). Cadența de urmărire se oprește, altfel
    // peste două zile agentul primește „sună, nu răspunde" despre cineva care tocmai a scris.
    await stopCadencesOnReply(tenantId, existing.id, null);
    await bumpCounter(source.id);
    // Nu spunem câmpuri ale leadului existent: răspunsul ajunge într-o pagină publică.
    return c.json({ ok: true, isDuplicate: true }, 200);
  }

  // Pâlnia formularului (verificată că e a workspace-ului, altfel implicita), cu etapele semănate:
  // într-un workspace nou, leadul venit de pe site trebuie să se poată muta imediat pe tablă.
  const pipeline =
    (source.pipelineId ? await resolveLeadPipeline(tenantId, source.pipelineId) : null) ??
    (await resolveLeadPipeline(tenantId, null));
  // Leadul intră pe PRIMA etapă a pâlniei lui, nu pe literalul „new" din default-ul coloanei:
  // un formular legat de SPANCO ar fi pus leadul pe o etapă care acolo nu există — invizibil pe tablă.
  const [firstStage] = pipeline ? await stagesOfPipeline(tenantId, pipeline.id) : [];

  const values: NewLead = {
    tenantId,
    fullName: body.fullName,
    phone: body.phone ?? null,
    phoneNormalized,
    email: body.email ?? null,
    emailNormalized,
    company: body.company ?? null,
    interestCourse: body.interestCourse ?? null,
    source: (["webform", "facebook_ad", "google_ads", "referral", "instagram", "other"].includes(source.defaultSource)
      ? source.defaultSource
      : "webform") as NewLead["source"],
    pipelineId: pipeline?.id ?? null,
    ...(firstStage ? { stage: firstStage.key } : {}),
    utmSource: body.utmSource ?? null,
    utmMedium: body.utmMedium ?? null,
    utmCampaign: body.utmCampaign ?? null,
    gclid: body.gclid ?? null,
    fbclid: body.fbclid ?? null,
    consentText: body.consentText ?? null,
    consentAt: body.consentAt ? new Date(body.consentAt) : null,
    // Dovada GDPR (cerința 63) vrea și de unde a venit consimțământul.
    ipAtConsent: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgentAtConsent: c.req.header("user-agent")?.slice(0, 512) ?? null,
    notes: noteBody,
  };

  const [lead] = await db.insert(leads).values(values).returning();

  // Distribuirea întâi, apoi automatizările — ca la crearea din aplicație: o regulă poate depinde
  // de cine e responsabilul. Niciuna nu aruncă, deci un formular nu se pierde dintr-o regulă greșită.
  await assignLeadAutomatically(tenantId, lead);
  const [afterAssign] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, lead.id), eq(leads.tenantId, tenantId)));
  await runAutomations({
    tenantId,
    userId: null,
    lead: afterAssign ?? lead,
    kind: "lead.created",
    assignFn: async (l) => (await assignLeadAutomatically(tenantId, l))?.userId ?? null,
  });

  await logCrmAudit({
    tenantId,
    actorId: null,
    action: "lead.captured",
    target: "crm_lead",
    targetId: lead.id,
    after: { source: source.name, utmSource: body.utmSource ?? null },
  });

  await bumpCounter(source.id);
  return c.json({ ok: true, isDuplicate: false, leadId: lead.id }, 201);
});

/** Câte leaduri a adus formularul — răspunde la „care dintre pagini chiar funcționează". */
async function bumpCounter(sourceId: string): Promise<void> {
  try {
    const [row] = await db
      .select({ n: crmCaptureSources.leadsCaptured })
      .from(crmCaptureSources)
      .where(eq(crmCaptureSources.id, sourceId));
    await db
      .update(crmCaptureSources)
      .set({ leadsCaptured: (row?.n ?? 0) + 1, lastCaptureAt: new Date(), updatedAt: new Date() })
      .where(eq(crmCaptureSources.id, sourceId));
  } catch {
    // Un contor care nu se incrementează nu are voie să piardă leadul.
  }
}
