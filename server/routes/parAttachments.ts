/**
 * PAR-104: Attachments (section 13) — upload + kind + describe
 * CORE: backlog/par/PAR-CORE.md §0.13
 * Mounted in server/app.ts: app.route("/api/par", parRoutes)
 * (these routes are mounted under parRoutes as /:id/attachments)
 *
 * Routes:
 *   POST   /api/par/:id/attachments            → upload attachment (base64 data URL)
 *   GET    /api/par/:id/attachments            → list attachments for PAR
 *   DELETE /api/par/:id/attachments/:attId     → delete attachment (author, draft/changes_requested only)
 *
 * Conținutul fișierelor stă în Supabase Storage (bucket `par-attachments`), nu în Postgres.
 * Rândurile de dinainte de 2026-09-12 mai au data-URL base64 în `file_url` și rămân citibile;
 * `loadAttachmentBytes` alege singur sursa.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { parRequests, parAttachments, parAudit, parPayers } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { isWorkspaceAdminRole } from "../lib/par/visibility";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { readUploadedDoc } from "../lib/ai/readUploadedDoc";
import { extractParParties } from "../lib/ai/parExtractor";
import { choosePayee } from "../lib/par/choosePayee";
import { checkPayerOnDocument } from "../lib/par/payerOnDocument";
import { ANALYSIS_VERSION, comparesAmount } from "../lib/par/reconcileScope";
import { randomUUID } from "node:crypto";
import { mayAccessPayer, mayAccessProject } from "../lib/par/projectScope";
import { attachmentPreviewUrl } from "../lib/par/attachmentUrls";
import { contentDisposition } from "../lib/http/contentDisposition";
import {
  PAR_ATTACHMENT_BUCKET,
  loadAttachmentBytes,
  parseDataUrl,
  storeAttachmentBytes,
} from "../lib/par/attachmentStore";
import { downloadObject, removeObjects, signUploads } from "../lib/storage/objectStore";
import { isSafeTenantObjectPath } from "../lib/storage/safePath";
import { MAX_ATTACHMENT_BYTES } from "../../src/lib/par/attachmentLimits";
import type { Context } from "hono";

export const parAttachmentsRoutes = new Hono<{ Variables: AuthVariables }>();
parAttachmentsRoutes.use("*", requireAuth);
parAttachmentsRoutes.use("/:parId/:action/*", parUuidGuard("parId"));
// The attachment id is a uuid too — `DELETE /api/par/<uuid>/attachments/not-a-uuid` would
// otherwise reach the uuid comparison and 500 (same class as the parId guard above).
parAttachmentsRoutes.use("/:parId/attachments/:attId", parUuidGuard("attId"));
parAttachmentsRoutes.use("/:parId/attachments/:attId/*", parUuidGuard("attId"));

/**
 * What a dossier may carry. Broad on purpose — the supporting evidence for a payment is
 * whatever the counterparty sent: a scanned act, a PowerPoint offer, a CSV price list.
 *
 * SVG is deliberately NOT here even though it is an image: this endpoint serves
 * attachments back with `Content-Disposition: inline`, and an SVG is a script-bearing
 * document, so an inline preview would run the uploader's JS on our origin.
 */
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  // Images
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
  // Word / Excel / PowerPoint — legacy + OOXML
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // OpenDocument (LibreOffice — common in public institutions here)
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  // Plain data + archives
  "text/plain",
  "text/csv",
  "application/rtf",
  "application/zip",
  "application/x-zip-compressed",
];

// PARQA-021: the data-URL MIME prefix is CLIENT-controlled, so an attacker can label arbitrary bytes
// "data:application/pdf;base64,…". Verify the actual decoded bytes match the claimed type via magic
// numbers (file signatures). Returns true if the content plausibly matches an allowed type.
function magicBytesMatch(dataUrl: string, mime: string): boolean {
  const m = dataUrl.match(/^data:[^;]*;base64,(.*)$/s);
  if (!m) return false;
  try {
    return magicBytesMatchBuffer(Buffer.from(m[1].slice(0, 32), "base64"), mime);
  } catch {
    return false;
  }
}

/**
 * Aceeași verificare, pe octeți. Calea de upload direct în Storage nu mai vede niciun data-URL:
 * browserul urcă binarul, iar serverul descarcă obiectul și îi controlează primii octeți înainte
 * să scrie rândul. Tipul declarat rămâne controlat de client oriunde, deci verificarea trebuie să
 * existe pe ambele căi.
 */
