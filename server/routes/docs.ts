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
import { and, desc, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";
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
import { missingFields, resolveDocumentContext } from "../lib/docs/fieldResolver";
import { validateIban, validateFiscalId } from "../../src/lib/par/iban";
import { fieldLabelRo } from "../lib/docs/fieldLabels";
import { renderDocumentPdf, pdfFileName, buildPrintableHtml } from "../lib/docs/documentPdf";
import { insertLinesTable, type TableLine } from "../lib/docs/linesTable";
import {
  parSettings,
  parRequests,
  parLineItems,
  parAttachments,
  parProjects,
  parPayers,
  parReceipts,
  parReceiptLines,
} from "../db/schema/par";
import { generateRequestNo } from "../lib/par/requestNo";
import { buildProjectDossier, buildCounterpartyDossier } from "../lib/docs/dossier";
import { sendDocumentEmail } from "../lib/docs/sendDocumentEmail";
import { BatchPdfRenderer } from "../lib/docmerge/htmlToPdf";
import { buildPdfZip } from "../lib/docmerge/zipPdfs";
import { accessibleProjectIds, mayAccessProject } from "../lib/par/projectScope";

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

/**
 * Pe un act FINALIZAT nu au ce căuta acolade: dacă un câmp n-a avut sursă, se tipărește un rând de
 * completat cu pixul, cum arată orice formular tipizat. „{{noi.administrator}}" pe un act dus la
 * semnat e o eroare vizibilă a produsului; „____" e o practică normală.
 */
function blankUnresolved(html: string): string {
  return html.replace(/\{\{[\wăâîșț.]+\}\}/gi, "__________");
}

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

/**
 * DG-123 — ce acte are voie să vadă utilizatorul.
 *
 * Regula e cea din PAR, ca să nu existe două adevăruri: adminii și managerii văd tot; ceilalți văd
 * doar actele proiectelor din care fac parte. Actele FĂRĂ proiect rămân vizibile pentru toți din
 * organizație — sunt documente administrative, nu date de donator.
 *
 * De ce contează: contractele cu furnizorii unui proiect conțin sume și rechizite pe care alți
 * donatori nu trebuie să le vadă. Fără filtrul ăsta, orice utilizator invitat citea tot registrul.
 */
async function visibilityFilter(user: { id: string; tenantId: string; role?: string }) {
  const allowed = await accessibleProjectIds(user.id, user.tenantId, user.role);
  if (allowed === null) return null; // admin/manager: fără restricție
  return allowed;
}

/** Actul e vizibil dacă n-are proiect sau dacă proiectul lui e printre cele accesibile. */
function maySeeDocument(projectId: string | null, allowed: string[] | null): boolean {
  if (allowed === null) return true;
  if (!projectId) return true;
  return allowed.includes(projectId);
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

/**
 * Randează corpul din șablon. Un act fără șablon păstrează corpul primit (import/derivare).
 * Întoarce și câmpurile cerute de șablon, ca apelantul să poată spune ce anume lipsește.
 */
async function renderBody(
  tenantId: string,
  templateId: string | null | undefined,
  context: Record<string, string>,
  lines: TableLine[] = [],
  currency = "MDL"
): Promise<{ bodyHtml: string; templateVersion: number; placeholders: string[] }> {
  if (!templateId) return { bodyHtml: "", templateVersion: 1, placeholders: [] };
  const [tpl] = await db
    .select()
    .from(docmergeTemplates)
    .where(and(eq(docmergeTemplates.id, templateId), eq(docmergeTemplates.tenantId, tenantId)));
  if (!tpl) return { bodyHtml: "", templateVersion: 1, placeholders: [] };
  // Tabelul se inserează DUPĂ randare: `renderWithContext` escapează valorile (corect), deci un
  // tabel trimis ca valoare ar ajunge pe hârtie ca text cu &lt;table&gt;.
  const rendered = insertLinesTable(renderWithContext(tpl.bodyHtml, context), lines, currency);
  return {
    bodyHtml: rendered,
    templateVersion: tpl.version ?? 1,
    // `tabel.pozitii` nu e un câmp de completat, ci un bloc — nu are ce căuta în lista de lipsuri.
    placeholders: extractPlaceholders(tpl.bodyHtml).filter((p) => p !== "tabel.pozitii"),
  };
}

/**
 * Contextul final al unui act: ce citește serverul din registre BATE ce trimite clientul pentru
 * rechizite, sume și date de organizație — acolo clientul nu e sursă de adevăr. Câmpurile libere
 * (text scris de om în formular) rămân cum au venit.
 */
async function buildDocumentContext(args: {
  tenantId: string;
  vendorId?: string | null;
  projectId?: string | null;
  eventId?: string | null;
  payerId?: string | null;
  docNumber?: string | null;
  docDate?: Date | null;
  totalCents?: number | null;
  currency?: string | null;
  userName?: string | null;
  clientContext?: Record<string, string>;
}): Promise<Record<string, string>> {
  const resolved = await resolveDocumentContext({
    tenantId: args.tenantId,
    vendorId: args.vendorId,
    projectId: args.projectId,
    eventId: args.eventId,
    payerId: args.payerId,
    docNumber: args.docNumber,
    docDate: args.docDate,
    totalCents: args.totalCents,
    currency: args.currency,
    userName: args.userName,
    basedOn: args.clientContext?.["document.baza"],
    docPlace: args.clientContext?.["document.loc"],
  });
  return { ...(args.clientContext ?? {}), ...resolved };
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

  const allowedProjects = await visibilityFilter(user as { id: string; tenantId: string; role?: string });

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

  return c.json(rows.filter((r) => maySeeDocument(r.projectId, allowedProjects)));
});

// ─── Creare ───────────────────────────────────────────────────────────────────

docsRoutes.post("/documents", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const { rows, totalCents } = computeLineTotals(body.lines ?? []);
  const vendorId = body.counterparty?.kind === "vendor" ? body.counterparty?.id ?? null : null;

  const context = await buildDocumentContext({
    tenantId: user.tenantId,
    vendorId,
    projectId: body.projectId,
    eventId: body.eventId,
    payerId: body.payerId,
    docDate: body.docDate ? new Date(body.docDate) : new Date(),
    totalCents,
    currency: body.currency ?? "MDL",
    userName: (user as { name?: string }).name ?? null,
    clientContext: body.context,
  });
  const { bodyHtml, templateVersion, placeholders } = await renderBody(
    user.tenantId,
    body.templateId,
    context,
    rows.map((r) => ({ ...r })),
    body.currency ?? "MDL"
  );

  // Rechizitele se îngheață din REGISTRU, nu din ce a trimis clientul: dacă furnizorul își schimbă
  // mâine IBAN-ul, actul de azi rămâne cu cel semnat azi.
  const snapshot: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) {
    if (k.startsWith("contraparte.")) snapshot[k.replace("contraparte.", "")] = v;
  }

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
      counterpartyName: context["contraparte.denumire"] ?? body.counterparty?.name ?? null,
      counterpartySnapshot: JSON.stringify(
        Object.keys(snapshot).length > 0 ? snapshot : body.counterparty?.snapshot ?? {}
      ),
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

  // Numărul actului se rezervă abia la finalizare, deci lipsa lui acum e normală — nu o raportăm.
  const missing = missingFields(placeholders, context).filter((f) => f !== "document.numar");
  return c.json({ ...doc, lines: rows, missing }, 201);
});

