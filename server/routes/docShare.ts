/**
 * Linkul public al unui act — și semnalul „Vizualizat" (cerința 42 din caietul de sarcini).
 *
 * Două routere, montate separat fiindcă au reguli de acces opuse:
 *  - `docShareRoutes` la `/api/docs/:documentId/share` — cere sesiune. Creează, arată și revocă
 *    linkul.
 *  - `docPublicRoutes` la `/api/public/doc` — NU cere nimic: e adresa pe care o deschide clientul.
 *    Limitată la rată, ca un robot care scanează internetul să nu poată măcina baza.
 *
 * Ce vede clientul: actul randat (titlu, număr, dată, părți, corp, total) — nu fișa lui internă.
 * Nu ies: id-uri interne, jurnalul, starea de plată, rechizitele noastre bancare peste ce e deja
 * scris în corpul actului, notele comerciale.
 *
 * Prima deschidere scrie `first_viewed_at` și o intrare în jurnalul actului. De aici iese
 * răspunsul la întrebarea pe care o pune orice agent: „a citit oferta sau nu?".
 */
import { Hono } from "hono";
import { recordLeadDocumentEvent } from "../lib/crm/documentEvents";
import { rateLimiter } from "hono-rate-limiter";
import type { Context } from "hono";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { docShareLinks } from "../db/schema/docShareLinks";
import { docDocuments, docDocumentLines, docAudit } from "../db/schema/docs";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { clientIp } from "../lib/clientIp";
import { blankUnresolved } from "../lib/docs/blanks";
import { leads } from "../db/schema/leads";
import { createNotification } from "../lib/createNotification";

// ─── Partea autentificată ─────────────────────────────────────────────────────

export const docShareRoutes = new Hono<{ Variables: AuthVariables }>();
docShareRoutes.use("/*", requireAuth);