export function magicBytesMatchBuffer(bytes: Buffer, mime: string): boolean {
  const b = bytes.subarray(0, 24); // destul pentru fiecare semnătură de mai jos
  if (b.length < 4) return false;
  const at = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  const atOffset = (offset: number, ...sig: number[]) => sig.every((v, i) => b[offset + i] === v);
  const isZip = () => at(0x50, 0x4b, 0x03, 0x04) || at(0x50, 0x4b, 0x05, 0x06) || at(0x50, 0x4b, 0x07, 0x08);
  const isOle2 = () => at(0xd0, 0xcf, 0x11, 0xe0); // legacy .doc/.xls/.ppt compound file
  switch (mime) {
    case "application/pdf":
      return at(0x25, 0x50, 0x44, 0x46); // %PDF
    case "image/png":
      return at(0x89, 0x50, 0x4e, 0x47); // \x89PNG
    case "image/jpeg":
    case "image/jpg":
      return at(0xff, 0xd8, 0xff); // JPEG SOI
    case "image/gif":
      return at(0x47, 0x49, 0x46, 0x38); // GIF8
    case "image/webp":
      return at(0x52, 0x49, 0x46, 0x46) && atOffset(8, 0x57, 0x45, 0x42, 0x50); // RIFF….WEBP
    case "image/bmp":
      return at(0x42, 0x4d); // BM
    case "image/tiff":
      return at(0x49, 0x49, 0x2a, 0x00) || at(0x4d, 0x4d, 0x00, 0x2a); // II*. / MM.*
    case "image/heic":
    case "image/heif":
      return atOffset(4, 0x66, 0x74, 0x79, 0x70); // ISO-BMFF "ftyp" box at offset 4
    // Every OOXML and OpenDocument file is a ZIP container — the signature can only
    // prove "this is a zip", which is exactly what these formats are.
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    case "application/vnd.oasis.opendocument.text":
    case "application/vnd.oasis.opendocument.spreadsheet":
    case "application/vnd.oasis.opendocument.presentation":
    case "application/zip":
    case "application/x-zip-compressed":
      return isZip();
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
      // Legacy Office is OLE2, but Word/Excel also happily save OOXML under the old
      // MIME when a browser guesses the type from the extension — accept both.
      return isOle2() || isZip();
    case "application/rtf":
      return at(0x7b, 0x5c, 0x72, 0x74); // {\rt
    // Text formats have no signature by design; the size + type allowlist is the guard,
    // and they are served with `nosniff` so a mislabeled one cannot execute.
    case "text/plain":
    case "text/csv":
      return true;
    default:
      return false;
  }
}

// Max file size: 10 MB → ~13.4M base64 chars
const MAX_FILE_URL_LEN = 15_000_000;
const MAX_FILE_NAME_LEN = 500;
// VM1-06: max number of attachments per PAR (contract, act, oferte, factură …)
const MAX_ATTACHMENTS_PER_PAR = 10;

const parAttachmentKindValues = [
  "act_of_receipt",
  "contract",
  "quotation",
  "invoice",
  // Anexele standard din formularul PAR (migrarea 0140) — trebuie să rămână în sincron cu
  // `parAttachmentKindEnum` (server/db/schema/par.ts) și cu `ParAttachmentKind` (src/lib/api/par.ts).
  "participants_list",
  "narrative_report",
  "deliverables",
  "par_pdf",
  "payment_order",
  "other",
] as const;

const uploadAttachmentSchema = z.object({
  file_name: z.string().min(1).max(MAX_FILE_NAME_LEN),
  // base64 data URL: "data:<mime>;base64,<data>"
  file_url: z.string().min(1).max(MAX_FILE_URL_LEN),
  mime: z.string().max(100),
  kind: z.enum(parAttachmentKindValues).default("other"),
  /** Doar pentru kind='other': ce document e, în clar. Ignorat pentru celelalte tipuri. */
  kind_other: z.string().trim().max(200).optional(),
  size_bytes: z.number().int().min(0).default(0),
});

/** Editable statuses — same as in par.ts */
const EDITABLE_STATUSES = ["draft", "changes_requested"] as const;

/**
 * Poate utilizatorul să adauge un fișier la dosarul ăsta, și mai e loc?
 *
 * Aceleași reguli pentru toate cele trei căi de încărcare (upload base64, semnare de URL,
 * finalizare) — dacă ar trăi copiate în fiecare, ar diverge la prima schimbare de flux, iar
 * divergența ar apărea exact pe calea cea mai puțin testată. Întoarce `null` când e permis, sau
 * răspunsul de eroare gata format.
 */
