/**
 * DG-102 — API-ul registrului de acte.
 *
 * Montat la /api/docs (app.ts: app.route("/api/docs", docsRoutes)).
 *
 *   GET    /api/docs/documents            — lista, cu filtre (tip, proiect, contraparte, stare, text, perioadă)
 *   POST   /api/docs/documents            — creează ciornă dintr-un șablon + context + poziții
 *   GET    /api/docs/documents/:id        — actul, cu poziții, legături și jurnal
 *   PUT    /api/docs/documents/:id        — editează DOAR ciorne (409 după finalizare)
 *   POST   /api/docs/documents/:id/finalize — validează, rezervă numărul, îngheață rechizitele, sigilează
 *   POST   /api/docs/documents/:id/cancel   — anulează cu motiv (nu se șterge nimic)
 *
 * Ideea centrală: un act finalizat e o probă, nu o ciornă editabilă la nesfârșit. După finalizare
 * corpul e sigilat cu `body_hash` (ca la par_requests) și orice editare primește 409 — corectarea se
 * face prin anulare cu motiv + act nou. Așa registrul rezistă la un control, iar contabila poate
 * spune „actul ACT-2026-0007, semnat, 24.500 MDL" fără să caute prin email.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "../db/client";
import {
  docDocuments,
  docDocumentLines,
  docDocumentLinks,
  docNumberSequences,
  docAudit,
  docTemplateVersions,
} from "../db/schema/docs";
import { docmergeTemplates } from "../db/schema/docmergeTemplates";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { extractPlaceholders, renderWithContext } from "../lib/docmerge/placeholders";
import { SYSTEM_TEMPLATES } from "../lib/docs/systemTemplates";
import { buildPreviewContext } from "../lib/docs/previewContext";

export const docsRoutes = new Hono<{ Variables: AuthVariables }>();

docsRoutes.use("/*", requireAuth);

/** Prefixul implicit de numerotare, per tip de act. DG-113 îl va face configurabil din setări. */
const KIND_PREFIX: Record<string, string> = {
  act_primire_predare: "ACT",
  contract_servicii: "CTR",
  contract_vanzare: "CTR",
  act_aditional: "ADI",
  proces_verbal: "PV",
  act_compensare: "COMP",
  other: "DOC",
};

const lineSchema = z.object({
  description: z.string().min(1, "Denumirea poziției e obligatorie"),
  unit: z.string().max(50).optional(),
  quantity: z.number().int().positive("Cantitatea trebuie să fie > 0"),
  unitPriceCents: z.number().int().min(0),
  vatPercent: z.number().int().min(0).max(100).optional(),
});

const counterpartySchema = z.object({
  kind: z.enum(["vendor", "fin_party", "inline"]).default("vendor"),
  id: z.string().uuid().nullish(),
  name: z.string().max(300).nullish(),
  /** Rechizitele: idno, iban, banca, bic, adresa, administrator, codTva. */
  snapshot: z.record(z.string()).nullish(),
});

const createSchema = z.object({
  templateId: z.string().uuid().nullish(),
  kind: z.string().max(50).default("act_primire_predare"),
  title: z.string().min(1, "Titlul e obligatoriu").max(300),
  docDate: z.string().datetime().optional(),
  projectId: z.string().uuid().nullish(),
  eventId: z.string().uuid().nullish(),
  payerId: z.string().uuid().nullish(),
  counterparty: counterpartySchema.optional(),
  context: z.record(z.string()).optional(),
  lines: z.array(lineSchema).optional(),
  currency: z.string().length(3).optional(),
});

const updateSchema = createSchema.partial().omit({ templateId: true });

const cancelSchema = z.object({
  reason: z.string().min(3, "Motivul anulării e obligatoriu").max(500),
});

function safeJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

type LineInput = z.infer<typeof lineSchema>;

