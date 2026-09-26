import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, ilike, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  paymentAccounts,
  paymentAccountItems,
  paymentAccountTemplates,
  sellerProfiles,
  finInventoryItems,
} from "../db/schema";
import { crmProducts } from "../db/schema/crmProducts";
import { crmCompanies } from "../db/schema/crmCompanies";
import { leads } from "../db/schema/leads";
import { docNumberSequences } from "../db/schema/docs";
import type { PaymentAccountTemplateBuyer, PaymentAccountTemplateItem } from "../db/schema/paymentAccountTemplates";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { computeDocumentTotals } from "../lib/paymentAccountTotals";
import {
  firstFreeNumber,
  formatDocumentNumber,
  nextSequenceNumber,
  parseManualNumber,
  type NumberingSettings,
} from "../lib/paymentAccounts/numbering";
import {
  brandingFor,
  effectiveLogoUrl,
  loadIssuer,
  loadSellerRow,
  loadSettings,
  defaultVatFor,
  missingIssuerFields,
  numberingOf,
  type Issuer,
} from "../lib/paymentAccounts/issuer";
import {
  PAYMENT_ACCOUNT_LAYOUTS,
  renderPaymentAccountPdf,
  type PaymentAccountLang,
  type PaymentAccountPdfData,
} from "../lib/paymentAccounts/paymentAccountPdf";
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES, uploadOrgLogo } from "../lib/par/orgLogo";

/**
 * CONT-PLATA: „cont de plată" — modulul CRM (CONTPLATA-faza-1).
 *
 *   GET    /api/payment-accounts                 → listă (filtre: status, q)
 *   POST   /api/payment-accounts                 → ciornă nouă
 *   GET    /api/payment-accounts/settings        → setări de design + numerotare + emitentul
 *   PUT    /api/payment-accounts/settings        → salvează setările
 *   POST   /api/payment-accounts/settings/logo   → încarcă logoul contului
 *   DELETE /api/payment-accounts/settings/logo   → revine la logoul organizației
 *   GET    /api/payment-accounts/settings/sample.pdf → mostră cu setările curente
 *   GET    /api/payment-accounts/next-number     → numărul care va fi atribuit la emitere
 *   GET    /api/payment-accounts/catalog?q=      → produse CRM (cu stoc) + servicii folosite anterior
 *   GET|POST /api/payment-accounts/templates, PATCH|DELETE /templates/:id, POST /templates/:id/use
 *   GET    /api/payment-accounts/:id             → antet + poziții
 *   PATCH  /api/payment-accounts/:id             → editează ciorna (înlocuiește pozițiile)
 *   GET    /api/payment-accounts/:id/pdf         → PDF inline (preview încadrabil); ?download=1
 *   POST   /api/payment-accounts/:id/issue       → număr automat SAU manual (unic), status=issued
 *   POST   /api/payment-accounts/:id/duplicate   → ciornă nouă cu același client + poziții
 *   POST   /api/payment-accounts/:id/status      → plătit / anulat
 *   DELETE /api/payment-accounts/:id             → doar ciornele
 */
export const paymentAccountRoutes = new Hono<{ Variables: AuthVariables }>();

paymentAccountRoutes.use("*", requireAuth);
// Un id de șablon care nu e uuid ar ajunge la Postgres ca 22P02 (500) — e doar „nu există".
paymentAccountRoutes.use("/templates/:tid/*", async (c, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(c.req.param("tid") ?? "")) return c.json({ error: "not_found" }, 404);
  await next();
});
paymentAccountRoutes.use("/templates/:tid", async (c, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(c.req.param("tid") ?? "")) return c.json({ error: "not_found" }, 404);
  await next();
});

// ─── Validare ────────────────────────────────────────────────────────────────

const optStr = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const itemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  unit: z.string().trim().max(32).default("buc"),
  quantity: z.number().positive().max(1_000_000),
  // 10 milioane pe unitate — plafonul ține totalul în int4 (coloanele sunt `integer`, în bani).
  unitPriceCents: z.number().int().min(0).max(1_000_000_000),
  vatRate: z.number().int().min(0).max(100).default(0),
  productId: z.string().uuid().optional().nullable(),
});

/** Data vine ca „2026-09-26" din câmpul de dată sau ca ISO complet; orice altceva = fără dată. */
const dateStr = z
  .string()
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null;
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v);
    return isNaN(d.getTime()) ? null : d;
  });

const buyerShape = {
  buyerName: z.string().trim().min(1).max(500),
  buyerIdno: optStr(32),
  buyerVatCode: optStr(32),
  buyerAddress: optStr(500),
  buyerCity: optStr(255),
  buyerEmail: optStr(255),
  buyerPhone: optStr(64),
  // Spațiile se scot ÎNAINTE de limita de 34: un IBAN scris „MD24 AG00 …" are 29 de caractere
  // utile, dar trecea de 34 cu spații și bloca salvarea automată cu 400.
  buyerIban: z.preprocess((v) => (typeof v === "string" ? v.replace(/\s+/g, "").toUpperCase() : v), optStr(34)),
  buyerBankName: optStr(255),
  buyerContact: optStr(255),
};

const upsertSchema = z.object({
  clientId: z.string().uuid().optional().nullable(),
  crmCompanyId: z.string().uuid().optional().nullable(),
  leadId: z.string().uuid().optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  series: z.string().trim().min(1).max(20).optional(),
  currency: z.enum(["MDL", "EUR", "USD", "RON"]).optional(),
  lang: z.enum(["ro", "ru", "en"]).optional(),
  issueDate: dateStr,
  dueDate: dateStr,
  notes: optStr(2000),
  ...buyerShape,
  items: z.array(itemSchema).min(1).max(200),
});

type UpsertBody = z.infer<typeof upsertSchema>;

