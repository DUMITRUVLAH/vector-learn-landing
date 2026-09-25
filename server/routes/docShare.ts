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
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { docShareLinks } from "../db/schema/docShareLinks";
import { docDocuments, docDocumentLines, docAudit } from "../db/schema/docs";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { clientIp } from "../lib/clientIp";
import { blankUnresolved } from "../lib/docs/blanks";

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
    counterpartyName: doc.counterpartyName,
    totalCents: doc.totalCents,
    currency: doc.currency,
    // Acoladele necompletate se tipăresc ca rânduri de completat, exact ca la export: pe hârtie
    // (și în pagina clientului) nu apar niciodată `{{...}}`.
    bodyHtml: blankUnresolved(doc.bodyHtml ?? ""),
    lines,
  });
});