/** Totalurile se calculează AICI, pe server — un total trimis de client nu e o sursă de adevăr. */
function computeLineTotals(lines: LineInput[]) {
  const rows = lines.map((l, i) => ({
    position: i + 1,
    description: l.description,
    unit: l.unit ?? "buc",
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    lineTotalCents: l.quantity * l.unitPriceCents,
    vatPercent: l.vatPercent ?? 0,
  }));
  return { rows, totalCents: rows.reduce((s, r) => s + r.lineTotalCents, 0) };
}

/**
 * Sigiliul actului: hash peste corp + părți + poziții. Dacă cineva umblă direct în bază,
 * verificarea de integritate (DG-114) o va observa.
 */
function computeBodyHash(input: {
  bodyHtml: string;
  counterpartyName: string | null;
  counterpartySnapshot: string | null;
  lines: { description: string; quantity: number; unitPriceCents: number }[];
  totalCents: number;
  currency: string;
}): string {
  const payload = JSON.stringify({
    body: input.bodyHtml,
    party: input.counterpartyName ?? "",
    requisites: input.counterpartySnapshot ?? "",
    lines: input.lines.map((l) => [l.description, l.quantity, l.unitPriceCents]),
    total: input.totalCents,
    currency: input.currency,
  });
  return createHash("sha256").update(payload).digest("hex");
}

async function writeAudit(
  tenantId: string,
  documentId: string,
  actorUserId: string | null,
  action: string,
  details?: Record<string, unknown>
) {
  await db.insert(docAudit).values({
    tenantId,
    documentId,
    actorUserId,
    action,
    details: details ? JSON.stringify(details) : null,
  });
}

/** Randează corpul din șablon. Un act fără șablon păstrează corpul primit (import/derivare). */
async function renderBody(
  tenantId: string,
  templateId: string | null | undefined,
  context: Record<string, string>
): Promise<{ bodyHtml: string; templateVersion: number }> {
  if (!templateId) return { bodyHtml: "", templateVersion: 1 };
  const [tpl] = await db
    .select()
    .from(docmergeTemplates)
    .where(and(eq(docmergeTemplates.id, templateId), eq(docmergeTemplates.tenantId, tenantId)));
  if (!tpl) return { bodyHtml: "", templateVersion: 1 };
  return {
    bodyHtml: renderWithContext(tpl.bodyHtml, context),
    templateVersion: tpl.version ?? 1,
  };
}

// ─── Lista ────────────────────────────────────────────────────────────────────

docsRoutes.get("/documents", async (c) => {
  const user = c.get("user");
  const q = c.req.query();

  const filters = [eq(docDocuments.tenantId, user.tenantId)];
  if (q.status) filters.push(eq(docDocuments.status, q.status));
  if (q.kind) filters.push(eq(docDocuments.kind, q.kind));
  if (q.projectId) filters.push(eq(docDocuments.projectId, q.projectId));
  if (q.counterpartyId) filters.push(eq(docDocuments.counterpartyId, q.counterpartyId));
  if (q.from) filters.push(gte(docDocuments.docDate, new Date(q.from)));
  if (q.to) filters.push(lte(docDocuments.docDate, new Date(q.to)));
  if (q.q) filters.push(ilike(docDocuments.title, `%${q.q}%`));

  const rows = await db
    .select({
      id: docDocuments.id,
      kind: docDocuments.kind,
      docNumber: docDocuments.docNumber,
      docDate: docDocuments.docDate,
      title: docDocuments.title,
      status: docDocuments.status,
      projectId: docDocuments.projectId,
      counterpartyId: docDocuments.counterpartyId,
      counterpartyName: docDocuments.counterpartyName,
      totalCents: docDocuments.totalCents,
      currency: docDocuments.currency,
      finalizedAt: docDocuments.finalizedAt,
      cancelledAt: docDocuments.cancelledAt,
    })
    .from(docDocuments)
    .where(and(...filters))
    .orderBy(desc(docDocuments.createdAt))
    .limit(Math.min(Number(q.limit) || 200, 500));

  return c.json(rows);
});

// ─── Creare ───────────────────────────────────────────────────────────────────