function buyerValues(body: UpsertBody) {
  return {
    buyerName: body.buyerName,
    buyerIdno: body.buyerIdno ?? null,
    buyerVatCode: body.buyerVatCode ?? null,
    buyerAddress: body.buyerAddress ?? null,
    buyerCity: body.buyerCity ?? null,
    buyerEmail: body.buyerEmail ?? null,
    buyerPhone: body.buyerPhone ?? null,
    buyerIban: body.buyerIban ?? null,
    buyerBankName: body.buyerBankName ?? null,
    buyerContact: body.buyerContact ?? null,
  };
}

function sellerSnapshot(i: Issuer) {
  return {
    sellerName: i.name,
    sellerIdno: i.idno,
    sellerVatCode: i.vatCode,
    sellerAddress: i.address,
    sellerIban: i.iban,
    sellerBankName: i.bankName,
    sellerBankCode: i.bic,
    sellerBic: i.bic,
    sellerPhone: i.phone,
    sellerEmail: i.email,
    sellerAdministrator: i.administrator,
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Totalul maxim al unui cont: coloanele de sume sunt `integer` (bani). Peste el, 400 — nu un 500. */
const MAX_TOTAL_CENTS = 2_000_000_000;

async function writeItems(tx: Tx, accountId: string, items: UpsertBody["items"]) {
  const { lines } = computeDocumentTotals(items);
  await tx.delete(paymentAccountItems).where(eq(paymentAccountItems.accountId, accountId));
  await tx.insert(paymentAccountItems).values(
    items.map((it, i) => ({
      accountId,
      position: i,
      description: it.description,
      unit: it.unit || "buc",
      quantity: String(it.quantity),
      unitPriceCents: it.unitPriceCents,
      vatRate: it.vatRate,
      lineSubtotalCents: lines[i].lineSubtotalCents,
      lineVatCents: lines[i].lineVatCents,
      lineTotalCents: lines[i].lineTotalCents,
      productId: it.productId ?? null,
    }))
  );
}

async function loadAccount(tenantId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const [account] = await db
    .select()
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.tenantId, tenantId)))
    .limit(1);
  return account;
}

// ─── Numerotare atomică ──────────────────────────────────────────────────────
//
// Secvența refolosește `doc_number_sequences` (aceeași tabelă ca registrul de acte), cu
// kind = „cont_plata:<serie>" și year = 0 (seria e continuă, nu se resetează anual). UPSERT-ul
// e atomic: două emiteri simultane primesc numere diferite — un SELECT max()+UPDATE nu garanta asta.

const SEQ_YEAR = 0;
/** Cât de mult poate sări înainte un număr manual și tot să continue secvența automată. */
const MANUAL_JUMP_LIMIT = 1000;
const seqKind = (series: string) => `cont_plata:${series}`.slice(0, 50);

async function usedNumbers(tenantId: string, series: string): Promise<number[]> {
  const rows = await db
    .select({ n: paymentAccounts.number })
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.tenantId, tenantId), eq(paymentAccounts.series, series), isNotNull(paymentAccounts.number)));
  return rows.map((r) => Number(r.n)).filter((n) => Number.isFinite(n));
}

async function takenDocumentNumbers(tenantId: string, excludeId?: string): Promise<Set<string>> {
  const conds = [eq(paymentAccounts.tenantId, tenantId), isNotNull(paymentAccounts.documentNumber)];
  if (excludeId) conds.push(ne(paymentAccounts.id, excludeId));
  const rows = await db.select({ d: paymentAccounts.documentNumber }).from(paymentAccounts).where(and(...conds));
  return new Set(rows.map((r) => r.d as string));
}

/** Rezervă atomic următorul număr al seriei; nu dă niciodată înapoi (GREATEST). */
async function reserveSequence(tenantId: string, series: string, floor: number): Promise<number> {
  const [seq] = await db
    .insert(docNumberSequences)
    .values({ tenantId, kind: seqKind(series), year: SEQ_YEAR, prefix: series.slice(0, 20), lastNumber: floor + 1 })
    .onConflictDoUpdate({
      target: [docNumberSequences.tenantId, docNumberSequences.kind, docNumberSequences.year],
      set: {
        lastNumber: sql`GREATEST(${docNumberSequences.lastNumber}, ${floor}) + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return Number(seq.lastNumber);
}

/** Avansează secvența până la cel puțin `n` (după un număr manual care intră în secvență). */
async function bumpSequenceTo(tenantId: string, series: string, n: number) {
  await db
    .insert(docNumberSequences)
    .values({ tenantId, kind: seqKind(series), year: SEQ_YEAR, prefix: series.slice(0, 20), lastNumber: n })
    .onConflictDoUpdate({
      target: [docNumberSequences.tenantId, docNumberSequences.kind, docNumberSequences.year],
      set: { lastNumber: sql`GREATEST(${docNumberSequences.lastNumber}, ${n})`, updatedAt: new Date() },
    });
}

/** Ce număr ar primi următorul cont — FĂRĂ să-l rezerve (pentru editor și ciorne). */
async function peekNextNumber(tenantId: string, numbering: NumberingSettings, year: number, excludeId?: string) {
  const [seq] = await db
    .select({ last: docNumberSequences.lastNumber })
    .from(docNumberSequences)
    .where(
      and(
        eq(docNumberSequences.tenantId, tenantId),
        eq(docNumberSequences.kind, seqKind(numbering.series)),
        eq(docNumberSequences.year, SEQ_YEAR)
      )
    )
    .limit(1);
  const used = await usedNumbers(tenantId, numbering.series);
  const n = nextSequenceNumber([...used, seq ? Number(seq.last) : null], numbering.start);
  return firstFreeNumber(numbering, n, year, await takenDocumentNumbers(tenantId, excludeId));
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return e?.code === "23505" || e?.cause?.code === "23505" || /duplicate key|unique/i.test(e?.message ?? "");
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

type AccountRow = typeof paymentAccounts.$inferSelect;
type ItemRow = typeof paymentAccountItems.$inferSelect;

function pdfData(account: AccountRow, items: ItemRow[], issuer: Issuer, draftNumber: string | null): PaymentAccountPdfData {
  const isDraft = account.status === "draft";
  // Ciorna arată rechizitele de ACUM (poate le-ai completat între timp); contul emis, cele înghețate.
  const seller = isDraft
    ? { ...issuer, vatCode: issuer.vatCode, administratorTitle: issuer.administratorTitle }
    : {
        name: account.sellerName,
        idno: account.sellerIdno,
        vatCode: account.sellerVatCode,
        address: account.sellerAddress,
        iban: account.sellerIban,
        bankName: account.sellerBankName,
        bic: account.sellerBic ?? account.sellerBankCode,
        phone: account.sellerPhone,
        email: account.sellerEmail,
        administrator: account.sellerAdministrator,
        administratorTitle: issuer.administratorTitle,
      };
  return {
    documentNumber: account.documentNumber ?? draftNumber,
    isDraft,
    currency: account.currency,
    issueDate: new Date(account.issueDate),
    dueDate: account.dueDate ? new Date(account.dueDate) : null,
    notes: account.notes,
    seller,
    buyer: {
      name: account.buyerName,
      idno: account.buyerIdno,
      vatCode: account.buyerVatCode,
      address: account.buyerAddress,
      city: account.buyerCity,
      iban: account.buyerIban,
      bankName: account.buyerBankName,
      phone: account.buyerPhone,
      email: account.buyerEmail,
      contact: account.buyerContact,
    },
    items: items.map((it) => ({
      description: it.description,
      unit: it.unit,
      quantity: Number(it.quantity),
      unitPriceCents: it.unitPriceCents,
      vatRate: it.vatRate,
      lineSubtotalCents: it.lineSubtotalCents,
      lineVatCents: it.lineVatCents,
      lineTotalCents: it.lineTotalCents,
    })),
    subtotalCents: account.subtotalCents,
    vatCents: account.vatCents,
    totalCents: account.totalCents,
  };
}

function pdfResponse(bytes: Buffer, fileBase: string, download: boolean): Response {
  const safe = fileBase.replace(/[^a-zA-Z0-9_.-]/g, "_") || "cont-de-plata";
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(ab, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safe}.pdf"`,
      // Previzualizarea se reîncarcă la fiecare modificare; cache-ul ar arăta versiunea veche.
      "Cache-Control": "no-store",
    },
  });
}