async function guardAttachmentWrite(
  c: Context<{ Variables: AuthVariables }>,
  parId: string,
): Promise<
  | { ok: true; par: typeof parRequests.$inferSelect }
  | { ok: false; response: Response }
> {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  if (!par) return { ok: false, response: c.json({ error: "not_found" }, 404) };
  if (!(await hasScopedDossierAccess(user, par)))
    return { ok: false, response: c.json({ error: "not_found" }, 404) };

  // Autorul atașează cât timp cererea e editabilă (draft/changes_requested). ÎN PLUS,
  // finanțele/par_admin pot pune dovada plății la etapa de finanțe — dovada trebuie să stea cu
  // cererea, nu separat.
  const roles = await getUserPARRoles(user.id, tenantId);
  const isFinance = roles.includes("finance") || roles.includes("par_admin");
  const FINANCE_STAGE_STATUSES = ["approved", "in_finance", "reapproval_required", "paid"];
  const authorCanEdit =
    par.requestedByUserId === user.id &&
    EDITABLE_STATUSES.includes(par.status as typeof EDITABLE_STATUSES[number]);
  const financeCanAttach = isFinance && FINANCE_STAGE_STATUSES.includes(par.status);
  if (!authorCanEdit && !financeCanAttach) {
    return {
      ok: false,
      response: c.json({ error: `forbidden: cannot add attachments (status '${par.status}')` }, 403),
    };
  }

  // VM1-06: plafonul se impune pe server (interfața îl păzește și ea, dar serverul e sursa de
  // adevăr — al 10-lea fișier e în regulă, al 11-lea e refuzat).
  const existing = await db
    .select({ id: parAttachments.id })
    .from(parAttachments)
    .where(and(eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId)));
  if (existing.length >= MAX_ATTACHMENTS_PER_PAR) {
    return {
      ok: false,
      response: c.json(
        { error: "too_many_attachments", detail: `Maxim ${MAX_ATTACHMENTS_PER_PAR} fișiere per cerere.` },
        409
      ),
    };
  }

  return { ok: true, par };
}

async function hasScopedDossierAccess(
  user: { id: string; tenantId: string; role: string },
  par: { requestedByUserId: string; projectId: string | null; payerId: string | null; status?: string | null },
): Promise<boolean> {
  if (par.requestedByUserId === user.id) return true;
  const roles = await getUserPARRoles(user.id, user.tenantId, user.role);
  if (!roles.some((role) => ["approver", "finance", "par_admin"].includes(role))) return false;
  // The attachments ARE the sensitive documents (contracts, bank papers). An unsubmitted draft has
  // not been routed to anybody, so it stays with its author — server/lib/par/visibility.ts.
  if (par.status === "draft" && !isWorkspaceAdminRole(user.role)) return false;
  return par.projectId
    ? mayAccessProject(user.id, user.tenantId, par.projectId, user.role)
    : mayAccessPayer(user.id, user.tenantId, par.payerId, user.role);
}

// ─── GET /:parId/attachments ──────────────────────────────────────────────────

parAttachmentsRoutes.get("/:parId/attachments", async (c) => {
  const { parId } = c.req.param();
  const user = c.get("user");
  const tenantId = user.tenantId;

  // Verify PAR exists and belongs to tenant
  const [par] = await db
    .select({ id: parRequests.id, requestedByUserId: parRequests.requestedByUserId, projectId: parRequests.projectId, payerId: parRequests.payerId, status: parRequests.status })
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  if (!par) return c.json({ error: "not_found" }, 404);

  if (!(await hasScopedDossierAccess(user, par))) return c.json({ error: "not_found" }, 404);

  const items = await db
    .select({
      id: parAttachments.id,
      fileName: parAttachments.fileName,
      kind: parAttachments.kind,
      kindOther: parAttachments.kindOther,
      uploadedBy: parAttachments.uploadedBy,
      createdAt: parAttachments.createdAt,
      // Tipul și mărimea sunt coloane reale de la mutarea în Storage. Înainte interfața le
      // deducea din prefixul data-URL-ului, ceea ce însemna că lista trebuia să care conținutul
      // fișierului doar ca să se afle dacă e PDF sau imagine.
      mimeType: parAttachments.mimeType,
      sizeBytes: parAttachments.sizeBytes,
      analysis: parAttachments.analysis,
    })
    .from(parAttachments)
    .where(and(eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId)));

  // PERF (audit 2026-08-29): `file_url` e un data-URL base64 de megabyți. Lista îl trimitea
  // integral pentru fiecare fișier, deși deschiderea se face prin ruta de preview de mai jos.
  // `fileUrl` rămâne în răspuns, dar ca adresă — nu ca fișierul însuși.
  return c.json({ items: items.map((a) => ({ ...a, fileUrl: attachmentPreviewUrl(parId, a.id) })) });
});