docsRoutes.post("/documents", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const context = body.context ?? {};
  const { bodyHtml, templateVersion } = await renderBody(user.tenantId, body.templateId, context);
  const { rows, totalCents } = computeLineTotals(body.lines ?? []);

  const [doc] = await db
    .insert(docDocuments)
    .values({
      tenantId: user.tenantId,
      templateId: body.templateId ?? null,
      templateVersion,
      kind: body.kind,
      title: body.title,
      docDate: body.docDate ? new Date(body.docDate) : new Date(),
      projectId: body.projectId ?? null,
      eventId: body.eventId ?? null,
      payerId: body.payerId ?? null,
      counterpartyKind: body.counterparty?.kind ?? "vendor",
      counterpartyId: body.counterparty?.id ?? null,
      counterpartyName: body.counterparty?.name ?? null,
      counterpartySnapshot: body.counterparty?.snapshot
        ? JSON.stringify(body.counterparty.snapshot)
        : null,
      context: JSON.stringify(context),
      bodyHtml,
      totalCents,
      currency: body.currency ?? "MDL",
      createdByUserId: user.id,
    })
    .returning();

  if (rows.length > 0) {
    await db
      .insert(docDocumentLines)
      .values(rows.map((r) => ({ ...r, tenantId: user.tenantId, documentId: doc.id })));
  }
  await writeAudit(user.tenantId, doc.id, user.id, "created", { title: doc.title });

  return c.json({ ...doc, lines: rows }, 201);
});

// ─── Un act, cu tot ce ține de el ─────────────────────────────────────────────

docsRoutes.get("/documents/:id", async (c) => {
  const user = c.get("user");
  const [doc] = await db
    .select()
    .from(docDocuments)
    .where(and(eq(docDocuments.id, c.req.param("id")), eq(docDocuments.tenantId, user.tenantId)));
  if (!doc) return c.json({ error: "not_found" }, 404);

  const lines = await db
    .select()
    .from(docDocumentLines)
    .where(eq(docDocumentLines.documentId, doc.id))
    .orderBy(docDocumentLines.position);
  const links = await db
    .select()
    .from(docDocumentLinks)
    .where(eq(docDocumentLinks.fromDocumentId, doc.id));
  const audit = await db
    .select()
    .from(docAudit)
    .where(eq(docAudit.documentId, doc.id))
    .orderBy(desc(docAudit.createdAt));

  return c.json({
    ...doc,
    context: safeJson(doc.context),
    counterpartySnapshot: safeJson(doc.counterpartySnapshot),
    lines,
    links,
    audit: audit.map((a) => ({ ...a, details: safeJson(a.details) })),
  });
});

// ─── Editare (doar ciorne) ────────────────────────────────────────────────────

docsRoutes.put("/documents/:id", zValidator("json", updateSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const [doc] = await db
    .select()
    .from(docDocuments)
    .where(and(eq(docDocuments.id, c.req.param("id")), eq(docDocuments.tenantId, user.tenantId)));
  if (!doc) return c.json({ error: "not_found" }, 404);

  if (doc.status !== "draft") {
    // Aici e miezul modulului: după finalizare actul nu se mai atinge.
    return c.json(
      {
        error: "document_finalized",
        message:
          doc.status === "cancelled"
            ? "Actul este anulat și nu mai poate fi modificat."
            : "Actul este finalizat. Anulează-l cu motiv și emite unul nou.",
      },
      409
    );
  }

  const context = body.context ?? (safeJson(doc.context) as Record<string, string>);
  const rendered = body.context
    ? await renderBody(user.tenantId, doc.templateId, context)
    : { bodyHtml: doc.bodyHtml, templateVersion: doc.templateVersion };

  let totalCents = doc.totalCents;
  let lines: ReturnType<typeof computeLineTotals>["rows"] | null = null;
  if (body.lines) {
    const computed = computeLineTotals(body.lines);
    lines = computed.rows;
    totalCents = computed.totalCents;
    await db.delete(docDocumentLines).where(eq(docDocumentLines.documentId, doc.id));
    if (lines.length > 0) {
      await db
        .insert(docDocumentLines)
        .values(lines.map((r) => ({ ...r, tenantId: user.tenantId, documentId: doc.id })));
    }
  }

  const [updated] = await db
    .update(docDocuments)
    .set({
      title: body.title ?? doc.title,
      kind: body.kind ?? doc.kind,
      docDate: body.docDate ? new Date(body.docDate) : doc.docDate,
      projectId: body.projectId === undefined ? doc.projectId : body.projectId,
      eventId: body.eventId === undefined ? doc.eventId : body.eventId,
      payerId: body.payerId === undefined ? doc.payerId : body.payerId,
      counterpartyKind: body.counterparty?.kind ?? doc.counterpartyKind,
      counterpartyId:
        body.counterparty === undefined ? doc.counterpartyId : body.counterparty.id ?? null,
      counterpartyName:
        body.counterparty === undefined ? doc.counterpartyName : body.counterparty.name ?? null,
      counterpartySnapshot:
        body.counterparty === undefined
          ? doc.counterpartySnapshot
          : body.counterparty.snapshot
            ? JSON.stringify(body.counterparty.snapshot)
            : null,
      context: JSON.stringify(context),
      bodyHtml: rendered.bodyHtml,
      totalCents,
      currency: body.currency ?? doc.currency,
      updatedAt: new Date(),
    })
    .where(eq(docDocuments.id, doc.id))
    .returning();

  await writeAudit(user.tenantId, doc.id, user.id, "updated", {});
  return c.json({ ...updated, lines });
});