// ─── Setări ──────────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  series: z.string().trim().min(1).max(20).regex(/^[\p{L}\p{N}._/-]+$/u, "Seria: litere, cifre, . _ / -").optional(),
  numberPattern: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .refine((v) => v.includes("{nr}"), "Formatul trebuie să conțină {nr}")
    .optional(),
  numberPad: z.number().int().min(1).max(10).optional(),
  numberStart: z.number().int().min(1).max(10_000_000).optional(),
  defaultVatRate: z.number().int().min(0).max(100).optional(),
  defaultDueDays: z.number().int().min(0).max(365).optional(),
  defaultLang: z.enum(["ro", "ru", "en"]).optional(),
  defaultNotes: optStr(2000),
  layout: z.enum(PAYMENT_ACCOUNT_LAYOUTS as [string, ...string[]]).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Culoare invalidă (ex.: #047857)").optional(),
  showLogo: z.boolean().optional(),
  showAmountWords: z.boolean().optional(),
  showSignature: z.boolean().optional(),
  showStamp: z.boolean().optional(),
  footerText: optStr(500),
});

async function settingsView(tenantId: string) {
  const [settings, issuer] = await Promise.all([loadSettings(tenantId), loadIssuer(tenantId)]);
  const year = new Date().getFullYear();
  const next = await peekNextNumber(tenantId, numberingOf(settings), year);
  return {
    settings,
    issuer,
    logoUrl: effectiveLogoUrl(settings, issuer),
    missing: missingIssuerFields(issuer),
    nextNumber: next.documentNumber,
  };
}

paymentAccountRoutes.get("/settings", async (c) => {
  return c.json({ data: await settingsView(c.get("user").tenantId) });
});

async function upsertSeller(tenantId: string, values: Partial<typeof sellerProfiles.$inferInsert>) {
  const existing = await loadSellerRow(tenantId);
  if (existing) {
    await db.update(sellerProfiles).set({ ...values, updatedAt: new Date() }).where(eq(sellerProfiles.id, existing.id));
  } else {
    const issuer = await loadIssuer(tenantId);
    // TVA-ul implicit al coloanei e 20; pentru un neplătitor de TVA (fără cod TVA) ar însemna ca
    // prima salvare a setărilor să schimbe tăcut TVA-ul tuturor conturilor noi.
    await db.insert(sellerProfiles).values({
      tenantId,
      name: issuer.name || "—",
      defaultVatRate: defaultVatFor(issuer),
      ...values,
    });
  }
}

paymentAccountRoutes.put(
  "/settings",
  zValidator("json", settingsSchema, (result, c) => {
    if (!result.success) {
      const first = result.error.issues[0];
      return c.json({ error: "invalid", field: first?.path.join("."), message: first?.message ?? "Date invalide" }, 400);
    }
  }),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const b = c.req.valid("json");
    const values: Partial<typeof sellerProfiles.$inferInsert> = {};
    if (b.series !== undefined) values.defaultSeries = b.series;
    if (b.numberPattern !== undefined) values.numberPattern = b.numberPattern;
    if (b.numberPad !== undefined) values.numberPad = b.numberPad;
    if (b.numberStart !== undefined) values.numberStart = b.numberStart;
    if (b.defaultVatRate !== undefined) values.defaultVatRate = b.defaultVatRate;
    if (b.defaultDueDays !== undefined) values.defaultDueDays = b.defaultDueDays;
    if (b.defaultLang !== undefined) values.defaultLang = b.defaultLang;
    if (b.defaultNotes !== undefined) values.defaultNotes = b.defaultNotes;
    if (b.layout !== undefined) values.layout = b.layout;
    if (b.accentColor !== undefined) values.accentColor = b.accentColor.toUpperCase();
    if (b.showLogo !== undefined) values.showLogo = b.showLogo;
    if (b.showAmountWords !== undefined) values.showAmountWords = b.showAmountWords;
    if (b.showSignature !== undefined) values.showSignature = b.showSignature;
    if (b.showStamp !== undefined) values.showStamp = b.showStamp;
    if (b.footerText !== undefined) values.footerText = b.footerText;
    await upsertSeller(tenantId, values);
    return c.json({ data: await settingsView(tenantId) });
  }
);