function shareShape(row: typeof docShareLinks.$inferSelect) {
  return {
    id: row.id,
    token: row.token,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    firstViewedAt: row.firstViewedAt ? row.firstViewedAt.toISOString() : null,
    lastViewedAt: row.lastViewedAt ? row.lastViewedAt.toISOString() : null,
    viewCount: row.viewCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Actul, dacă e al workspace-ului. Altfel `null` → apelantul răspunde 404, nu 403. */
async function ownedDocument(tenantId: string, documentId: string) {
  const [row] = await db
    .select({ id: docDocuments.id, status: docDocuments.status, title: docDocuments.title })
    .from(docDocuments)
    .where(and(eq(docDocuments.id, documentId), eq(docDocuments.tenantId, tenantId)));
  return row ?? null;
}

docShareRoutes.get("/:documentId/share", async (c) => {
  const user = c.get("user");
  const documentId = c.req.param("documentId");
  if (!(await ownedDocument(user.tenantId, documentId))) return c.json({ error: "not_found" }, 404);

  const [row] = await db
    .select()
    .from(docShareLinks)
    .where(and(eq(docShareLinks.documentId, documentId), eq(docShareLinks.tenantId, user.tenantId)));
  return c.json(row ? shareShape(row) : null);
});

docShareRoutes.post("/:documentId/share", async (c) => {
  const user = c.get("user");
  const documentId = c.req.param("documentId");
  const doc = await ownedDocument(user.tenantId, documentId);
  if (!doc) return c.json({ error: "not_found" }, 404);

  // O ciornă nu se trimite clientului: numărul nu e rezervat, corpul se mai schimbă, iar linkul ar
  // arăta mâine alt act decât azi.
  if (doc.status === "draft") return c.json({ error: "document_is_draft" }, 400);

  const [existing] = await db
    .select()
    .from(docShareLinks)
    .where(and(eq(docShareLinks.documentId, documentId), eq(docShareLinks.tenantId, user.tenantId)));

  // Un act are un singur link. Cererea repetată îl reactivează pe cel existent (și îi șterge
  // revocarea), ca să nu apară două adrese valabile pentru același act.
  if (existing) {
    const [refreshed] = await db
      .update(docShareLinks)
      .set({ revokedAt: null })
      .where(eq(docShareLinks.id, existing.id))
      .returning();
    return c.json(shareShape(refreshed));
  }

  const [created] = await db
    .insert(docShareLinks)
    .values({ tenantId: user.tenantId, documentId, createdBy: user.id })
    .returning();

  await db.insert(docAudit).values({
    tenantId: user.tenantId,
    documentId,
    action: "share_link_created",
    actorUserId: user.id,
    details: JSON.stringify({ tokenPrefix: created.token.slice(0, 8) }),
  });

  return c.json(shareShape(created), 201);
});

docShareRoutes.delete("/:documentId/share", async (c) => {
  const user = c.get("user");
  const documentId = c.req.param("documentId");

  const [row] = await db
    .update(docShareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(docShareLinks.documentId, documentId), eq(docShareLinks.tenantId, user.tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);

  await db.insert(docAudit).values({
    tenantId: user.tenantId,
    documentId,
    action: "share_link_revoked",
    actorUserId: user.id,
  });

  return c.json({ ok: true });
});

// ─── Partea publică ───────────────────────────────────────────────────────────

export const docPublicRoutes = new Hono();

/**
 * 60 de deschideri / 15 minute / IP. Un client care reîncarcă pagina de câteva ori nu simte
 * limita; un robot care scanează adrese o simte imediat. Tokenul de 122 de biți nu se ghicește
 * oricum — limita apără conexiunea la bază, ca la verificarea publică a formularelor PAR.
 */
const publicDocRateLimit = rateLimiter({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: "draft-6",
  keyGenerator: (c: Context) => `docshare:${clientIp(c) ?? "local"}`,
  message: { error: "rate_limit_exceeded" },
});

docPublicRoutes.use("/*", publicDocRateLimit);

docPublicRoutes.get("/:token", async (c) => {
  const token = c.req.param("token");
  // Un token care nu e UUID nici măcar nu ajunge la bază.
  if (!/^[0-9a-f-]{36}$/i.test(token)) return c.json({ error: "not_found" }, 404);

  const [link] = await db
    .select()
    .from(docShareLinks)
    .where(and(eq(docShareLinks.token, token), isNull(docShareLinks.revokedAt)));

  // Link inexistent, revocat sau expirat: același răspuns. Un mesaj diferit ar spune celui care
  // încearcă adrese la întâmplare că a nimerit una care a existat cândva.
  if (!link || (link.expiresAt && link.expiresAt.getTime() < Date.now())) {
    return c.json({ error: "not_found" }, 404);
  }

  const [doc] = await db.select().from(docDocuments).where(eq(docDocuments.id, link.documentId));
  if (!doc) return c.json({ error: "not_found" }, 404);

  const lines = await db
    .select({
      position: docDocumentLines.position,
      description: docDocumentLines.description,
      unit: docDocumentLines.unit,
      quantity: docDocumentLines.quantity,
      unitPriceCents: docDocumentLines.unitPriceCents,
      lineTotalCents: docDocumentLines.lineTotalCents,
      vatPercent: docDocumentLines.vatPercent,
    })
    .from(docDocumentLines)
    .where(eq(docDocumentLines.documentId, doc.id))
    .orderBy(docDocumentLines.position);

  // Prima deschidere e momentul comercial; restul doar cresc contorul.
  const firstView = link.firstViewedAt === null;
  await db
    .update(docShareLinks)
    .set({
      firstViewedAt: link.firstViewedAt ?? new Date(),
      lastViewedAt: new Date(),
      viewCount: sql`${docShareLinks.viewCount} + 1`,
    })
    .where(eq(docShareLinks.id, link.id));

  if (firstView) {
    // În jurnalul actului, nu doar în tabela linkului: „cine a văzut actul și când" e un eveniment
    // al actului, iar cronologia lui trebuie citită dintr-un singur loc.
    await db.insert(docAudit).values({
      tenantId: doc.tenantId,
      documentId: doc.id,
      action: "viewed_by_counterparty",
      actorUserId: null,
    });
    // CRM-D05: „clientul a deschis oferta" — pe fișa leadului și la responsabilul lui, pe loc.
    await recordLeadDocumentEvent({ doc, event: "viewed", userId: null });
  }

  return c.json({
    title: doc.title,
    kind: doc.kind,
    docNumber: doc.docNumber,
    docDate: doc.docDate,
    status: doc.status,
    // CRM-D06: clientul poate răspunde de pe pagină (accept / refuz), doar la actele din CRM.
    canRespond: canRespond(doc),
    response: await lastResponse(doc.id),
    counterpartyName: doc.counterpartyName,
    totalCents: doc.totalCents,
    currency: doc.currency,
    // Acoladele necompletate se tipăresc ca rânduri de completat, exact ca la export: pe hârtie
    // (și în pagina clientului) nu apar niciodată `{{...}}`.
    bodyHtml: blankUnresolved(doc.bodyHtml ?? ""),
    lines,
  });
});

// ─── CRM-D06: clientul acceptă sau refuză de pe pagină ────────────────────────

/**
 * Lecția din VectorB2B (scrisorile de ofertă): clientul semnează din link, fără cont — nume tastat,
 * dată, IP, browser și amprenta actului. Nu e semnătură electronică calificată (MSign rămâne
 * pentru contractele care o cer), ci acceptarea unei oferte comerciale, cu dovadă păstrată.
 *
 * Doar actele din CRM, doar după ce au plecat la client (final/trimis), doar o dată: un act deja
 * semnat sau refuzat nu-și schimbă răspunsul de pe un link.
 */
function canRespond(doc: typeof docDocuments.$inferSelect): boolean {
  return doc.counterpartyKind === "crm_lead" && (doc.status === "final" || doc.status === "sent");
}

async function lastResponse(documentId: string) {
  const [row] = await db
    .select({ action: docAudit.action, details: docAudit.details, createdAt: docAudit.createdAt })
    .from(docAudit)
    .where(and(eq(docAudit.documentId, documentId), inArray(docAudit.action, ["accepted_by_counterparty", "declined_by_counterparty"])))
    .orderBy(desc(docAudit.createdAt))
    .limit(1);
  if (!row) return null;
  let name: string | null = null;
  try {
    name = (JSON.parse(row.details ?? "{}") as { name?: string }).name ?? null;
  } catch {
    name = null;
  }
  return { decision: row.action === "accepted_by_counterparty" ? "accepted" : "declined", name, at: row.createdAt };
}

const respondSchema = {
  parse(body: unknown): { decision: "accept" | "decline"; name: string; email: string | null; reason: string | null } | string {
    const b = (body ?? {}) as Record<string, unknown>;
    const decision = b.decision === "accept" || b.decision === "decline" ? b.decision : null;
    const name = typeof b.name === "string" ? b.name.trim() : "";
    const email = typeof b.email === "string" && b.email.trim() ? b.email.trim().slice(0, 255) : null;
    const reason = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim().slice(0, 500) : null;
    if (!decision) return "Alege dacă accepți sau refuzi.";
    if (name.length < 3 || name.length > 200) return "Scrie-ți numele complet — el ține loc de semnătură.";
    if (decision === "decline" && !reason) return "Spune-ne pe scurt de ce — ne ajută să revenim cu o variantă mai bună.";
    return { decision, name, email, reason };
  },
};

docPublicRoutes.post("/:token/respond", async (c) => {
  const token = c.req.param("token");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return c.json({ error: "not_found" }, 404);

  const [link] = await db
    .select()
    .from(docShareLinks)
    .where(and(eq(docShareLinks.token, token), isNull(docShareLinks.revokedAt)));
  if (!link || (link.expiresAt && link.expiresAt.getTime() < Date.now())) {
    return c.json({ error: "not_found" }, 404);
  }
  const [doc] = await db.select().from(docDocuments).where(eq(docDocuments.id, link.documentId));
  if (!doc) return c.json({ error: "not_found" }, 404);
  if (!canRespond(doc)) {
    return c.json({ error: "cannot_respond", status: doc.status, message: "Acest document nu mai așteaptă un răspuns." }, 409);
  }

  const parsed = respondSchema.parse(await c.req.json().catch(() => null));
  if (typeof parsed === "string") return c.json({ error: "invalid", message: parsed }, 400);

  const status = parsed.decision === "accept" ? "signed" : "rejected";
  // Condiția pe stare în UPDATE: două clicuri simultane nu pot scrie două răspunsuri.
  const [updated] = await db
    .update(docDocuments)
    .set({ status, outcomeAt: new Date(), outcomeReason: parsed.reason, updatedAt: new Date() })
    .where(and(eq(docDocuments.id, doc.id), inArray(docDocuments.status, ["final", "sent"])))
    .returning();
  if (!updated) return c.json({ error: "cannot_respond", message: "Acest document are deja un răspuns." }, 409);

  await db.insert(docAudit).values({
    tenantId: doc.tenantId,
    documentId: doc.id,
    action: parsed.decision === "accept" ? "accepted_by_counterparty" : "declined_by_counterparty",
    actorUserId: null,
    details: JSON.stringify({
      name: parsed.name,
      email: parsed.email,
      reason: parsed.reason,
      ip: clientIp(c),
      userAgent: (c.req.header("user-agent") ?? "").slice(0, 300),
      // Amprenta textului acceptat: dovada că s-a acceptat EXACT acest conținut.
      bodyHash: doc.bodyHash,
      at: new Date().toISOString(),
    }),
  });

  // Leadul: istoric + mutare (contractul semnat → câștigat), în numele celui care a emis actul.
  await recordLeadDocumentEvent({
    doc,
    event: status,
    userId: doc.createdByUserId,
    detail: parsed.decision === "decline" ? parsed.reason : null,
  });

  // Cine a emis actul și responsabilul leadului află pe loc.
  const recipients = new Set<string>();
  if (doc.createdByUserId) recipients.add(doc.createdByUserId);
  if (doc.counterpartyId) {
    const [lead] = await db.select({ assignedTo: leads.assignedTo }).from(leads).where(eq(leads.id, doc.counterpartyId));
    if (lead?.assignedTo) recipients.add(lead.assignedTo);
  }
  for (const userId of recipients) {
    await createNotification({
      tenantId: doc.tenantId,
      userId,
      type: parsed.decision === "accept" ? "crm_document_accepted" : "crm_document_declined",
      title:
        parsed.decision === "accept"
          ? `${doc.counterpartyName ?? "Clientul"} a acceptat ${doc.docNumber ?? doc.title}`
          : `${doc.counterpartyName ?? "Clientul"} a refuzat ${doc.docNumber ?? doc.title}`,
      body: parsed.decision === "accept" ? `Acceptat online de ${parsed.name}.` : `${parsed.name}: ${parsed.reason}`,
      link: doc.counterpartyId ? `/business/crm/pipeline?lead=${doc.counterpartyId}` : `/business/crm/documente`,
      metadata: { documentId: doc.id },
    });
  }

  return c.json({ status, response: await lastResponse(doc.id) });
});