// ─── Finalizare ───────────────────────────────────────────────────────────────

/**
 * Rezervă următorul număr pentru (tenant, tip, an). Un singur statement atomic
 * (`ON CONFLICT DO UPDATE … RETURNING`), deci două finalizări simultane primesc numere diferite
 * fără să blocăm tabela. Ciornele NU consumă numere — de asta se cheamă abia aici.
 */
async function reserveNumber(tenantId: string, kind: string, year: number): Promise<string> {
  const prefix = KIND_PREFIX[kind] ?? KIND_PREFIX.other;
  const [seq] = await db
    .insert(docNumberSequences)
    .values({ tenantId, kind, year, prefix, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [docNumberSequences.tenantId, docNumberSequences.kind, docNumberSequences.year],
      set: { lastNumber: sql`${docNumberSequences.lastNumber} + 1`, updatedAt: new Date() },
    })
    .returning();
  return `${prefix}-${year}-${String(seq.lastNumber).padStart(4, "0")}`;
}

docsRoutes.post("/documents/:id/finalize", async (c) => {
  const user = c.get("user");
  const [doc] = await db
    .select()
    .from(docDocuments)
    .where(and(eq(docDocuments.id, c.req.param("id")), eq(docDocuments.tenantId, user.tenantId)));
  if (!doc) return c.json({ error: "not_found" }, 404);
  if (doc.status === "final") return c.json({ error: "already_final", docNumber: doc.docNumber }, 409);
  if (doc.status === "cancelled") return c.json({ error: "document_cancelled" }, 409);

  const lines = await db
    .select()
    .from(docDocumentLines)
    .where(eq(docDocumentLines.documentId, doc.id))
    .orderBy(docDocumentLines.position);

  // Ce lipsește se spune pe nume, în română — nu „validation error".
  const missing: string[] = [];
  if (!doc.title.trim()) missing.push("Titlul actului");
  if (!doc.counterpartyName?.trim()) missing.push("Contrapartea (denumirea)");
  if (lines.length === 0) missing.push("Cel puțin o poziție în act");
  const totalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  if (totalCents <= 0) missing.push("Suma actului (mai mare ca zero)");
  if (missing.length > 0) return c.json({ error: "incomplete", missing }, 400);

  const year = doc.docDate.getFullYear();
  const docNumber = await reserveNumber(user.tenantId, doc.kind, year);
  const bodyHash = computeBodyHash({
    bodyHtml: doc.bodyHtml,
    counterpartyName: doc.counterpartyName,
    counterpartySnapshot: doc.counterpartySnapshot,
    lines,
    totalCents,
    currency: doc.currency,
  });

  const [updated] = await db
    .update(docDocuments)
    .set({
      status: "final",
      docNumber,
      docYear: year,
      totalCents,
      bodyHash,
      finalizedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(docDocuments.id, doc.id))
    .returning();

  await writeAudit(user.tenantId, doc.id, user.id, "finalized", { docNumber });
  return c.json(updated);
});

// ─── Anulare (niciodată ștergere) ─────────────────────────────────────────────

docsRoutes.post("/documents/:id/cancel", zValidator("json", cancelSchema), async (c) => {
  const user = c.get("user");
  const { reason } = c.req.valid("json");
  const [doc] = await db
    .select()
    .from(docDocuments)
    .where(and(eq(docDocuments.id, c.req.param("id")), eq(docDocuments.tenantId, user.tenantId)));
  if (!doc) return c.json({ error: "not_found" }, 404);
  if (doc.status === "cancelled") return c.json({ error: "already_cancelled" }, 409);

  const [updated] = await db
    .update(docDocuments)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason, updatedAt: new Date() })
    .where(eq(docDocuments.id, doc.id))
    .returning();

  await writeAudit(user.tenantId, doc.id, user.id, "cancelled", { reason });
  return c.json(updated);
});