paymentAccountRoutes.post("/settings/logo", async (c) => {
  const tenantId = c.get("user").tenantId;
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "Se aștepta un fișier (multipart/form-data)." }, 400);
  }
  const file = form.get("file") as File | null;
  if (!file) return c.json({ error: "Niciun fișier trimis." }, 400);
  if (file.size > LOGO_MAX_BYTES) return c.json({ error: "Fișier prea mare (max 1 MB)." }, 413);
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
    // pdfmake desenează doar PNG și JPEG; un SVG acceptat aici ar dispărea tăcut de pe cont.
    return c.json({ error: "Format neacceptat. Încarcă un PNG sau un JPG." }, 415);
  }
  let logoUrl: string;
  try {
    logoUrl = await uploadOrgLogo(tenantId, Buffer.from(await file.arrayBuffer()), file.type);
  } catch {
    return c.json({ error: "Logoul nu a putut fi salvat. Încearcă din nou." }, 503);
  }
  await upsertSeller(tenantId, { logoUrl, showLogo: true });
  return c.json({ data: await settingsView(tenantId) });
});

paymentAccountRoutes.delete("/settings/logo", async (c) => {
  const tenantId = c.get("user").tenantId;
  await upsertSeller(tenantId, { logoUrl: null });
  return c.json({ data: await settingsView(tenantId) });
});

/** Mostra: ce iese cu setările salvate, pe un client și două poziții inventate (marcate ca atare). */
paymentAccountRoutes.get("/settings/sample.pdf", async (c) => {
  const tenantId = c.get("user").tenantId;
  const [settings, issuer] = await Promise.all([loadSettings(tenantId), loadIssuer(tenantId)]);
  const lang = (["ro", "ru", "en"].includes(c.req.query("lang") ?? "") ? c.req.query("lang") : settings.defaultLang) as PaymentAccountLang;
  const vat = settings.defaultVatRate;
  const sampleLines = [
    { description: "Curs de limba engleză, nivel B1 — 3 luni", unit: "curs", quantity: 1, unitPriceCents: 450_000 },
    { description: "Manual și materiale didactice", unit: "buc", quantity: 2, unitPriceCents: 35_000 },
  ].map((l) => ({ ...l, vatRate: vat }));
  const { totals, lines } = computeDocumentTotals(sampleLines);
  const today = new Date();
  const next = await peekNextNumber(tenantId, numberingOf(settings), today.getFullYear());
  const data: PaymentAccountPdfData = {
    documentNumber: next.documentNumber,
    isDraft: false,
    currency: "MDL",
    issueDate: today,
    dueDate: new Date(today.getTime() + settings.defaultDueDays * 86_400_000),
    notes: settings.defaultNotes ?? "Mostră — clientul și pozițiile sunt exemple.",
    seller: issuer,
    buyer: { name: "Client exemplu SRL", idno: "1000000000000", address: "str. Exemplu 1, Chișinău", email: "contabil@exemplu.md" },
    items: sampleLines.map((l, i) => ({ ...l, ...lines[i] })),
    ...totals,
  };
  try {
    const pdf = await renderPaymentAccountPdf(data, await brandingFor(settings, issuer, lang));
    return pdfResponse(pdf, "mostra-cont-de-plata", false);
  } catch (err) {
    console.error("[paymentAccounts] sample pdf failed:", err);
    return c.json({ error: "pdf_failed" }, 500);
  }
});

// ─── Numărul următor ─────────────────────────────────────────────────────────

paymentAccountRoutes.get("/next-number", async (c) => {
  const tenantId = c.get("user").tenantId;
  const settings = await loadSettings(tenantId);
  const numbering = numberingOf(settings, c.req.query("series"));
  const d = c.req.query("date");
  const year = d && !isNaN(new Date(d).getTime()) ? new Date(d).getFullYear() : new Date().getFullYear();
  const next = await peekNextNumber(tenantId, numbering, year, c.req.query("exclude") || undefined);
  return c.json({ data: { series: numbering.series, ...next } });
});

// ─── Catalog: produse CRM + servicii folosite anterior ──────────────────────