type ReconcileCheck = { field: string; expected: string | number | null; found: string | number | null; matches: boolean | null };
const norm = (value: string | null | undefined) => (value ?? "").replace(/\s/g, "").toLocaleLowerCase("ro");

/**
 * Of every party the document names, the one this PAR is about — matched on the strongest
 * available identifier (fiscal id, then account, then name), falling back to the extractor's
 * recommendation when nothing lines up (a genuinely unrelated document, which SHOULD then
 * report mismatches).
 */
export function matchPartyToPar(
  choice: ReturnType<typeof choosePayee>,
  par: Pick<typeof parRequests.$inferSelect, "payeeName" | "payeeIdnp" | "payeeIban">,
) {
  const parties = choice.options.length ? choice.options : choice.payee ? [choice.payee] : [];
  const by = (pick: (p: (typeof parties)[number]) => string | null | undefined, want: string | null) =>
    want ? parties.find((p) => norm(pick(p)) && norm(pick(p)) === norm(want)) : undefined;
  return (
    by((p) => p.idno, par.payeeIdnp) ??
    by((p) => p.iban, par.payeeIban) ??
    by((p) => p.name, par.payeeName) ??
    choice.payee
  );
}

async function analyzeAttachmentAgainstPar(
  par: typeof parRequests.$inferSelect,
  attachment: typeof parAttachments.$inferSelect,
  actorUserId: string,
) {
  const { bytes: buffer, mime } = await loadAttachmentBytes(attachment);
  // ACEEAȘI citire ca la prefill (`readUploadedDoc`). Varianta locală de dinainte făcea
  // `toString("utf8")` pe orice nu era PDF sau imagine: un .docx/.xlsx e un ZIP, deci extractorul
  // primea gunoi binar și raporta „sumă: document 0" pe un act care scria 6000 MDL. Un PDF scanat
  // (fără strat de text) ajunge acum la model ca fișier, nu ca text gol.
  const { rawText, imageDataUrl, fileDataUrl } = await readUploadedDoc(buffer, attachment.fileName, mime);
  const extraction = await extractParParties(rawText, {
    imageDataUrl, fileDataUrl, tenantId: par.tenantId, userId: actorUserId, prefillId: randomUUID(),
  });
  const choice = choosePayee(extraction, null);
  // Compare against the party the PAR actually names, not the one the extractor would recommend.
  // A contract names both sides; `choosePayee` picks the one it thinks is paid, which on a
  // document where the tenant is the provider is the OTHER party — so every requisite check came
  // back "neverificat" (and the beneficiary a false mismatch) on a perfectly matching document.
  const payee = matchPartyToPar(choice, par);
  const amountCents = choice.amountCents === 0 ? null : choice.amountCents;

  // VM5-04 („plătitorul e altul"): pe cine e emis documentul? Până acum se verifica doar CĂTRE
  // cine se plătește, deci factura firmei-soră trecea fără o vorbă. Entitatea plătitoare a cererii
  // vine din `par_payers`; regula care evită alarmele false stă în `payerOnDocument.ts`.
  const [payerRow] = par.payerId
    ? await db.select({
        name: parPayers.name, legalName: parPayers.legalName, idno: parPayers.idno, iban: parPayers.iban,
      }).from(parPayers).where(and(eq(parPayers.id, par.payerId), eq(parPayers.tenantId, par.tenantId)))
    : [];
  const payerCheck = checkPayerOnDocument(
    choice.options.length ? choice.options : choice.payee ? [choice.payee] : [],
    payerRow ?? null,
    payee ?? null,
  );
  // Suma se compară doar pe documentele care chiar declară suma de plată (vezi `reconcileScope`):
  // pe un contract-cadru, pe o listă de participanți sau pe un buletin scanat, „suma nu corespunde"
  // e zgomot garantat, iar zgomotul face avertismentele invizibile.
  const amountChecks: ReconcileCheck[] = comparesAmount(attachment.kind)
    ? [
        // 0 nu e o sumă citită din act, ci o extragere eșuată — se raportează „nedetectat", nu diferență.
        { field: "sumă", expected: par.totalEstimatedCents, found: amountCents, matches: amountCents == null ? null : amountCents === par.totalEstimatedCents },
        { field: "valută", expected: par.currency, found: choice.currency, matches: !choice.currency ? null : choice.currency === par.currency },
      ]
    : [];

  const checks: ReconcileCheck[] = [
    ...amountChecks,
    { field: "beneficiar", expected: par.payeeName, found: payee?.name ?? null, matches: !payee?.name || !par.payeeName ? null : norm(payee.name) === norm(par.payeeName) },
    { field: "IDNO/IDNP", expected: par.payeeIdnp, found: payee?.idno ?? null, matches: !payee?.idno || !par.payeeIdnp ? null : norm(payee.idno) === norm(par.payeeIdnp) },
    { field: "IBAN", expected: par.payeeIban, found: payee?.iban ?? null, matches: !payee?.iban || !par.payeeIban ? null : norm(payee.iban) === norm(par.payeeIban) },
    { field: "bancă", expected: par.payeeBank, found: payee?.bank ?? null, matches: !payee?.bank || !par.payeeBank ? null : norm(payee.bank) === norm(par.payeeBank) },
    { field: "plătitor", expected: payerRow?.name ?? null, found: payerCheck.found, matches: payerCheck.matches },
  ];
  const warnings = checks.filter((check) => check.matches === false).length;
  // `version`: interfața ia în serios (bandă de avertisment, confirmare la aprobare) doar analizele
  // făcute cu regulile curente. Verdictele mai vechi rămân vizibile, dar nu blochează o semnătură.
  const analysis = {
    version: ANALYSIS_VERSION,
    status: warnings ? "warning" : "match",
    warnings,
    checks,
    analyzedAt: new Date().toISOString(),
  };
  await db.transaction(async (tx) => {
    await tx.update(parAttachments).set({ analysis: JSON.stringify(analysis), updatedAt: new Date() })
      .where(and(eq(parAttachments.id, attachment.id), eq(parAttachments.tenantId, par.tenantId)));
    await tx.insert(parAudit).values({
      tenantId: par.tenantId,
      parId: par.id,
      actorUserId,
      event: warnings ? "document_reconciliation_warning" : "document_reconciliation_match",
      detail: JSON.stringify({ attachmentId: attachment.id, fileName: attachment.fileName, warnings, checks }),
    });
  });
  return analysis;
}

