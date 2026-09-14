/**
 * CRM — drepturile persoanei pe fișa leadului (cerința 63 din caietul de sarcini: „conformitate
 * cu legislația privind protecția datelor cu caracter personal").
 *
 * Montat la /api/crm/gdpr.
 *
 *   GET  /api/crm/gdpr/export/:leadId    — tot ce știm despre om, ca JSON (dreptul de acces + portabilitate)
 *   POST /api/crm/gdpr/anonymize/:leadId — ștergerea datelor personale, cu păstrarea urmei comerciale
 *   POST /api/crm/gdpr/revoke/:leadId    — retragerea consimțământului
 *
 * Modelul e cel din `finGdpr.ts`, cu aceeași decizie de fond: **anonimizare, nu ștergere.**
 * Un lead șters ar lua cu el și istoria comercială — câte oferte s-au trimis, de ce s-a pierdut,
 * ce a încasat firma. Dreptul persoanei e asupra DATELOR EI, nu asupra faptelor contabile ale
 * firmei. Deci numele, telefonul, emailul și notele devin marcaje de ștergere, iar cifrele rămân.
 *
 * Exportul și anonimizarea sunt acțiuni de administrator: cine le poate face poate citi întreaga
 * fișă a unui om. Agentul de vânzări n-are nevoie de ele ca să-și facă treaba.
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  leads,
  leadInteractions,
  leadContacts,
  leadTags,
  leadFieldValues,
  leadAttachments,
  customFields,
} from "../db/schema/leads";
import { crmLeadTasks } from "../db/schema/crmTasks";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import { logCrmAudit } from "../lib/crm/audit";

export const crmGdprRoutes = new Hono<{ Variables: AuthVariables }>();
crmGdprRoutes.use("/*", requireAuth);

/** Marcajul scris în locul datelor personale. Același text ca în modulul FinDesk. */
const GDPR_REMOVED = "[GDPR_REMOVED]";

// ─── GET /export/:leadId ──────────────────────────────────────────────────────