// ─── Biblioteca de șabloane de acte (DG-106) ─────────────────────────────────

/**
 * Instalează, o singură dată per organizație, șabloanele livrate cu produsul.
 *
 * De ce la citire și nu la seed: organizațiile există deja (unele de luni de zile) și nimeni nu
 * rulează un seed pe producție. Așa, prima deschidere a bibliotecii le aduce. Idempotent: se
 * inserează doar cele care lipsesc, după (nume + is_system), deci rularea repetată nu duplică
 * nimic și nu atinge ce a editat organizația.
 */
async function ensureSystemTemplates(tenantId: string): Promise<void> {
  const existing = await db
    .select({ name: docmergeTemplates.name })
    .from(docmergeTemplates)
    .where(and(eq(docmergeTemplates.tenantId, tenantId), eq(docmergeTemplates.isSystem, true)));
  const have = new Set(existing.map((r) => r.name));
  const missing = SYSTEM_TEMPLATES.filter((t) => !have.has(t.name));
  if (missing.length === 0) return;

  await db.insert(docmergeTemplates).values(
    missing.map((t) => ({
      tenantId,
      name: t.name,
      bodyHtml: t.bodyHtml,
      placeholders: JSON.stringify(extractPlaceholders(t.bodyHtml)),
      kind: t.kind,
      category: t.category,
      isSystem: true,
    }))
  );
}

docsRoutes.get("/templates", async (c) => {
  const user = c.get("user");
  await ensureSystemTemplates(user.tenantId);

  const rows = await db
    .select({
      id: docmergeTemplates.id,
      name: docmergeTemplates.name,
      kind: docmergeTemplates.kind,
      category: docmergeTemplates.category,
      isSystem: docmergeTemplates.isSystem,
      version: docmergeTemplates.version,
      placeholders: docmergeTemplates.placeholders,
      updatedAt: docmergeTemplates.updatedAt,
    })
    .from(docmergeTemplates)
    .where(eq(docmergeTemplates.tenantId, user.tenantId))
    .orderBy(desc(docmergeTemplates.updatedAt));

  return c.json(
    rows.map((r) => ({
      ...r,
      placeholders: (() => {
        try {
          const p: unknown = JSON.parse(r.placeholders);
          return Array.isArray(p) ? (p as string[]) : [];
        } catch {
          return [];
        }
      })(),
    }))
  );
});

/**
 * Clonarea: singurul mod de a porni de la un șablon standard. Copia aparține organizației și se
 * poate edita liber, iar originalul rămâne intact pentru toți ceilalți.
 */