/** Analyze one uploaded document and compare its financial identity against the current PAR. */
parAttachmentsRoutes.post("/:parId/attachments/:attId/reconcile", async (c) => {
  const { parId, attId } = c.req.param();
  const user = c.get("user");
  const tenantId = user.tenantId;
  const [par] = await db.select().from(parRequests).where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);
  if (!(await hasScopedDossierAccess(user, par))) return c.json({ error: "not_found" }, 404);
  const [attachment] = await db.select().from(parAttachments).where(and(
    eq(parAttachments.id, attId), eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId),
  ));
  if (!attachment) return c.json({ error: "not_found" }, 404);
  try {
    return c.json({ analysis: await analyzeAttachmentAgainstPar(par, attachment, user.id) });
  } catch {
    return c.json({ error: "analysis_unavailable" }, 422);
  }
});

// Browser-safe inline preview. This avoids top-level data: navigation (blocked by Chrome) and keeps
// authorization on the server. PDF and images render directly; office files keep their real name.
parAttachmentsRoutes.get("/:parId/attachments/:attId/preview", async (c) => {
  const { parId, attId } = c.req.param();
  const user = c.get("user");
  const tenantId = user.tenantId;
  const [par] = await db.select({ requestedByUserId: parRequests.requestedByUserId, projectId: parRequests.projectId, payerId: parRequests.payerId, status: parRequests.status }).from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);
  if (!(await hasScopedDossierAccess(user, par))) return c.json({ error: "not_found" }, 404);

  const [attachment] = await db.select().from(parAttachments).where(and(
    eq(parAttachments.id, attId), eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId),
  ));
  if (!attachment) return c.json({ error: "not_found" }, 404);
  if (attachment.fileUrl && /^https?:\/\//i.test(attachment.fileUrl)) return c.redirect(attachment.fileUrl);
  let bytes: Buffer;
  let mime: string;
  try {
    ({ bytes, mime } = await loadAttachmentBytes(attachment));
  } catch {
    return c.json({ error: "preview_unavailable" }, 422);
  }
  c.header("Content-Type", mime);
  // Numele merge prin RFC 6266: un antet HTTP nu poate transporta „ă", iar înainte orice document
  // botezat românește arunca la runtime, iar vizualizatorul arăta „eroarea 500" (incident 10.09.2026).
  c.header("Content-Disposition", contentDisposition("inline", attachment.fileName, "atasament"));
  // Conținutul unui atașament nu se schimbă niciodată pentru același id (o modificare = alt
  // atașament), iar de la auditul din 29.08.2026 ruta asta e singura cale prin care interfața
  // deschide fișierele — deci merită o memorare reală, nu 60 de secunde. `private`: rămâne în
  // browserul unui singur utilizator, verificarea de acces s-a făcut deja mai sus.
  c.header("Cache-Control", "private, max-age=3600");
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(new Uint8Array(bytes));
});