paymentAccountRoutes.get("/catalog", async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = (c.req.query("q") ?? "").trim();
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  const productConds = [eq(crmProducts.tenantId, tenantId), eq(crmProducts.isActive, true)];
  if (q) productConds.push(or(ilike(crmProducts.name, like), ilike(crmProducts.sku, like))!);
  const products = await db
    .select({
      id: crmProducts.id,
      name: crmProducts.name,
      sku: crmProducts.sku,
      unit: crmProducts.unit,
      listPriceCents: crmProducts.listPriceCents,
      currency: crmProducts.currency,
      vatPercent: crmProducts.vatPercent,
      category: crmProducts.category,
      qtyOnHand: finInventoryItems.qtyOnHand,
    })
    .from(crmProducts)
    // Stocul e cel din inventarul FinDesk — CRM-ul nu ține o a doua cantitate (vezi crmProducts.ts).
    .leftJoin(finInventoryItems, and(eq(finInventoryItems.id, crmProducts.inventoryItemId), eq(finInventoryItems.tenantId, tenantId)))
    .where(and(...productConds))
    .orderBy(asc(crmProducts.orderIndex), asc(crmProducts.name))
    .limit(30);

  const recentConds = [eq(paymentAccounts.tenantId, tenantId)];
  if (q) recentConds.push(ilike(paymentAccountItems.description, like));
  const recentRows = await db
    .select({
      description: paymentAccountItems.description,
      unit: paymentAccountItems.unit,
      unitPriceCents: paymentAccountItems.unitPriceCents,
      vatRate: paymentAccountItems.vatRate,
      uses: sql<number>`count(*)`,
      lastUsed: sql<string>`max(${paymentAccountItems.createdAt})`,
    })
    .from(paymentAccountItems)
    .innerJoin(paymentAccounts, eq(paymentAccounts.id, paymentAccountItems.accountId))
    .where(and(...recentConds))
    .groupBy(paymentAccountItems.description, paymentAccountItems.unit, paymentAccountItems.unitPriceCents, paymentAccountItems.vatRate)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${paymentAccountItems.createdAt})`))
    .limit(40);

  // Un serviciu care e deja produs în catalog nu apare de două ori: catalogul are prioritate.
  const productNames = new Set(products.map((p) => p.name.trim().toLowerCase()));
  const seen = new Set<string>();
  const recent = [];
  for (const r of recentRows) {
    const key = r.description.trim().toLowerCase();
    if (productNames.has(key) || seen.has(key)) continue;
    seen.add(key);
    recent.push({ ...r, uses: Number(r.uses) });
    if (recent.length >= 20) break;
  }

  return c.json({
    data: {
      products: products.map((p) => ({
        ...p,
        vatPercent: Number(p.vatPercent ?? 0),
        tracksStock: p.qtyOnHand !== null,
      })),
      recent,
    },
  });
});

// ─── Pornire din CRM: lead sau fișa firmei ──────────────────────────────────
//
// Integrarea cerută de owner („trebuie legate de CRM"): butonul „Cont de plată" de pe lead
// deschide editorul cu clientul și produsul deja puse. Clientul e FIRMA leadului când are una
// (contul se plătește de firmă, nu de persoana care a sunat), altfel persoana. Nu scrie nimic —
// doar propune; ciorna se creează la prima salvare, cu `leadId` legat.

const UUID_RE = /^[0-9a-f-]{36}$/i;

paymentAccountRoutes.get("/prefill", async (c) => {
  const tenantId = c.get("user").tenantId;
  const leadId = c.req.query("leadId");
  const companyIdParam = c.req.query("companyId");
  if ((leadId && !UUID_RE.test(leadId)) || (companyIdParam && !UUID_RE.test(companyIdParam))) {
    return c.json({ error: "invalid_id" }, 400);
  }

  let lead: typeof leads.$inferSelect | undefined;
  if (leadId) {
    [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId))).limit(1);
    if (!lead) return c.json({ error: "not_found" }, 404);
  }
  const companyId = lead?.companyId ?? companyIdParam ?? null;
  let company: typeof crmCompanies.$inferSelect | undefined;
  if (companyId) {
    [company] = await db
      .select()
      .from(crmCompanies)
      .where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.tenantId, tenantId)))
      .limit(1);
    if (!company && !lead) return c.json({ error: "not_found" }, 404);
  }

  const buyer = company
    ? {
        buyerName: company.name,
        buyerIdno: company.idno,
        buyerAddress: company.address,
        buyerEmail: company.email,
        buyerPhone: company.phone,
        buyerContact: lead?.fullName ?? null,
        crmCompanyId: company.id,
      }
    : {
        buyerName: lead?.company?.trim() || lead?.fullName || "",
        buyerEmail: lead?.email ?? null,
        buyerPhone: lead?.phone ?? null,
        buyerContact: lead?.company?.trim() ? lead.fullName : null,
        crmCompanyId: null,
      };

  const items: Array<{ description: string; unit: string; quantity: number; unitPriceCents: number; vatRate: number; productId: string | null }> = [];
  if (lead?.productId) {
    const [p] = await db
      .select()
      .from(crmProducts)
      .where(and(eq(crmProducts.id, lead.productId), eq(crmProducts.tenantId, tenantId)))
      .limit(1);
    if (p) {
      items.push({
        description: p.name,
        unit: p.unit || "buc",
        quantity: Math.max(1, lead.productQty ?? 1),
        unitPriceCents: p.listPriceCents,
        vatRate: Math.round(Number(p.vatPercent ?? 0)),
        productId: p.id,
      });
    }
  }
  // Fără produs din catalog: interesul leadului + valoarea lui sunt cel mai bun punct de pornire.
  if (items.length === 0 && lead && (lead.interestCourse || lead.valueCents > 0)) {
    items.push({
      description: lead.interestCourse || lead.dealName || "Servicii",
      unit: "buc",
      quantity: 1,
      unitPriceCents: Math.max(0, lead.valueCents),
      vatRate: 0,
      productId: null,
    });
  }

  return c.json({ data: { leadId: lead?.id ?? null, buyer, items } });
});

// ─── Șabloane ────────────────────────────────────────────────────────────────

const templateItemSchema = itemSchema.extend({ description: z.string().trim().min(1).max(500) });
const templateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** Pornind dintr-un cont existent: clientul + pozițiile + notele lui. */
  fromAccountId: z.string().uuid().optional(),
  includeBuyer: z.boolean().default(true),
  buyer: z.record(z.string(), z.unknown()).optional().nullable(),
  items: z.array(templateItemSchema).max(200).optional(),
  currency: z.enum(["MDL", "EUR", "USD", "RON"]).optional(),
  notes: optStr(2000),
  dueDays: z.number().int().min(0).max(365).optional().nullable(),
});

const BUYER_KEYS: (keyof PaymentAccountTemplateBuyer)[] = [
  "buyerName", "buyerIdno", "buyerVatCode", "buyerAddress", "buyerCity", "buyerEmail",
  "buyerPhone", "buyerIban", "buyerBankName", "buyerContact", "crmCompanyId",
];

function pickBuyer(src: Record<string, unknown> | null | undefined): PaymentAccountTemplateBuyer | null {
  if (!src) return null;
  const out: PaymentAccountTemplateBuyer = {};
  for (const k of BUYER_KEYS) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 500);
  }
  return out.buyerName ? out : null;
}

paymentAccountRoutes.get("/templates", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select()
    .from(paymentAccountTemplates)
    .where(eq(paymentAccountTemplates.tenantId, tenantId))
    .orderBy(desc(paymentAccountTemplates.lastUsedAt), desc(paymentAccountTemplates.createdAt))
    .limit(200);
  return c.json({ data: rows });
});

paymentAccountRoutes.post("/templates", zValidator("json", templateSchema), async (c) => {
  const user = c.get("user");
  const b = c.req.valid("json");
  let buyer = b.includeBuyer ? pickBuyer(b.buyer ?? null) : null;
  let items: PaymentAccountTemplateItem[] = (b.items ?? []).map((it) => ({
    description: it.description,
    unit: it.unit || "buc",
    quantity: it.quantity,
    unitPriceCents: it.unitPriceCents,
    vatRate: it.vatRate,
    productId: it.productId ?? null,
  }));
  let currency = b.currency ?? "MDL";
  let notes = b.notes ?? null;
  let dueDays = b.dueDays ?? null;

  if (b.fromAccountId) {
    const account = await loadAccount(user.tenantId, b.fromAccountId);
    if (!account) return c.json({ error: "not_found" }, 404);
    const rows = await db
      .select()
      .from(paymentAccountItems)
      .where(eq(paymentAccountItems.accountId, account.id))
      .orderBy(asc(paymentAccountItems.position));
    buyer = b.includeBuyer ? pickBuyer(account as unknown as Record<string, unknown>) : null;
    items = rows.map((r) => ({
      description: r.description,
      unit: r.unit,
      quantity: Number(r.quantity),
      unitPriceCents: r.unitPriceCents,
      vatRate: r.vatRate,
      productId: r.productId ?? null,
    }));
    currency = account.currency as typeof currency;
    notes = account.notes;
    if (account.dueDate) {
      dueDays = Math.max(0, Math.round((new Date(account.dueDate).getTime() - new Date(account.issueDate).getTime()) / 86_400_000));
    }
  }
  if (items.length === 0) return c.json({ error: "Șablonul are nevoie de cel puțin o poziție." }, 400);

  const [row] = await db
    .insert(paymentAccountTemplates)
    .values({ tenantId: user.tenantId, name: b.name, buyer, items, currency, notes, dueDays, createdBy: user.id })
    .returning();
  return c.json({ data: row }, 201);
});

paymentAccountRoutes.patch(
  "/templates/:tid",
  zValidator("json", z.object({ name: z.string().trim().min(1).max(200) })),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const [row] = await db
      .update(paymentAccountTemplates)
      .set({ name: c.req.valid("json").name, updatedAt: new Date() })
      .where(and(eq(paymentAccountTemplates.id, c.req.param("tid")), eq(paymentAccountTemplates.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ data: row });
  }
);

paymentAccountRoutes.delete("/templates/:tid", async (c) => {
  const tenantId = c.get("user").tenantId;
  const deleted = await db
    .delete(paymentAccountTemplates)
    .where(and(eq(paymentAccountTemplates.id, c.req.param("tid")), eq(paymentAccountTemplates.tenantId, tenantId)))
    .returning({ id: paymentAccountTemplates.id });
  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

// ─── Crearea unei ciorne (comună: formular, șablon, duplicare) ──────────────

async function createDraft(tenantId: string, body: UpsertBody) {
  const [settings, issuer] = await Promise.all([loadSettings(tenantId), loadIssuer(tenantId)]);
  const { totals } = computeDocumentTotals(body.items);
  if (totals.totalCents > MAX_TOTAL_CENTS) throw new TotalTooLarge();
  const issueDate = body.issueDate ?? new Date();
  const dueDate =
    body.dueDate === null && settings.defaultDueDays > 0
      ? new Date(issueDate.getTime() + settings.defaultDueDays * 86_400_000)
      : body.dueDate;
  return db.transaction(async (tx) => {
    const [account] = await tx
      .insert(paymentAccounts)
      .values({
        tenantId,
        clientId: body.clientId ?? null,
        crmCompanyId: body.crmCompanyId ?? null,
        leadId: body.leadId ?? null,
        templateId: body.templateId ?? null,
        series: body.series ?? settings.series,
        currency: body.currency ?? "MDL",
        lang: body.lang ?? settings.defaultLang,
        status: "draft",
        issueDate,
        dueDate: dueDate ?? null,
        notes: body.notes ?? settings.defaultNotes ?? null,
        ...sellerSnapshot(issuer),
        ...buyerValues(body),
        subtotalCents: totals.subtotalCents,
        vatCents: totals.vatCents,
        totalCents: totals.totalCents,
      })
      .returning();
    await writeItems(tx, account.id, body.items);
    return account;
  });
}

class TotalTooLarge extends Error {}
const TOTAL_TOO_LARGE = { error: "total_too_large", message: "Totalul depășește limita unui cont (20 de milioane)." } as const;

paymentAccountRoutes.post("/templates/:tid/use", async (c) => {
  const tenantId = c.get("user").tenantId;
  const [tpl] = await db
    .select()
    .from(paymentAccountTemplates)
    .where(and(eq(paymentAccountTemplates.id, c.req.param("tid")), eq(paymentAccountTemplates.tenantId, tenantId)))
    .limit(1);
  if (!tpl) return c.json({ error: "not_found" }, 404);
  const override = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  // Clientul din cerere (ales în editor) bate clientul salvat în șablon.
  const buyer = pickBuyer(override) ?? tpl.buyer ?? null;
  if (!buyer?.buyerName) return c.json({ error: "buyer_required", message: "Alege clientul pentru acest șablon." }, 400);
  const today = new Date();
  const parsed = upsertSchema.safeParse({
    ...buyer,
    templateId: tpl.id,
    currency: tpl.currency,
    notes: tpl.notes,
    issueDate: today.toISOString(),
    dueDate: tpl.dueDays != null ? new Date(today.getTime() + tpl.dueDays * 86_400_000).toISOString() : null,
    items: tpl.items,
  });
  if (!parsed.success) return c.json({ error: "invalid_template", message: parsed.error.issues[0]?.message }, 400);
  const account = await createDraft(tenantId, parsed.data);
  await db
    .update(paymentAccountTemplates)
    .set({ useCount: sql`${paymentAccountTemplates.useCount} + 1`, lastUsedAt: new Date() })
    .where(eq(paymentAccountTemplates.id, tpl.id));
  return c.json({ data: account }, 201);
});

// ─── Listă + CRUD ────────────────────────────────────────────────────────────

paymentAccountRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const status = c.req.query("status");
  const q = (c.req.query("q") ?? "").trim();
  const conditions = [eq(paymentAccounts.tenantId, tenantId)];
  if (status && ["draft", "issued", "paid", "cancelled"].includes(status)) {
    conditions.push(eq(paymentAccounts.status, status as "draft" | "issued" | "paid" | "cancelled"));
  }
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conditions.push(
      or(ilike(paymentAccounts.buyerName, like), ilike(paymentAccounts.documentNumber, like), ilike(paymentAccounts.buyerIdno, like))!
    );
  }
  const rows = await db
    .select()
    .from(paymentAccounts)
    .where(and(...conditions))
    .orderBy(desc(paymentAccounts.createdAt))
    .limit(500);
  return c.json({ data: rows });
});

paymentAccountRoutes.post("/", zValidator("json", upsertSchema), async (c) => {
  try {
    const account = await createDraft(c.get("user").tenantId, c.req.valid("json"));
    return c.json({ data: account }, 201);
  } catch (err) {
    if (err instanceof TotalTooLarge) return c.json(TOTAL_TOO_LARGE, 400);
    throw err;
  }
});

paymentAccountRoutes.get("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const account = await loadAccount(tenantId, c.req.param("id"));
  if (!account) return c.json({ error: "not_found" }, 404);
  const items = await db
    .select()
    .from(paymentAccountItems)
    .where(eq(paymentAccountItems.accountId, account.id))
    .orderBy(paymentAccountItems.position);
  return c.json({ data: { ...account, items } });
});

paymentAccountRoutes.patch("/:id", zValidator("json", upsertSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await loadAccount(tenantId, id);
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (existing.status !== "draft") return c.json({ error: "only_draft_editable" }, 409);

  const { totals } = computeDocumentTotals(body.items);
  if (totals.totalCents > MAX_TOTAL_CENTS) return c.json(TOTAL_TOO_LARGE, 400);
  // Starea „ciornă" se verifică ÎN update, nu doar înainte: între citire și scriere contul poate fi
  // emis din altă filă — atunci 0 rânduri, 409, iar pozițiile contului emis rămân neatinse.
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(paymentAccounts)
      .set({
        clientId: body.clientId ?? null,
        crmCompanyId: body.crmCompanyId ?? null,
        leadId: body.leadId ?? existing.leadId,
        series: body.series ?? existing.series,
        currency: body.currency ?? existing.currency,
        lang: body.lang ?? existing.lang,
        issueDate: body.issueDate ?? existing.issueDate,
        dueDate: body.dueDate ?? null,
        notes: body.notes ?? null,
        ...buyerValues(body),
        subtotalCents: totals.subtotalCents,
        vatCents: totals.vatCents,
        totalCents: totals.totalCents,
        updatedAt: new Date(),
      })
      .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.tenantId, tenantId), eq(paymentAccounts.status, "draft")))
      .returning();
    if (!row) return null;
    await writeItems(tx, id, body.items);
    return row;
  });
  if (!updated) return c.json({ error: "only_draft_editable" }, 409);
  return c.json({ data: updated });
});

paymentAccountRoutes.get("/:id/pdf", async (c) => {
  const tenantId = c.get("user").tenantId;
  const account = await loadAccount(tenantId, c.req.param("id"));
  if (!account) return c.json({ error: "not_found" }, 404);
  const [items, settings, issuer] = await Promise.all([
    db.select().from(paymentAccountItems).where(eq(paymentAccountItems.accountId, account.id)).orderBy(paymentAccountItems.position),
    loadSettings(tenantId),
    loadIssuer(tenantId),
  ]);
  let draftNumber: string | null = null;
  if (account.status === "draft") {
    const next = await peekNextNumber(tenantId, numberingOf(settings, account.series), new Date(account.issueDate).getFullYear(), account.id);
    draftNumber = next.documentNumber;
  }
  const lang = (["ro", "ru", "en"].includes(account.lang) ? account.lang : "ro") as PaymentAccountLang;
  try {
    const pdf = await renderPaymentAccountPdf(pdfData(account, items, issuer, draftNumber), await brandingFor(settings, issuer, lang));
    const base = `cont-de-plata-${account.documentNumber ?? "ciorna"}`;
    return pdfResponse(pdf, base, c.req.query("download") === "1");
  } catch (err) {
    console.error("[paymentAccounts] pdf failed:", err);
    return c.json({ error: "pdf_failed", message: "PDF-ul nu a putut fi generat." }, 500);
  }
});

const issueSchema = z
  .object({ documentNumber: z.string().trim().min(1).max(40).optional().nullable() })
  .optional();

paymentAccountRoutes.post("/:id/issue", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const raw = await c.req.json().catch(() => undefined);
  const parsed = issueSchema.safeParse(raw ?? undefined);
  if (!parsed.success) return c.json({ error: "invalid", message: parsed.error.issues[0]?.message }, 400);
  const manual = parsed.data?.documentNumber?.trim() || null;

  const account = await loadAccount(tenantId, id);
  if (!account) return c.json({ error: "not_found" }, 404);
  if (account.status !== "draft") return c.json({ error: "already_issued" }, 409);
  // Un cont de 0 lei ar consuma un număr din secvență pentru un act fără obiect (prins în browser).
  if (account.totalCents <= 0) {
    return c.json({ error: "empty_total", message: "Contul are totalul 0 — completează prețul pozițiilor înainte de emitere." }, 400);
  }

  const [settings, issuer] = await Promise.all([loadSettings(tenantId), loadIssuer(tenantId)]);
  const numbering = numberingOf(settings, account.series);
  const year = new Date(account.issueDate).getFullYear();

  let number: number | null;
  let documentNumber: string;
  if (manual) {
    const taken = await takenDocumentNumbers(tenantId, id);
    const takenNorm = new Set([...taken].map((t) => t.trim().toUpperCase()));
    // „CP-2026-5" și „cp-2026-0005" sunt ACELAȘI număr cu „CP-2026-0005": comparăm forma
    // canonică și numărul din secvență, nu doar textul exact.
    const n = parseManualNumber(numbering, manual, year);
    const canonical = n != null ? formatDocumentNumber(numbering, n, year) : null;
    const used = await usedNumbers(tenantId, numbering.series);
    const clash =
      takenNorm.has(manual.toUpperCase()) ||
      (canonical != null && takenNorm.has(canonical.toUpperCase())) ||
      (n != null && used.includes(n));
    if (clash) return c.json({ error: "number_taken", message: `Numărul ${manual} e deja folosit.` }, 409);
    // Intră în secvență doar un număr plauzibil: o greșeală de tastare („CP-2026-20260015")
    // ar fi mutat altfel toată numerotarea automată, ireversibil (secvența nu dă niciodată înapoi).
    const expected = nextSequenceNumber(used, numbering.start);
    const inSequence = n != null && n <= expected + MANUAL_JUMP_LIMIT && n <= 10_000_000;
    documentNumber = canonical && inSequence ? canonical : manual;
    number = inSequence ? n : null;
  } else {
    const used = await usedNumbers(tenantId, numbering.series);
    const floor = nextSequenceNumber(used, numbering.start) - 1;
    const taken = await takenDocumentNumbers(tenantId, id);
    // Rezervăm până găsim un număr pe care nu l-a luat deja cineva de mână.
    let reserved = await reserveSequence(tenantId, numbering.series, floor);
    let candidate = formatDocumentNumber(numbering, reserved, year);
    for (let guard = 0; taken.has(candidate) && guard < 1000; guard++) {
      reserved = await reserveSequence(tenantId, numbering.series, reserved);
      candidate = formatDocumentNumber(numbering, reserved, year);
    }
    number = reserved;
    documentNumber = candidate;
  }

  try {
    const [updated] = await db
      .update(paymentAccounts)
      .set({
        number,
        documentNumber,
        status: "issued",
        // Rechizitele se îngheață ACUM: ce era gol la ciornă poate fi completat între timp.
        ...sellerSnapshot(issuer),
        updatedAt: new Date(),
      })
      .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.status, "draft")))
      .returning();
    if (!updated) return c.json({ error: "already_issued" }, 409);
    if (manual && number != null) await bumpSequenceTo(tenantId, numbering.series, number);
    return c.json({ data: updated });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json({ error: "number_taken", message: `Numărul ${documentNumber} e deja folosit.` }, 409);
    }
    throw err;
  }
});

paymentAccountRoutes.post("/:id/duplicate", async (c) => {
  const tenantId = c.get("user").tenantId;
  const source = await loadAccount(tenantId, c.req.param("id"));
  if (!source) return c.json({ error: "not_found" }, 404);
  const rows = await db
    .select()
    .from(paymentAccountItems)
    .where(eq(paymentAccountItems.accountId, source.id))
    .orderBy(asc(paymentAccountItems.position));
  const settings = await loadSettings(tenantId);
  const today = new Date();
  const parsed = upsertSchema.safeParse({
    ...(pickBuyer(source as unknown as Record<string, unknown>) ?? { buyerName: source.buyerName }),
    leadId: source.leadId,
    series: source.series,
    currency: source.currency,
    lang: source.lang,
    notes: source.notes,
    issueDate: today.toISOString(),
    dueDate: settings.defaultDueDays > 0 ? new Date(today.getTime() + settings.defaultDueDays * 86_400_000).toISOString() : null,
    items: rows.map((r) => ({
      description: r.description,
      unit: r.unit,
      quantity: Number(r.quantity),
      unitPriceCents: r.unitPriceCents,
      vatRate: r.vatRate,
      productId: r.productId ?? null,
    })),
  });
  if (!parsed.success) return c.json({ error: "invalid", message: parsed.error.issues[0]?.message }, 400);
  const account = await createDraft(tenantId, parsed.data);
  return c.json({ data: account }, 201);
});

const statusSchema = z.object({ status: z.enum(["paid", "cancelled", "issued"]) });

paymentAccountRoutes.post("/:id/status", zValidator("json", statusSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { status } = c.req.valid("json");
  const account = await loadAccount(tenantId, c.req.param("id"));
  if (!account) return c.json({ error: "not_found" }, 404);
  // O ciornă nu are număr — „plătit"/„anulat" pe ea ar lăsa un cont fără identitate în registru.
  if (account.status === "draft") return c.json({ error: "issue_first", message: "Emite contul întâi." }, 409);
  const [updated] = await db
    .update(paymentAccounts)
    .set({ status, updatedAt: new Date() })
    .where(eq(paymentAccounts.id, account.id))
    .returning();
  return c.json({ data: updated });
});

paymentAccountRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const existing = await loadAccount(tenantId, c.req.param("id"));
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (existing.status !== "draft") return c.json({ error: "only_draft_deletable" }, 409);
  const deleted = await db
    .delete(paymentAccounts)
    .where(and(eq(paymentAccounts.id, existing.id), eq(paymentAccounts.status, "draft")))
    .returning({ id: paymentAccounts.id });
  // Emis între timp (altă filă): nu-l ștergem — ar lăsa o gaură în registrul numerelor.
  if (deleted.length === 0) return c.json({ error: "only_draft_deletable" }, 409);
  return c.json({ ok: true });
});