// ─── Un act, cu tot ce ține de el ─────────────────────────────────────────────

docsRoutes.get("/documents/:id", async (c) => {
  const user = c.get("user");
  const [doc] = await db
    .select()
    .from(docDocuments)
    .where(and(eq(docDocuments.id, c.req.param("id")), eq(docDocuments.tenantId, user.tenantId)));
  if (!doc) return c.json({ error: "not_found" }, 404);
  // 404, nu 403: cine n-are acces la proiect nu trebuie să afle nici măcar că actul există.
  if (!maySeeDocument(doc.projectId, await visibilityFilter(user as { id: string; tenantId: string; role?: string }))) {
    return c.json({ error: "not_found" }, 404);
  }

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

  // DG-114: sigiliul se VERIFICĂ la fiecare citire, nu doar se afișează. Dacă cineva a umblat
  // direct în bază peste un act finalizat, se vede aici — altfel „imutabil" ar fi doar o vorbă.
  const integrity =
    doc.status === "final" && doc.bodyHash
      ? {
          sealed: true,
          valid:
            computeBodyHash({
              bodyHtml: doc.bodyHtml,
              counterpartyName: doc.counterpartyName,
              counterpartySnapshot: doc.counterpartySnapshot,
              lines,
              totalCents: doc.totalCents,
              currency: doc.currency,
            }) === doc.bodyHash,
          hash: doc.bodyHash,
        }
      : { sealed: false, valid: true, hash: null };

  return c.json({
    ...doc,
    context: safeJson(doc.context),
    counterpartySnapshot: safeJson(doc.counterpartySnapshot),
    lines,
    links,
    integrity,
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

  let totalCents = doc.totalCents;
  let lines: ReturnType<typeof computeLineTotals>["rows"] | null = null;
  const existingLines = await db
    .select()
    .from(docDocumentLines)
    .where(eq(docDocumentLines.documentId, doc.id))
    .orderBy(docDocumentLines.position);
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

  const nextVendorId =
    body.counterparty === undefined
      ? doc.counterpartyId
      : body.counterparty.kind === "vendor"
        ? body.counterparty.id ?? null
        : null;
  const context = await buildDocumentContext({
    tenantId: user.tenantId,
    vendorId: nextVendorId,
    projectId: body.projectId === undefined ? doc.projectId : body.projectId,
    eventId: body.eventId === undefined ? doc.eventId : body.eventId,
    payerId: body.payerId === undefined ? doc.payerId : body.payerId,
    docDate: body.docDate ? new Date(body.docDate) : doc.docDate,
    totalCents,
    currency: body.currency ?? doc.currency,
    userName: (user as { name?: string }).name ?? null,
    clientContext: { ...(safeJson(doc.context) as Record<string, string>), ...(body.context ?? {}) },
  });
  const rendered = await renderBody(
    user.tenantId,
    doc.templateId,
    context,
    lines ?? existingLines,
    body.currency ?? doc.currency
  );
  const snapshot: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) {
    if (k.startsWith("contraparte.")) snapshot[k.replace("contraparte.", "")] = v;
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
        context["contraparte.denumire"] ??
        (body.counterparty === undefined ? doc.counterpartyName : body.counterparty.name ?? null),
      counterpartySnapshot: JSON.stringify(
        Object.keys(snapshot).length > 0
          ? snapshot
          : (safeJson(doc.counterpartySnapshot) as Record<string, string>)
      ),
      context: JSON.stringify(context),
      bodyHtml: rendered.bodyHtml || doc.bodyHtml,
      totalCents,
      currency: body.currency ?? doc.currency,
      updatedAt: new Date(),
    })
    .where(eq(docDocuments.id, doc.id))
    .returning();

  await writeAudit(user.tenantId, doc.id, user.id, "updated", {});
  // Aceeași listă de lipsuri ca la creare: formularul o arată în timp ce completezi, nu abia la
  // finalizare, când omul crede că a terminat.
  const missing = missingFields(rendered.placeholders, context).filter((f) => f !== "document.numar");
  return c.json({ ...updated, lines, missing });
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

  // DG-111: rechizitele contrapărții pe care ȘABLONUL le cere trebuie să existe. Un act de plată
  // semnat cu rândul de IBAN gol e mai rău decât un act neemis: ajunge la bancă și se întoarce.
  // Restul câmpurilor fără sursă (semnătura administratorului nostru, de pildă) se completează cu
  // pixul, deci nu blochează.
  const preflightContext = await buildDocumentContext({
    tenantId: user.tenantId,
    vendorId: doc.counterpartyKind === "vendor" ? doc.counterpartyId : null,
    projectId: doc.projectId,
    eventId: doc.eventId,
    payerId: doc.payerId,
    docNumber: "—",
    docDate: doc.docDate,
    totalCents,
    currency: doc.currency,
    userName: (user as { name?: string }).name ?? null,
    clientContext: safeJson(doc.context) as Record<string, string>,
  });
  const templatePlaceholders = doc.templateId
    ? (await renderBody(user.tenantId, doc.templateId, preflightContext)).placeholders
    : [];
  // Blocăm DOAR pe datele care trimit banii undeva: denumirea, codul fiscal, IBAN-ul. Adresa
  // juridică sau numele administratorului lipsă se completează cu pixul pe act — dacă am bloca și
  // pe ele, jumătate din actele reale n-ar putea fi semnate, iar oamenii ar ocoli poarta.
  const PAYMENT_CRITICAL = ["contraparte.denumire", "contraparte.idno", "contraparte.iban"];
  for (const field of missingFields(templatePlaceholders, preflightContext)) {
    if (PAYMENT_CRITICAL.includes(field)) missing.push(fieldLabelRo(field));
  }

  // Valorile care EXISTĂ trebuie și să fie corecte: un IBAN cu cifră de control greșită prins aici
  // costă 30 de secunde; prins după plată, costă un transfer returnat.
  const iban = preflightContext["contraparte.iban"];
  if (iban) {
    const check = validateIban(iban);
    if (!check.ok) missing.push(`IBAN contraparte: ${check.message ?? "invalid"}`);
  }
  const fiscal = preflightContext["contraparte.idno"];
  if (fiscal) {
    const check = validateFiscalId(fiscal);
    if (!check.ok) missing.push(`Cod fiscal contraparte: ${check.message ?? "invalid"}`);
  }

  if (missing.length > 0) return c.json({ error: "incomplete", missing }, 400);

  const year = doc.docDate.getFullYear();
  const docNumber = await reserveNumber(user.tenantId, doc.kind, year);

  // Numărul există abia acum, deci corpul se re-randează cu el — altfel actul semnat ar purta
  // „{{document.numar}}" exact pe rândul cel mai important. Restul contextului se recitește din
  // registre, ca sigiliul să acopere datele reale, nu unele vechi de o săptămână.
  const finalContext = await buildDocumentContext({
    tenantId: user.tenantId,
    vendorId: doc.counterpartyKind === "vendor" ? doc.counterpartyId : null,
    projectId: doc.projectId,
    eventId: doc.eventId,
    payerId: doc.payerId,
    docNumber,
    docDate: doc.docDate,
    totalCents,
    currency: doc.currency,
    userName: (user as { name?: string }).name ?? null,
    clientContext: safeJson(doc.context) as Record<string, string>,
  });
  const rendered = await renderBody(user.tenantId, doc.templateId, finalContext, lines, doc.currency);
  const finalBody = blankUnresolved(rendered.bodyHtml || doc.bodyHtml);

  const bodyHash = computeBodyHash({
    bodyHtml: finalBody,
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
      bodyHtml: finalBody,
      context: JSON.stringify(finalContext),
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
    .select({
      id: docmergeTemplates.id,
      name: docmergeTemplates.name,
      bodyHtml: docmergeTemplates.bodyHtml,
      version: docmergeTemplates.version,
    })
    .from(docmergeTemplates)
    .where(and(eq(docmergeTemplates.tenantId, tenantId), eq(docmergeTemplates.isSystem, true)));
  const byName = new Map(existing.map((r) => [r.name, r]));

  const missing = SYSTEM_TEMPLATES.filter((t) => !byName.has(t.name));
  if (missing.length > 0) {
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

  // Șabloanele standard se ÎMPROSPĂTEAZĂ când produsul livrează o versiune mai bună. Fără asta,
  // o organizație instalată acum o lună rămâne pe veci cu textul vechi — de pildă cu fraza
  // „[tabelul pozițiilor se completează din act]" în loc de tabelul real. E sigur: nimeni nu le
  // poate edita (403), deci nu suprascriem munca nimănui; copiile clonate nu sunt atinse.
  for (const shipped of SYSTEM_TEMPLATES) {
    const row = byName.get(shipped.name);
    if (!row || row.bodyHtml === shipped.bodyHtml) continue;
    await db
      .update(docmergeTemplates)
      .set({
        bodyHtml: shipped.bodyHtml,
        placeholders: JSON.stringify(extractPlaceholders(shipped.bodyHtml)),
        kind: shipped.kind,
        category: shipped.category,
        version: (row.version ?? 1) + 1,
        updatedAt: new Date(),
      })
      .where(eq(docmergeTemplates.id, row.id));
  }
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


// ─── PDF-ul actului (DG-112) ─────────────────────────────────────────────────

/**
 * PDF-ul se STOCHEAZĂ la prima generare și se servește de acolo mai departe.
 *
 * De ce nu se re-randează la fiecare descărcare: șablonul poate evolua, iar actul descărcat peste
 * un an trebuie să arate exact ca cel semnat. Un PDF regenerat „la cerere" e o promisiune pe care
 * n-o poți ține.
 */
docsRoutes.get("/documents/:id/pdf", async (c) => {
  const user = c.get("user");
  const [doc] = await db
    .select()
    .from(docDocuments)
    .where(and(eq(docDocuments.id, c.req.param("id")), eq(docDocuments.tenantId, user.tenantId)));
  if (!doc) return c.json({ error: "not_found" }, 404);
  if (!maySeeDocument(doc.projectId, await visibilityFilter(user as { id: string; tenantId: string; role?: string }))) {
    return c.json({ error: "not_found" }, 404);
  }

  const [settings] = await db
    .select()
    .from(parSettings)
    .where(eq(parSettings.tenantId, user.tenantId))
    .limit(1);
  const org = { name: settings?.orgLegalName ?? null, logoUrl: settings?.orgLogoUrl ?? null };
  const printLines = await db
    .select()
    .from(docDocumentLines)
    .where(eq(docDocumentLines.documentId, doc.id))
    .orderBy(docDocumentLines.position);
  const printable = {
    docNumber: doc.docNumber,
    title: doc.title,
    kind: doc.kind,
    docDate: doc.docDate,
    bodyHtml: doc.bodyHtml,
    bodyHash: doc.bodyHash,
    status: doc.status,
    counterpartyName: doc.counterpartyName,
    counterpartySnapshot: safeJson(doc.counterpartySnapshot) as Record<string, string>,
    currency: doc.currency,
    totalCents: doc.totalCents,
    lines: printLines.map((l) => ({
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      lineTotalCents: l.lineTotalCents,
    })),
  };
  const fileName = pdfFileName(printable, doc.counterpartyName);

  // Ciorna se poate tipări oricând, dar nu se stochează: se schimbă la fiecare salvare.
  const canReuse = doc.status !== "draft" && !!doc.pdfUrl;
  if (canReuse) {
    const bytes = Buffer.from((doc.pdfUrl ?? "").split(",")[1] ?? "", "base64");
    await writeAudit(user.tenantId, doc.id, user.id, "downloaded", { cached: true });
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  }

  const { pdf, html } = await renderDocumentPdf(printable, org);
  if (!pdf) {
    // Chromium lipsă (serverless) — servim HTML-ul tipăribil, nu o eroare: omul poate tipări din
    // browser cu Ctrl+P și obține același document.
    return new Response(buildPrintableHtml(printable, org) || html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "X-Pdf-Fallback": "html" },
    });
  }

  if (doc.status !== "draft") {
    const dataUrl = `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`;
    await db
      .update(docDocuments)
      .set({ pdfUrl: dataUrl, updatedAt: new Date() })
      .where(eq(docDocuments.id, doc.id));
  }
  await writeAudit(user.tenantId, doc.id, user.id, "downloaded", { cached: false });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
});


// ─── „Transformă în PAR" (DG-117) ────────────────────────────────────────────

/**
 * Actul semnat devine cerere de plată, dintr-un click.
 *
 * Asta e legătura pentru care a fost construit tot modulul: aceleași date (beneficiar, rechizite,
 * proiect, poziții, sumă) se introduceau a treia oară în formularul PAR, iar finanțele cereau
 * separat documentele. Acum PAR-ul se naște precompletat, cu PDF-ul actului deja atașat.
 *
 * Reguli:
 *  - doar din acte FINALIZATE (o ciornă nu e temei de plată);
 *  - al doilea PAR din același act cere confirmare explicită (`?force=1`), altfel se plătește de
 *    două ori același document;
 *  - dacă utilizatorul n-are acces la proiectul actului, 403 — nu creăm o cerere pe un proiect
 *    la care nu lucrează.
 */
docsRoutes.post("/documents/:id/to-par", async (c) => {
  const user = c.get("user");
  const [doc] = await db
    .select()
    .from(docDocuments)
    .where(and(eq(docDocuments.id, c.req.param("id")), eq(docDocuments.tenantId, user.tenantId)));
  if (!doc) return c.json({ error: "not_found" }, 404);

  if (doc.status !== "final") {
    return c.json(
      {
        error: "document_not_final",
        message: "Doar un act finalizat poate deveni cerere de plată. Finalizează-l întâi.",
      },
      409
    );
  }

  if (!(await mayAccessProject(user.id, user.tenantId, doc.projectId, (user as { role?: string }).role))) {
    return c.json({ error: "forbidden_project" }, 403);
  }

  const force = c.req.query("force") === "1" || c.req.query("force") === "true";
  const [existingLink] = await db
    .select({ id: docDocumentLinks.id, parId: docDocumentLinks.toParId })
    .from(docDocumentLinks)
    .where(and(eq(docDocumentLinks.fromDocumentId, doc.id), eq(docDocumentLinks.toKind, "par")));
  if (existingLink && !force) {
    return c.json(
      {
        error: "already_converted",
        parId: existingLink.parId,
        message: "Actul are deja o cerere de plată. Confirmă dacă vrei încă una.",
      },
      409
    );
  }

  const lines = await db
    .select()
    .from(docDocumentLines)
    .where(eq(docDocumentLines.documentId, doc.id))
    .orderBy(docDocumentLines.position);

  // Plătitorul: cel al proiectului, altfel primul activ — aceeași regulă ca la crearea unui PAR.
  const [project] = doc.projectId
    ? await db
        .select({ payerId: parProjects.payerId })
        .from(parProjects)
        .where(and(eq(parProjects.id, doc.projectId), eq(parProjects.tenantId, user.tenantId)))
    : [];
  const [defaultPayer] = project?.payerId
    ? []
    : await db
        .select({ id: parPayers.id })
        .from(parPayers)
        .where(and(eq(parPayers.tenantId, user.tenantId), eq(parPayers.active, true)))
        .limit(1);
  const payerId = doc.payerId ?? project?.payerId ?? defaultPayer?.id ?? null;

  const snapshot = safeJson(doc.counterpartySnapshot) as Record<string, string>;
  const requestNo = await generateRequestNo(user.tenantId);
  const totalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0) || doc.totalCents;

  const [par] = await db
    .insert(parRequests)
    .values({
      tenantId: user.tenantId,
      requestNo,
      dateOfRequest: new Date(),
      requestedByUserId: user.id,
      payerId,
      projectId: doc.projectId,
      eventId: doc.eventId,
      purpose: "execute_payment",
      chargeTo: "program",
      // Scopul cererii spune din ce act vine — finanțele nu trebuie să ghicească.
      endUse: `${doc.title}${doc.docNumber ? ` (${doc.docNumber})` : ""}`,
      vendorId: doc.counterpartyKind === "vendor" ? doc.counterpartyId : null,
      payeeName: doc.counterpartyName,
      payeeIdnp: snapshot.idno ?? null,
      payeeIban: snapshot.iban ?? null,
      payeeBank: snapshot.banca ?? null,
      currency: doc.currency,
      totalEstimatedCents: totalCents,
      attachmentsPresent: true,
      attachmentsNote: doc.docNumber ? `Act ${doc.docNumber}` : doc.title,
      status: "draft",
    })
    .returning();

  if (lines.length > 0) {
    await db.insert(parLineItems).values(
      lines.map((l, i) => ({
        tenantId: user.tenantId,
        parId: par.id,
        position: i + 1,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.lineTotalCents,
      }))
    );
  }

  // PDF-ul actului merge cu cererea: altfel finanțele îl cer pe email, ca până acum.
  if (doc.pdfUrl) {
    await db.insert(parAttachments).values({
      tenantId: user.tenantId,
      parId: par.id,
      fileUrl: doc.pdfUrl,
      fileName: pdfFileName(
        {
          docNumber: doc.docNumber,
          title: doc.title,
          kind: doc.kind,
          docDate: doc.docDate,
          bodyHtml: doc.bodyHtml,
          bodyHash: doc.bodyHash,
          status: doc.status,
        },
        doc.counterpartyName
      ),
      kind: "contract",
      uploadedBy: user.id,
    });
  }

  await db.insert(docDocumentLinks).values({
    tenantId: user.tenantId,
    fromDocumentId: doc.id,
    toKind: "par",
    toParId: par.id,
    relation: "payment_request",
    createdByUserId: user.id,
  });
  await writeAudit(user.tenantId, doc.id, user.id, "converted_to_par", { requestNo });

  return c.json({ parId: par.id, requestNo, attachmentAdded: !!doc.pdfUrl }, 201);
});


// ─── Acte derivate + traseul actului (DG-116, DG-119) ────────────────────────

/**
 * Ce se poate naște din ce. Regulile nu sunt decorative: un „act adițional" la un act de
 * primire-predare n-are sens juridic, iar dacă îl oferi în listă, cineva îl va face.
 */
const DERIVABLE: Record<string, string[]> = {
  contract_servicii: ["act_primire_predare", "act_aditional", "proces_verbal", "act_compensare"],
  contract_vanzare: ["act_primire_predare", "act_aditional", "proces_verbal"],
  act_primire_predare: ["proces_verbal", "act_compensare"],
  proces_verbal: ["act_primire_predare"],
  act_aditional: ["act_primire_predare", "proces_verbal"],
  other: ["act_primire_predare", "contract_servicii"],
};

docsRoutes.get("/documents/:id/derivable", async (c) => {
  const user = c.get("user");
  const [doc] = await db
    .select({ kind: docDocuments.kind, status: docDocuments.status })
    .from(docDocuments)
    .where(and(eq(docDocuments.id, c.req.param("id")), eq(docDocuments.tenantId, user.tenantId)));
  if (!doc) return c.json({ error: "not_found" }, 404);
  return c.json({ kinds: DERIVABLE[doc.kind] ?? DERIVABLE.other });
});

/**
 * „Act nou pe baza acestuia": actul derivat moștenește părțile, proiectul, pozițiile și valuta, iar
 * referința legală („în baza contractului nr. X din data Y") se scrie singură — exact partea pe
 * care omul o copiază greșit când o tastează.
 */
docsRoutes.post("/documents/:id/derive", async (c) => {
  const user = c.get("user");
  const [source] = await db
    .select()
    .from(docDocuments)
    .where(and(eq(docDocuments.id, c.req.param("id")), eq(docDocuments.tenantId, user.tenantId)));
  if (!source) return c.json({ error: "not_found" }, 404);
  if (source.status !== "final") {
    return c.json(
      { error: "source_not_final", message: "Actul-sursă trebuie finalizat înainte de a naște altul." },
      409
    );
  }

  let kind = "act_primire_predare";
  let title: string | null = null;
  let templateId: string | null = null;
  try {
    const body = (await c.req.json()) as { kind?: string; title?: string; templateId?: string };
    kind = body?.kind ?? kind;
    title = body?.title ?? null;
    templateId = body?.templateId ?? null;
  } catch {
    /* corp gol — folosim implicitele */
  }

  const allowed = DERIVABLE[source.kind] ?? DERIVABLE.other;
  if (!allowed.includes(kind)) {
    return c.json({ error: "kind_not_derivable", allowed }, 400);
  }

  const lines = await db
    .select()
    .from(docDocumentLines)
    .where(eq(docDocumentLines.documentId, source.id))
    .orderBy(docDocumentLines.position);

  const sourceLabel = source.docNumber
    ? `${DOC_KIND_LABEL[source.kind] ?? "actul"} nr. ${source.docNumber} din ${source.docDate.toLocaleDateString("ro-MD")}`
    : source.title;

  const clientContext = {
    ...(safeJson(source.context) as Record<string, string>),
    "document.baza": sourceLabel,
  };
  const context = await buildDocumentContext({
    tenantId: user.tenantId,
    vendorId: source.counterpartyKind === "vendor" ? source.counterpartyId : null,
    projectId: source.projectId,
    eventId: source.eventId,
    payerId: source.payerId,
    docDate: new Date(),
    totalCents: source.totalCents,
    currency: source.currency,
    userName: (user as { name?: string }).name ?? null,
    clientContext,
  });

  const chosenTemplateId = templateId ?? (await pickTemplateForKind(user.tenantId, kind));
  const rendered = await renderBody(
    user.tenantId,
    chosenTemplateId,
    context,
    lines,
    source.currency
  );

  const [derived] = await db
    .insert(docDocuments)
    .values({
      tenantId: user.tenantId,
      templateId: chosenTemplateId,
      templateVersion: rendered.templateVersion,
      kind,
      title: title ?? `${DOC_KIND_LABEL[kind] ?? "Act"} — ${source.counterpartyName ?? source.title}`,
      projectId: source.projectId,
      eventId: source.eventId,
      payerId: source.payerId,
      counterpartyKind: source.counterpartyKind,
      counterpartyId: source.counterpartyId,
      counterpartyName: source.counterpartyName,
      counterpartySnapshot: source.counterpartySnapshot,
      context: JSON.stringify(context),
      bodyHtml: rendered.bodyHtml,
      totalCents: source.totalCents,
      currency: source.currency,
      createdByUserId: user.id,
    })
    .returning();

  if (lines.length > 0) {
    await db.insert(docDocumentLines).values(
      lines.map((l, i) => ({
        tenantId: user.tenantId,
        documentId: derived.id,
        position: i + 1,
        description: l.description,
        unit: l.unit,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.lineTotalCents,
        vatPercent: l.vatPercent,
      }))
    );
  }

  // Legătura se scrie o dată, dar se citește din ambele capete (vezi /trail).
  await db.insert(docDocumentLinks).values({
    tenantId: user.tenantId,
    fromDocumentId: source.id,
    toKind: "document",
    toDocumentId: derived.id,
    relation: "derived_from",
    createdByUserId: user.id,
  });
  await writeAudit(user.tenantId, source.id, user.id, "derived", { kind, derivedId: derived.id });
  await writeAudit(user.tenantId, derived.id, user.id, "created", { from: source.docNumber });

  return c.json({ ...derived, basedOn: sourceLabel }, 201);
});

/** Etichetele tipurilor, pentru texte generate pe server („în baza contractului nr…"). */
const DOC_KIND_LABEL: Record<string, string> = {
  act_primire_predare: "actul de primire-predare",
  contract_servicii: "contractul de prestări servicii",
  contract_vanzare: "contractul de vânzare-cumpărare",
  act_aditional: "actul adițional",
  proces_verbal: "procesul-verbal",
  act_compensare: "actul de compensare",
  other: "documentul",
};

/** Șablonul implicit pentru un tip de act: primul al organizației, altfel cel standard. */
async function pickTemplateForKind(tenantId: string, kind: string): Promise<string | null> {
  const rows = await db
    .select({ id: docmergeTemplates.id, isSystem: docmergeTemplates.isSystem })
    .from(docmergeTemplates)
    .where(and(eq(docmergeTemplates.tenantId, tenantId), eq(docmergeTemplates.kind, kind)))
    .orderBy(desc(docmergeTemplates.updatedAt));
  return rows.find((r) => !r.isSystem)?.id ?? rows[0]?.id ?? null;
}

/**
 * DG-119 — traseul actului: contract → act → cerere de plată → plată.
 *
 * Răspunde la întrebarea „unde s-a oprit lucrul?", care azi se pune pe chat, de trei ori pe zi.
 * Verigile se citesc în ambele sensuri: și din actul-sursă, și din cel derivat.
 */
docsRoutes.get("/documents/:id/trail", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [doc] = await db
    .select()
    .from(docDocuments)
    .where(and(eq(docDocuments.id, id), eq(docDocuments.tenantId, user.tenantId)));
  if (!doc) return c.json({ error: "not_found" }, 404);

  const outgoing = await db
    .select()
    .from(docDocumentLinks)
    .where(and(eq(docDocumentLinks.tenantId, user.tenantId), eq(docDocumentLinks.fromDocumentId, id)));
  const incoming = await db
    .select()
    .from(docDocumentLinks)
    .where(and(eq(docDocumentLinks.tenantId, user.tenantId), eq(docDocumentLinks.toDocumentId, id)));

  const docIds = [
    ...outgoing.filter((l) => l.toDocumentId).map((l) => l.toDocumentId as string),
    ...incoming.map((l) => l.fromDocumentId),
  ];
  const relatedDocs = docIds.length
    ? await db
        .select({
          id: docDocuments.id,
          kind: docDocuments.kind,
          docNumber: docDocuments.docNumber,
          title: docDocuments.title,
          status: docDocuments.status,
          docDate: docDocuments.docDate,
          totalCents: docDocuments.totalCents,
          currency: docDocuments.currency,
        })
        .from(docDocuments)
        .where(and(eq(docDocuments.tenantId, user.tenantId), inArray(docDocuments.id, docIds)))
    : [];

  const parIds = outgoing.filter((l) => l.toParId).map((l) => l.toParId as string);
  const relatedPars = parIds.length
    ? await db
        .select({
          id: parRequests.id,
          requestNo: parRequests.requestNo,
          status: parRequests.status,
          totalEstimatedCents: parRequests.totalEstimatedCents,
          currency: parRequests.currency,
          paidAt: parRequests.paidAt,
          approvedAt: parRequests.approvedAt,
        })
        .from(parRequests)
        .where(and(eq(parRequests.tenantId, user.tenantId), inArray(parRequests.id, parIds)))
    : [];

  return c.json({
    document: {
      id: doc.id,
      kind: doc.kind,
      docNumber: doc.docNumber,
      title: doc.title,
      status: doc.status,
      totalCents: doc.totalCents,
      currency: doc.currency,
    },
    basedOn: incoming.map((l) => relatedDocs.find((d) => d.id === l.fromDocumentId)).filter(Boolean),
    derived: outgoing
      .filter((l) => l.toKind === "document")
      .map((l) => relatedDocs.find((d) => d.id === l.toDocumentId))
      .filter(Boolean),
    paymentRequests: relatedPars,
  });
});


// ─── Dosare și registru (DG-120, DG-121, DG-122) ─────────────────────────────

docsRoutes.get("/dossier/project/:projectId", async (c) => {
  const user = c.get("user");
  if (!(await mayAccessProject(user.id, user.tenantId, c.req.param("projectId"), (user as { role?: string }).role))) {
    return c.json({ error: "forbidden_project" }, 403);
  }
  return c.json(await buildProjectDossier(user.tenantId, c.req.param("projectId")));
});

docsRoutes.get("/dossier/counterparty/:id", async (c) => {
  const user = c.get("user");
  return c.json(await buildCounterpartyDossier(user.tenantId, c.req.param("id")));
});

/**
 * Registrul actelor, ca fișier: aceleași filtre ca pe ecran.
 *
 * Sumele pleacă NUMERIC, nu ca text — un registru în care „24.500,00" e text nu se poate suma în
 * Excel, iar auditorul exact asta face prima dată.
 */
docsRoutes.get("/export/register.xlsx", async (c) => {
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
    .select()
    .from(docDocuments)
    .where(and(...filters))
    .orderBy(desc(docDocuments.docDate));

  const links = rows.length
    ? await db
        .select()
        .from(docDocumentLinks)
        .where(
          and(
            eq(docDocumentLinks.tenantId, user.tenantId),
            eq(docDocumentLinks.toKind, "par"),
            inArray(
              docDocumentLinks.fromDocumentId,
              rows.map((r) => r.id)
            )
          )
        )
    : [];
  const parIds = links.map((l) => l.toParId).filter((x): x is string => !!x);
  const pars = parIds.length
    ? await db
        .select({ id: parRequests.id, requestNo: parRequests.requestNo })
        .from(parRequests)
        .where(and(eq(parRequests.tenantId, user.tenantId), inArray(parRequests.id, parIds)))
    : [];

  // exceljs se încarcă leneș: importul static a rupt cândva TOATE rutele pe serverless.
  const ExcelJSModule = (await import("exceljs")) as unknown as {
    default: typeof import("exceljs");
  };
  const ExcelJS = ExcelJSModule.default ?? (ExcelJSModule as unknown as typeof import("exceljs"));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Registrul actelor");
  ws.columns = [
    { header: "Nr. act", key: "no", width: 18 },
    { header: "Data", key: "date", width: 12 },
    { header: "Tip", key: "kind", width: 26 },
    { header: "Titlu", key: "title", width: 40 },
    { header: "Contraparte", key: "party", width: 28 },
    { header: "Cod fiscal", key: "idno", width: 16 },
    { header: "Sumă", key: "total", width: 14 },
    { header: "Valuta", key: "currency", width: 8 },
    { header: "Stare", key: "status", width: 12 },
    { header: "Cerere de plată", key: "par", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };

  const STATUS_RO: Record<string, string> = { draft: "Ciornă", final: "Finalizat", cancelled: "Anulat" };
  for (const r of rows) {
    let snapshot: Record<string, string> = {};
    try {
      snapshot = JSON.parse(r.counterpartySnapshot ?? "{}") as Record<string, string>;
    } catch {
      snapshot = {};
    }
    const parLink = links.find((l) => l.fromDocumentId === r.id);
    ws.addRow({
      no: r.docNumber ?? "—",
      date: r.docDate.toLocaleDateString("ro-MD"),
      kind: DOC_KIND_LABEL[r.kind] ?? r.kind,
      title: r.title,
      party: r.counterpartyName ?? "—",
      idno: snapshot.idno ?? "",
      total: r.totalCents / 100,
      currency: r.currency,
      status: STATUS_RO[r.status] ?? r.status,
      par: pars.find((p) => p.id === parLink?.toParId)?.requestNo ?? "",
    });
  }
  ws.getColumn("total").numFmt = "#,##0.00";

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="registrul-actelor.xlsx"`,
    },
  });
});


// ─── Din cerere de plată → act (DG-118) ──────────────────────────────────────

/**
 * Închide bucla „am plătit, unde e actul semnat?".
 *
 * Actul se compune din ce s-a PRIMIT efectiv, nu din ce s-a comandat: dacă există recepție, luăm
 * cantitățile recepționate. Altfel actul ar declara predarea a 5 bucăți când au sosit 3, iar
 * semnătura ar acoperi o minciună.
 */
docsRoutes.post("/from-par/:parId", async (c) => {
  const user = c.get("user");
  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, c.req.param("parId")), eq(parRequests.tenantId, user.tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);
  if (!(await mayAccessProject(user.id, user.tenantId, par.projectId, (user as { role?: string }).role))) {
    return c.json({ error: "forbidden_project" }, 403);
  }

  let kind = "act_primire_predare";
  try {
    const body = (await c.req.json()) as { kind?: string };
    kind = body?.kind ?? kind;
  } catch {
    /* fără corp — actul implicit */
  }

  const parLines = await db
    .select()
    .from(parLineItems)
    .where(eq(parLineItems.parId, par.id))
    .orderBy(parLineItems.position);

  // Recepțiile: dacă există, ele spun ce a sosit cu adevărat.
  const receipts = await db
    .select({ id: parReceipts.id })
    .from(parReceipts)
    .where(and(eq(parReceipts.parId, par.id), eq(parReceipts.tenantId, user.tenantId)));
  const receivedByLine = new Map<string, number>();
  if (receipts.length > 0) {
    const rLines = await db
      .select()
      .from(parReceiptLines)
      .where(
        and(
          eq(parReceiptLines.tenantId, user.tenantId),
          inArray(
            parReceiptLines.receiptId,
            receipts.map((r) => r.id)
          )
        )
      );
    for (const rl of rLines) {
      receivedByLine.set(rl.lineItemId, (receivedByLine.get(rl.lineItemId) ?? 0) + rl.qtyReceived);
    }
  }

  const lines = parLines
    .map((l) => {
      const qty = receivedByLine.size > 0 ? receivedByLine.get(l.id) ?? 0 : l.quantity;
      return {
        position: 0,
        description: l.description,
        unit: l.unit ?? "buc",
        quantity: qty,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: qty * l.unitPriceCents,
        vatPercent: 0,
      };
    })
    .filter((l) => l.quantity > 0)
    .map((l, i) => ({ ...l, position: i + 1 }));

  const totalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const basedOn = `cererea de plată nr. ${par.requestNo}`;
  const context = await buildDocumentContext({
    tenantId: user.tenantId,
    vendorId: par.vendorId,
    projectId: par.projectId,
    eventId: par.eventId,
    payerId: par.payerId,
    docDate: new Date(),
    totalCents,
    currency: par.currency,
    userName: (user as { name?: string }).name ?? null,
    clientContext: { "document.baza": basedOn },
  });
  // Beneficiarul poate fi scris direct pe cerere (fără fișă în registru) — atunci îl luăm de acolo.
  if (!context["contraparte.denumire"] && par.payeeName) context["contraparte.denumire"] = par.payeeName;
  if (!context["contraparte.idno"] && par.payeeIdnp) context["contraparte.idno"] = par.payeeIdnp;
  if (!context["contraparte.iban"] && par.payeeIban) context["contraparte.iban"] = par.payeeIban;
  if (!context["contraparte.banca"] && par.payeeBank) context["contraparte.banca"] = par.payeeBank;

  const templateId = await pickTemplateForKind(user.tenantId, kind);
  const rendered = await renderBody(user.tenantId, templateId, context, lines, par.currency);

  const snapshot: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) {
    if (k.startsWith("contraparte.")) snapshot[k.replace("contraparte.", "")] = v;
  }

  const [doc] = await db
    .insert(docDocuments)
    .values({
      tenantId: user.tenantId,
      templateId,
      templateVersion: rendered.templateVersion,
      kind,
      title: `${DOC_KIND_LABEL[kind] ?? "Act"} — ${par.payeeName ?? context["contraparte.denumire"] ?? par.requestNo}`,
      projectId: par.projectId,
      eventId: par.eventId,
      payerId: par.payerId,
      counterpartyKind: par.vendorId ? "vendor" : "inline",
      counterpartyId: par.vendorId,
      counterpartyName: context["contraparte.denumire"] ?? par.payeeName ?? null,
      counterpartySnapshot: JSON.stringify(snapshot),
      context: JSON.stringify(context),
      bodyHtml: rendered.bodyHtml,
      totalCents,
      currency: par.currency,
      createdByUserId: user.id,
    })
    .returning();

  if (lines.length > 0) {
    await db.insert(docDocumentLines).values(
      lines.map((l) => ({ ...l, tenantId: user.tenantId, documentId: doc.id }))
    );
  }

  await db.insert(docDocumentLinks).values({
    tenantId: user.tenantId,
    fromDocumentId: doc.id,
    toKind: "par",
    toParId: par.id,
    relation: "from_par",
    createdByUserId: user.id,
  });
  await writeAudit(user.tenantId, doc.id, user.id, "created", { fromPar: par.requestNo });

  return c.json(
    { ...doc, basedOn, fromReceipt: receivedByLine.size > 0 },
    201
  );
});


// ─── Trimitere pe email + export pentru Word (DG-115) ────────────────────────

docsRoutes.post("/documents/:id/email", async (c) => {
  const user = c.get("user");
  const [doc] = await db
    .select()
    .from(docDocuments)
    .where(and(eq(docDocuments.id, c.req.param("id")), eq(docDocuments.tenantId, user.tenantId)));
  if (!doc) return c.json({ error: "not_found" }, 404);
  if (!maySeeDocument(doc.projectId, await visibilityFilter(user as { id: string; tenantId: string; role?: string }))) {
    return c.json({ error: "not_found" }, 404);
  }

  let to = "";
  let message: string | null = null;
  try {
    const body = (await c.req.json()) as { to?: string; message?: string };
    to = (body?.to ?? "").trim();
    message = body?.message ?? null;
  } catch {
    to = "";
  }
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return c.json({ error: "invalid_recipient", message: "Adresa de e-mail nu e validă." }, 400);
  }

  const printable = {
    docNumber: doc.docNumber,
    title: doc.title,
    kind: doc.kind,
    docDate: doc.docDate,
    bodyHtml: doc.bodyHtml,
    bodyHash: doc.bodyHash,
    status: doc.status,
  };
  const fileName = pdfFileName(printable, doc.counterpartyName);
  const pdfBase64 = doc.pdfUrl ? doc.pdfUrl.split(",")[1] ?? null : null;

  const result = await sendDocumentEmail({
    to,
    subject: `${doc.docNumber ? `${doc.docNumber} · ` : ""}${doc.title}`,
    message:
      message ??
      `Bună ziua,\n\nVă transmitem atașat ${doc.title}${doc.docNumber ? ` (nr. ${doc.docNumber})` : ""}.\n\nCu respect,`,
    fileName,
    pdfBase64,
  });

  // Jurnalul consemnează ÎNCERCAREA, nu doar succesul: „am trimis?" trebuie să aibă răspuns și
  // când livrarea a fost blocată de politica de mediu.
  await writeAudit(user.tenantId, doc.id, user.id, "emailed", {
    to,
    sent: result.sent,
    reason: result.sent ? null : result.reason,
  });

  if (!result.sent) {
    return c.json({ sent: false, reason: result.reason, message: result.detail }, 200);
  }
  return c.json({ sent: true, to });
});

/**
 * Export pentru Word: HTML cu antetul de Office, salvat ca .doc.
 *
 * De ce nu .docx „adevărat": ar cere o dependență nouă doar ca să producă un fișier pe care Word îl
 * deschide oricum din HTML, cu formatarea păstrată. Numim lucrurile pe nume în interfață
 * („Descarcă pentru Word"), ca nimeni să nu creadă că primește un .docx nativ.
 */
docsRoutes.get("/documents/:id/word", async (c) => {
  const user = c.get("user");
  const [doc] = await db
    .select()
    .from(docDocuments)
    .where(and(eq(docDocuments.id, c.req.param("id")), eq(docDocuments.tenantId, user.tenantId)));
  if (!doc) return c.json({ error: "not_found" }, 404);
  if (!maySeeDocument(doc.projectId, await visibilityFilter(user as { id: string; tenantId: string; role?: string }))) {
    return c.json({ error: "not_found" }, 404);
  }

  const lines = await db
    .select()
    .from(docDocumentLines)
    .where(eq(docDocumentLines.documentId, doc.id))
    .orderBy(docDocumentLines.position);

  const html = buildPrintableHtml(
    {
      docNumber: doc.docNumber,
      title: doc.title,
      kind: doc.kind,
      docDate: doc.docDate,
      bodyHtml: doc.bodyHtml,
      bodyHash: doc.bodyHash,
      status: doc.status,
      counterpartyName: doc.counterpartyName,
      counterpartySnapshot: safeJson(doc.counterpartySnapshot) as Record<string, string>,
      currency: doc.currency,
      totalCents: doc.totalCents,
      lines: lines.map((l) => ({
        description: l.description,
        unit: l.unit,
        quantity: l.quantity,
        lineTotalCents: l.lineTotalCents,
      })),
    },
    { name: null, logoUrl: null }
  );
  const fileName = pdfFileName(
    { docNumber: doc.docNumber, title: doc.title, kind: doc.kind, docDate: doc.docDate, bodyHtml: "", bodyHash: null, status: doc.status },
    doc.counterpartyName
  ).replace(/\.pdf$/, ".doc");

  await writeAudit(user.tenantId, doc.id, user.id, "downloaded", { format: "word" });

  return new Response(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
});


// ─── Generare în masă + ZIP (DG-124) ─────────────────────────────────────────

/**
 * N acte dintr-un tabel, salvate ÎN REGISTRU, nu doar într-un ZIP pe care îl pierzi.
 *
 * Diferența față de wizardul de generare în masă existent: acolo ieșeau fișiere, aici ies acte —
 * cu număr, contraparte, sumă și loc în dosarul proiectului. Un rând stricat NU oprește lotul:
 * se raportează pe poziția lui și restul se generează, altfel o singură celulă goală anulează
 * munca de o oră.
 */
docsRoutes.post("/bulk", async (c) => {
  const user = c.get("user");
  let payload: {
    templateId?: string;
    kind?: string;
    projectId?: string | null;
    rows?: Record<string, string>[];
  } = {};
  try {
    payload = (await c.req.json()) as typeof payload;
  } catch {
    return c.json({ error: "invalid_body" }, 400);
  }

  const rows = payload.rows ?? [];
  if (rows.length === 0) return c.json({ error: "no_rows", message: "Tabelul nu are rânduri." }, 400);
  if (rows.length > 500) {
    return c.json({ error: "too_many_rows", message: "Maxim 500 de acte într-un lot." }, 400);
  }

  const kind = payload.kind ?? "act_primire_predare";
  const templateId = payload.templateId ?? (await pickTemplateForKind(user.tenantId, kind));

  const created: { id: string; row: number; title: string }[] = [];
  const failed: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const partyName = row["contraparte.denumire"]?.trim();
      if (!partyName) {
        failed.push({ row: i + 1, reason: "Lipsește denumirea contrapărții." });
        continue;
      }
      const amount = Number.parseFloat((row["total.suma"] ?? "0").replace(/\s/g, "").replace(",", "."));
      const totalCents = Number.isFinite(amount) ? Math.round(amount * 100) : 0;

      const context = await buildDocumentContext({
        tenantId: user.tenantId,
        projectId: payload.projectId ?? null,
        docDate: new Date(),
        totalCents,
        currency: row["total.valuta"] ?? "MDL",
        userName: (user as { name?: string }).name ?? null,
        clientContext: row,
      });
      // Rândul din tabel e sursa pentru contraparte: lotul se face de obicei pentru părți care
      // NU sunt în registru (participanți, voluntari), deci datele vin din coloane.
      for (const [k, v] of Object.entries(row)) if (k.startsWith("contraparte.")) context[k] = v;

      const rendered = await renderBody(user.tenantId, templateId, context, [], row["total.valuta"] ?? "MDL");
      const snapshot: Record<string, string> = {};
      for (const [k, v] of Object.entries(context)) {
        if (k.startsWith("contraparte.")) snapshot[k.replace("contraparte.", "")] = v;
      }

      const [doc] = await db
        .insert(docDocuments)
        .values({
          tenantId: user.tenantId,
          templateId,
          templateVersion: rendered.templateVersion,
          kind,
          title: row["document.titlu"]?.trim() || `${DOC_KIND_LABEL[kind] ?? "Act"} — ${partyName}`,
          projectId: payload.projectId ?? null,
          counterpartyKind: "inline",
          counterpartyName: partyName,
          counterpartySnapshot: JSON.stringify(snapshot),
          context: JSON.stringify(context),
          bodyHtml: rendered.bodyHtml,
          totalCents,
          currency: row["total.valuta"] ?? "MDL",
          createdByUserId: user.id,
        })
        .returning();

      await writeAudit(user.tenantId, doc.id, user.id, "created", { bulkRow: i + 1 });
      created.push({ id: doc.id, row: i + 1, title: doc.title });
    } catch (e) {
      failed.push({ row: i + 1, reason: e instanceof Error ? e.message : "Rând invalid." });
    }
  }

  return c.json({ created, failed, total: rows.length }, 201);
});

/**
 * ZIP cu PDF-urile actelor alese. Un SINGUR browser pentru tot lotul (BatchPdfRenderer): N
 * lansări de chromium ar epuiza memoria serverului la al zecelea act.
 */
docsRoutes.post("/export/zip", async (c) => {
  const user = c.get("user");
  let ids: string[] = [];
  try {
    const body = (await c.req.json()) as { ids?: string[] };
    ids = body?.ids ?? [];
  } catch {
    ids = [];
  }
  if (ids.length === 0) return c.json({ error: "no_documents" }, 400);

  const allowed = await visibilityFilter(user as { id: string; tenantId: string; role?: string });
  const docs = (
    await db
      .select()
      .from(docDocuments)
      .where(and(eq(docDocuments.tenantId, user.tenantId), inArray(docDocuments.id, ids)))
  ).filter((d) => maySeeDocument(d.projectId, allowed));
  if (docs.length === 0) return c.json({ error: "not_found" }, 404);

  const [settings] = await db
    .select()
    .from(parSettings)
    .where(eq(parSettings.tenantId, user.tenantId))
    .limit(1);
  const org = { name: settings?.orgLegalName ?? null, logoUrl: settings?.orgLogoUrl ?? null };

  const renderer = await BatchPdfRenderer.create();
  const files: { name: string; pdf: Uint8Array }[] = [];
  try {
    for (const doc of docs) {
      const printable = {
        docNumber: doc.docNumber,
        title: doc.title,
        kind: doc.kind,
        docDate: doc.docDate,
        bodyHtml: doc.bodyHtml,
        bodyHash: doc.bodyHash,
        status: doc.status,
        counterpartyName: doc.counterpartyName,
        counterpartySnapshot: safeJson(doc.counterpartySnapshot) as Record<string, string>,
        currency: doc.currency,
        totalCents: doc.totalCents,
      };
      const name = pdfFileName(printable, doc.counterpartyName);
      // PDF-ul stocat (actul semnat) are prioritate — ZIP-ul trebuie să conțină exact ce s-a semnat.
      if (doc.pdfUrl) {
        files.push({ name, pdf: Buffer.from(doc.pdfUrl.split(",")[1] ?? "", "base64") });
        continue;
      }
      if (!renderer) continue;
      files.push({ name, pdf: await renderer.render(buildPrintableHtml(printable, org)) });
    }
  } finally {
    await renderer?.close();
  }

  if (files.length === 0) {
    return c.json(
      { error: "pdf_unavailable", message: "Nu s-a putut genera niciun PDF (chromium indisponibil)." },
      503
    );
  }

  const zip = await buildPdfZip(files);
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="acte.zip"`,
    },
  });
});