// ─── POST /:parId/attachments ─────────────────────────────────────────────────

parAttachmentsRoutes.post(
  "/:parId/attachments",
  zValidator("json", uploadAttachmentSchema),
  async (c) => {
    const { parId } = c.req.param();
    const user = c.get("user");
    const tenantId = user.tenantId;
    const body = c.req.valid("json");

    const guard = await guardAttachmentWrite(c, parId);
    if (!guard.ok) return guard.response;
    const { par } = guard;

    // Validate MIME type from data URL prefix or mime field
    const mimeFromDataUrl = body.file_url.match(/^data:([^;]+);base64,/)?.[1];
    const effectiveMime = mimeFromDataUrl ?? body.mime;
    if (!ALLOWED_MIME_TYPES.includes(effectiveMime)) {
      return c.json(
        {
          error: "invalid_file_type",
          detail: `Allowed: PDF, imagini, Word, Excel, PowerPoint, OpenDocument, text/CSV, ZIP. Got: ${effectiveMime}`,
        },
        400
      );
    }

    // PARQA-021: the declared MIME is client-controlled — reject if the real bytes don't match it.
    if (!magicBytesMatch(body.file_url, effectiveMime)) {
      return c.json(
        {
          error: "file_content_mismatch",
          detail: "Conținutul fișierului nu corespunde tipului declarat.",
        },
        400
      );
    }

    // Conținutul pleacă în Storage; în baza de date rămâne doar calea. Dacă Storage-ul nu e
    // configurat sau refuză, upload-ul EȘUEAZĂ — nu ne întoarcem în tăcere la base64 în DB, că
    // exact asta a umplut baza. Un 503 clar e mai bun decât o regresie invizibilă.
    const raw = parseDataUrl(body.file_url);
    if (!raw) return c.json({ error: "invalid_file", detail: "Fișierul nu a ajuns întreg." }, 400);
    let stored;
    try {
      stored = await storeAttachmentBytes(tenantId, body.file_name, raw.bytes, effectiveMime);
    } catch {
      return c.json(
        { error: "storage_unavailable", detail: "Fișierul nu a putut fi salvat. Încearcă din nou." },
        503
      );
    }

    const [attachment] = await db
      .insert(parAttachments)
      .values({
        tenantId,
        parId,
        storagePath: stored.storagePath,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        fileUrl: null,
        fileName: body.file_name,
        kind: body.kind,
        // Numele liber are sens doar pentru „Altul" — pe restul tipurilor ar dubla eticheta.
        kindOther: body.kind === "other" && body.kind_other ? body.kind_other : null,
        uploadedBy: user.id,
      })
      .returning();

    // Reconciliation is best-effort: an unavailable AI provider must never make a valid
    // document upload fail. When it succeeds, the response already carries the comparison.
    try {
      const analysis = await analyzeAttachmentAgainstPar(par, attachment, user.id);
      return c.json({ ...attachment, analysis: JSON.stringify(analysis) }, 201);
    } catch {
      return c.json(attachment, 201);
    }
  }
);