docsRoutes.post("/templates/:id/clone", async (c) => {
  const user = c.get("user");
  const [src] = await db
    .select()
    .from(docmergeTemplates)
    .where(
      and(
        eq(docmergeTemplates.id, c.req.param("id")),
        eq(docmergeTemplates.tenantId, user.tenantId)
      )
    );
  if (!src) return c.json({ error: "not_found" }, 404);

  const [copy] = await db
    .insert(docmergeTemplates)
    .values({
      tenantId: user.tenantId,
      name: `${src.name} (copie)`,
      bodyHtml: src.bodyHtml,
      placeholders: src.placeholders,
      kind: src.kind,
      category: src.category,
      isSystem: false,
    })
    .returning();

  return c.json(copy, 201);
});


// ─── Versiuni și previzualizare (DG-107) ─────────────────────────────────────

/** Istoricul versiunilor unui șablon, cel mai nou primul. */
docsRoutes.get("/templates/:id/versions", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select({
      id: docTemplateVersions.id,
      version: docTemplateVersions.version,
      name: docTemplateVersions.name,
      createdAt: docTemplateVersions.createdAt,
    })
    .from(docTemplateVersions)
    .where(
      and(
        eq(docTemplateVersions.templateId, c.req.param("id")),
        eq(docTemplateVersions.tenantId, user.tenantId)
      )
    )
    .orderBy(desc(docTemplateVersions.version));
  return c.json(rows);
});

/**
 * Revenirea la o versiune veche NU rescrie istoricul: creează o versiune nouă cu acel conținut.
 * Altfel, actele care poartă „versiunea 3" ar arăta brusc altceva decât la semnare.
 */
docsRoutes.post("/templates/:id/restore/:version", async (c) => {
  const user = c.get("user");
  const templateId = c.req.param("id");
  const version = Number(c.req.param("version"));

  const [old] = await db
    .select()
    .from(docTemplateVersions)
    .where(
      and(
        eq(docTemplateVersions.templateId, templateId),
        eq(docTemplateVersions.tenantId, user.tenantId),
        eq(docTemplateVersions.version, version)
      )
    );
  if (!old) return c.json({ error: "not_found" }, 404);

  const [tpl] = await db
    .select()
    .from(docmergeTemplates)
    .where(and(eq(docmergeTemplates.id, templateId), eq(docmergeTemplates.tenantId, user.tenantId)));
  if (!tpl) return c.json({ error: "not_found" }, 404);
  if (tpl.isSystem) return c.json({ error: "system_template" }, 403);

  const nextVersion = (tpl.version ?? 1) + 1;
  const [updated] = await db
    .update(docmergeTemplates)
    .set({
      bodyHtml: old.bodyHtml,
      placeholders: JSON.stringify(extractPlaceholders(old.bodyHtml)),
      version: nextVersion,
      updatedAt: new Date(),
    })
    .where(eq(docmergeTemplates.id, templateId))
    .returning();

  await db.insert(docTemplateVersions).values({
    tenantId: user.tenantId,
    templateId,
    version: nextVersion,
    name: updated.name,
    bodyHtml: old.bodyHtml,
    createdByUserId: user.id,
  });

  return c.json({ id: updated.id, version: nextVersion, restoredFrom: version });
});

/**
 * Previzualizare: cu date de exemplu sau — mult mai util — cu un furnizor real din registru.
 * Corpul întors e deja randat, deci se vede exact ce va conține actul.
 */
docsRoutes.post("/templates/:id/preview", async (c) => {
  const user = c.get("user");
  const [tpl] = await db
    .select()
    .from(docmergeTemplates)
    .where(
      and(
        eq(docmergeTemplates.id, c.req.param("id")),
        eq(docmergeTemplates.tenantId, user.tenantId)
      )
    );
  if (!tpl) return c.json({ error: "not_found" }, 404);

  let vendorId: string | null = null;
  try {
    const body = (await c.req.json()) as { vendorId?: string | null };
    vendorId = body?.vendorId ?? null;
  } catch {
    vendorId = null;
  }

  const context = await buildPreviewContext({
    tenantId: user.tenantId,
    vendorId,
    userName: (user as { name?: string }).name ?? null,
  });

  return c.json({ html: renderWithContext(tpl.bodyHtml, context), context });
});