crmGdprRoutes.get("/export/:leadId", requireCrmPermission("audit.view"), async (c) => {
  const user = c.get("user");
  const leadId = c.req.param("leadId");

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, user.tenantId)));
  if (!lead) return c.json({ error: "not_found" }, 404);

  const [interactions, contacts, tags, tasks, fieldValues, files, fields] = await Promise.all([
    db.select().from(leadInteractions).where(and(eq(leadInteractions.tenantId, user.tenantId), eq(leadInteractions.leadId, leadId))),
    db.select().from(leadContacts).where(and(eq(leadContacts.tenantId, user.tenantId), eq(leadContacts.leadId, leadId))),
    db.select().from(leadTags).where(and(eq(leadTags.tenantId, user.tenantId), eq(leadTags.leadId, leadId))),
    db.select().from(crmLeadTasks).where(and(eq(crmLeadTasks.tenantId, user.tenantId), eq(crmLeadTasks.leadId, leadId))),
    db.select().from(leadFieldValues).where(and(eq(leadFieldValues.tenantId, user.tenantId), eq(leadFieldValues.leadId, leadId))),
    db.select().from(leadAttachments).where(and(eq(leadAttachments.tenantId, user.tenantId), eq(leadAttachments.leadId, leadId))),
    db.select().from(customFields).where(eq(customFields.tenantId, user.tenantId)),
  ]);

  const fieldLabel = new Map(fields.map((f) => [f.id, f.label]));

  const payload = {
    exportedAt: new Date().toISOString(),
    // Cererea de export e ea însăși o prelucrare: se consemnează cine a cerut-o și când.
    exportedBy: user.email,
    lead: {
      id: lead.id,
      fullName: lead.fullName,
      dealName: lead.dealName,
      phone: lead.phone,
      email: lead.email,
      company: lead.company,
      interestCourse: lead.interestCourse,
      source: lead.source,
      stage: lead.stage,
      notes: lead.notes,
      createdAt: lead.createdAt,
    },
    consent: {
      text: lead.consentText,
      givenAt: lead.consentAt,
      revokedAt: lead.consentRevokedAt,
      ipAtConsent: lead.ipAtConsent,
      userAgentAtConsent: lead.userAgentAtConsent,
    },
    contacts: contacts.map((ct) => ({ fullName: ct.fullName, role: ct.role, phone: ct.phone, email: ct.email })),
    interactions: interactions.map((i) => ({ type: i.type, direction: i.direction, body: i.body, occurredAt: i.occurredAt })),
    tasks: tasks.map((t) => ({ title: t.title, dueAt: t.dueAt, status: t.status, completedAt: t.completedAt })),
    tags: tags.map((t) => t.tag),
    customFields: fieldValues.map((v) => ({ field: fieldLabel.get(v.fieldId) ?? v.fieldId, value: v.value })),
    // Fișierele se listează, nu se includ: un JSON cu binarul înăuntru n-ar fi portabil, ar fi greu.
    files: files.map((f) => ({ fileName: f.fileName, mime: f.mime, sizeBytes: f.sizeBytes, createdAt: f.createdAt })),
  };

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "gdpr.exported",
    target: "crm_lead",
    targetId: leadId,
  });

  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="gdpr-lead-${leadId}.json"`);
  return c.body(JSON.stringify(payload, null, 2), 200);
});

// ─── POST /anonymize/:leadId ──────────────────────────────────────────────────

crmGdprRoutes.post("/anonymize/:leadId", requireCrmPermission("leads.delete"), async (c) => {
  const user = c.get("user");
  const leadId = c.req.param("leadId");

  const [lead] = await db
    .select({ id: leads.id, fullName: leads.fullName })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, user.tenantId)));
  if (!lead) return c.json({ error: "not_found" }, 404);

  // Leadul: identitatea dispare, cifrele rămân (valoare, etapă, motiv de pierdere — fapte
  // comerciale ale firmei, nu date ale persoanei).
  await db
    .update(leads)
    .set({
      fullName: GDPR_REMOVED,
      fullNameNormalized: null,
      phone: null,
      phoneNormalized: null,
      email: null,
      emailNormalized: null,
      notes: null,
      consentText: null,
      ipAtConsent: null,
      userAgentAtConsent: null,
      consentRevokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, user.tenantId)));

  // Persoanele de contact sunt, toate, date personale: dispar complet.
  await db.delete(leadContacts).where(and(eq(leadContacts.tenantId, user.tenantId), eq(leadContacts.leadId, leadId)));

  // Cronologia: PĂSTRĂM că a existat un apel și când, ȘTERGEM ce s-a spus în el. Altfel s-ar
  // pierde și dovada că firma a respectat un termen, nu doar conținutul conversației.
  const rows = await db
    .select({ id: leadInteractions.id })
    .from(leadInteractions)
    .where(and(eq(leadInteractions.tenantId, user.tenantId), eq(leadInteractions.leadId, leadId)));
  for (const row of rows) {
    await db
      .update(leadInteractions)
      .set({ body: GDPR_REMOVED, metadata: null })
      .where(eq(leadInteractions.id, row.id));
  }

  // Valorile din câmpurile personalizate pot conține orice a scris agentul acolo.
  await db.delete(leadFieldValues).where(and(eq(leadFieldValues.tenantId, user.tenantId), eq(leadFieldValues.leadId, leadId)));

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "gdpr.anonymized",
    target: "crm_lead",
    targetId: leadId,
    before: { fullName: lead.fullName },
  });

  return c.json({ ok: true });
});

// ─── POST /revoke/:leadId ─────────────────────────────────────────────────────

/**
 * Retragerea consimțământului. NU șterge nimic: omul a spus „nu mă mai contactați", nu „ștergeți
 * ce știți despre mine". Cele două drepturi sunt diferite, iar confundarea lor ar face imposibilă
 * dovada că cererea a fost respectată.
 */
crmGdprRoutes.post("/revoke/:leadId", requireCrmPermission("leads.edit"), async (c) => {
  const user = c.get("user");
  const leadId = c.req.param("leadId");

  const [row] = await db
    .update(leads)
    .set({ consentRevokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, user.tenantId)))
    .returning({ id: leads.id, consentRevokedAt: leads.consentRevokedAt });
  if (!row) return c.json({ error: "not_found" }, 404);

  await db.insert(leadInteractions).values({
    tenantId: user.tenantId,
    leadId,
    type: "system",
    direction: "internal",
    body: "Consimțământ retras: leadul nu mai poate fi contactat comercial.",
    userId: user.id,
  });

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "gdpr.consent_revoked",
    target: "crm_lead",
    targetId: leadId,
  });

  return c.json({ ok: true, consentRevokedAt: row.consentRevokedAt });
});