// ─── Upload direct în Storage (fișiere mari) ─────────────────────────────────
//
// De ce există pe lângă calea base64 de mai sus: corpul unei cereri către funcția serverless de pe
// Vercel e plafonat la ~4,5 MB, iar base64 umflă fișierul cu ~33%. Rezultatul era că orice fișier
// peste ~3,3 MB pica cu un 413 fără explicație, deși interfața promitea 10 MB — motiv pentru care
// plafonul din interfață fusese coborât la 3 MB ca oprire onestă (`src/lib/par/attachmentLimits.ts`).
//
// Aici binarul nu mai trece deloc prin funcția noastră: browserul îl urcă direct în Supabase
// Storage printr-un URL semnat de scurtă durată, iar prin server trec doar două cereri JSON mici.
// Plafonul de platformă dispare complet — nu urcă de la 3 la 4 MB, ci nu mai există.
//
// Secvența, și de ce în ordinea asta:
// Căile stau sub `/attachment-upload/`, nu sub `/attachments/`, înadins: garda `parUuidGuard("attId")`
// e montată pe `/:parId/attachments/:attId` și ar citi „sign" ca identificator invalid, întorcând 404
// pe o rută perfect validă. Garda e corectă și nu se slăbește — se ocolește cu un segment propriu.
//
//   1. `sign`     — verifică dreptul de a atașa ÎNAINTE să dea un URL de scriere;
//   2. browserul PUT-ează fișierul direct în Storage;
//   3. `finalize` — descarcă obiectul, îi verifică octeții reali, abia apoi scrie rândul.
// Verificarea la pasul 3 nu e opțională: între 1 și 3 clientul poate urca ORICE la calea semnată,
// deci tipul declarat rămâne o afirmație neverificată până când serverul se uită la conținut.

const signUploadSchema = z.object({
  file_name: z.string().min(1).max(MAX_FILE_NAME_LEN),
  mime: z.string().max(100),
  size_bytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
});

parAttachmentsRoutes.post(
  "/:parId/attachment-upload/sign",
  zValidator("json", signUploadSchema),
  async (c) => {
    const { parId } = c.req.param();
    const user = c.get("user");
    const body = c.req.valid("json");

    const guard = await guardAttachmentWrite(c, parId);
    if (!guard.ok) return guard.response;

    if (!ALLOWED_MIME_TYPES.includes(body.mime)) {
      return c.json(
        {
          error: "invalid_file_type",
          detail: `Allowed: PDF, imagini, Word, Excel, PowerPoint, OpenDocument, text/CSV, ZIP. Got: ${body.mime}`,
        },
        400
      );
    }

    try {
      const [signed] = await signUploads(PAR_ATTACHMENT_BUCKET, user.tenantId, [
        { fileName: body.file_name },
      ]);
      return c.json({ path: signed.path, signed_url: signed.signedUrl });
    } catch {
      return c.json(
        { error: "storage_unavailable", detail: "Nu pot pregăti încărcarea. Încearcă din nou." },
        503
      );
    }
  }
);

const finalizeUploadSchema = z.object({
  path: z.string().min(1).max(512),
  file_name: z.string().min(1).max(MAX_FILE_NAME_LEN),
  mime: z.string().max(100),
  kind: z.enum(parAttachmentKindValues).default("other"),
  kind_other: z.string().trim().max(200).optional(),
});

parAttachmentsRoutes.post(
  "/:parId/attachment-upload/finalize",
  zValidator("json", finalizeUploadSchema),
  async (c) => {
    const { parId } = c.req.param();
    const user = c.get("user");
    const tenantId = user.tenantId;
    const body = c.req.valid("json");

    const guard = await guardAttachmentWrite(c, parId);
    if (!guard.ok) return guard.response;
    const { par } = guard;

    // Calea vine de la client. Un simplu `startsWith(tenantId)` nu e o gardă: normalizarea de URL
    // colapsează `..` înainte ca cererea să plece, deci „<tenant A>/../<tenant B>/x.pdf" ar trece
    // prefixul și ar citi obiectul altui tenant (auditul din 29.08.2026). Forma se impune, nu se
    // presupune.
    if (!isSafeTenantObjectPath(body.path, tenantId)) {
      return c.json({ error: "invalid_path" }, 400);
    }

    if (!ALLOWED_MIME_TYPES.includes(body.mime)) {
      return c.json({ error: "invalid_file_type" }, 400);
    }

    // Obiectul urcat e conținut necontrolat până în clipa asta. Îl aducem și îl judecăm după
    // octeți; dacă nu trece, îl ștergem — altfel un fișier respins ar rămâne să ocupe spațiu.
    let bytes: Buffer;
    try {
      bytes = await downloadObject(PAR_ATTACHMENT_BUCKET, body.path);
    } catch {
      return c.json(
        { error: "upload_not_found", detail: "Fișierul nu a ajuns în întregime. Încearcă din nou." },
        400
      );
    }

    const reject = async (error: string, detail: string) => {
      await removeObjects(PAR_ATTACHMENT_BUCKET, [body.path]);
      return c.json({ error, detail }, 400);
    };

    if (bytes.byteLength === 0) {
      return reject("empty_file", "Fișierul e gol.");
    }
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return reject(
        "file_too_large",
        `Fișierul depășește ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`
      );
    }
    if (!magicBytesMatchBuffer(bytes, body.mime)) {
      return reject("file_content_mismatch", "Conținutul fișierului nu corespunde tipului declarat.");
    }

    const [attachment] = await db
      .insert(parAttachments)
      .values({
        tenantId,
        parId,
        storagePath: body.path,
        mimeType: body.mime,
        sizeBytes: bytes.byteLength,
        fileUrl: null,
        fileName: body.file_name,
        kind: body.kind,
        kindOther: body.kind === "other" && body.kind_other ? body.kind_other : null,
        uploadedBy: user.id,
      })
      .returning();

    // Analiza NU mai rulează aici, deși e ieftin de scris pe același drum.
    //
    // Ținea răspunsul 5–10 secunde (extragerea textului din PDF + un apel la model), iar interfața
    // adaugă fișierul în listă abia când răspunsul vine: omul alegea documentul și rămânea cu un
    // ecran în care nu se schimba nimic, fără să știe dacă a ajuns sau nu („is your document
    // uploaded or not?", owner, 13.09.2026). `finalize` confirmă acum doar ce poate confirma
    // imediat — fișierul E în dosar — iar verdictul AI vine separat, prin
    // `POST /:parId/attachments/:attId/reconcile`, cu starea lui vizibilă lângă fișier.
    //
    // Pe deasupra, analiza rula de DOUĂ ori pentru fiecare fișier: o dată aici și încă o dată în
    // `reconcile`-ul pe care clientul îl cerea oricum imediat după (ParCreateForm). Al doilea apel
    // suprascria rezultatul primului, deci primul era plătit degeaba — la fel și pentru dovezile
    // de plată, unde verdictul nici nu se afișează nicăieri.
    return c.json(attachment, 201);
  }
);

// ─── DELETE /:parId/attachments/:attId ───────────────────────────────────────

parAttachmentsRoutes.delete("/:parId/attachments/:attId", async (c) => {
  const { parId, attId } = c.req.param();
  const user = c.get("user");
  const tenantId = user.tenantId;

  // Verify PAR exists + tenant scope
  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  if (!par) return c.json({ error: "not_found" }, 404);
  if (!(await hasScopedDossierAccess(user, par))) return c.json({ error: "not_found" }, 404);

  // Load the attachment first so we can check who uploaded it.
  const [att] = await db
    .select({ id: parAttachments.id, uploadedBy: parAttachments.uploadedBy })
    .from(parAttachments)
    .where(
      and(
        eq(parAttachments.id, attId),
        eq(parAttachments.parId, parId),
        eq(parAttachments.tenantId, tenantId)
      )
    );
  if (!att) return c.json({ error: "not_found" }, 404);

  const roles = await getUserPARRoles(user.id, tenantId);
  const isFinance = roles.includes("finance") || roles.includes("par_admin");
  const FINANCE_STAGE_STATUSES = ["approved", "in_finance", "reapproval_required", "paid"];

  // The author may delete their own attachments while the PAR is editable.
  const authorCanDelete =
    par.requestedByUserId === user.id &&
    EDITABLE_STATUSES.includes(par.status as typeof EDITABLE_STATUSES[number]);
  // PARQA-021: finance/par_admin may delete an attachment THEY uploaded at the finance stage (e.g. a
  // wrong payment proof). Before, an uploader had no way to remove their own mistaken upload.
  const financeCanDelete =
    isFinance && att.uploadedBy === user.id && FINANCE_STAGE_STATUSES.includes(par.status);

  if (!authorCanDelete && !financeCanDelete) {
    return c.json({ error: "forbidden: not allowed to delete this attachment" }, 403);
  }

  const deleted = await db
    .delete(parAttachments)
    .where(
      and(
        eq(parAttachments.id, attId),
        eq(parAttachments.parId, parId),
        eq(parAttachments.tenantId, tenantId)
      )
    )
    .returning();

  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);

  // Rândul a plecat; obiectul trebuie să plece după el, altfel fișierele șterse din interfață ar
  // ocupa în continuare spațiu în Storage la nesfârșit. Best-effort înadins: dacă ștergerea din
  // Storage pică, rândul e deja dus și cererea nu trebuie să eșueze pentru un obiect orfan.
  const orphans = deleted.map((row) => row.storagePath).filter((p): p is string => !!p);
  if (orphans.length) await removeObjects(PAR_ATTACHMENT_BUCKET, orphans);

  return c.json({ deleted: true });
});
