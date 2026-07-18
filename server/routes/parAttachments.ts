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
 * Reuses the same base64 data-URL storage pattern as lead/contract attachments.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { parRequests, parAttachments, parAudit } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { extractPdfText } from "../lib/ai/pdfText";
import { extractParParties } from "../lib/ai/parExtractor";
import { choosePayee } from "../lib/par/choosePayee";
import { randomUUID } from "node:crypto";
import { mayAccessPayer, mayAccessProject } from "../lib/par/projectScope";

export const parAttachmentsRoutes = new Hono<{ Variables: AuthVariables }>();
parAttachmentsRoutes.use("*", requireAuth);
parAttachmentsRoutes.use("/:parId/:action/*", parUuidGuard("parId"));

// Allowed MIME types aligned with the rest of the repo
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// PARQA-021: the data-URL MIME prefix is CLIENT-controlled, so an attacker can label arbitrary bytes
// "data:application/pdf;base64,…". Verify the actual decoded bytes match the claimed type via magic
// numbers (file signatures). Returns true if the content plausibly matches an allowed type.
function magicBytesMatch(dataUrl: string, mime: string): boolean {
  const m = dataUrl.match(/^data:[^;]*;base64,(.*)$/s);
  if (!m) return false;
  let b: Buffer;
  try {
    b = Buffer.from(m[1].slice(0, 32), "base64"); // ~24 bytes — enough for every signature below
  } catch {
    return false;
  }
  if (b.length < 4) return false;
  const at = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  switch (mime) {
    case "application/pdf":
      return at(0x25, 0x50, 0x44, 0x46); // %PDF
    case "image/png":
      return at(0x89, 0x50, 0x4e, 0x47); // \x89PNG
    case "image/jpeg":
    case "image/jpg":
      return at(0xff, 0xd8, 0xff); // JPEG SOI
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return at(0x50, 0x4b, 0x03, 0x04) || at(0x50, 0x4b, 0x05, 0x06); // ZIP container (docx/xlsx)
    case "application/msword":
    case "application/vnd.ms-excel":
      return at(0xd0, 0xcf, 0x11, 0xe0); // OLE2 compound (legacy .doc/.xls)
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
  size_bytes: z.number().int().min(0).default(0),
});

/** Editable statuses — same as in par.ts */
const EDITABLE_STATUSES = ["draft", "changes_requested"] as const;

async function hasScopedDossierAccess(
  user: { id: string; tenantId: string; role: string },
  par: { requestedByUserId: string; projectId: string | null; payerId: string | null },
): Promise<boolean> {
  if (par.requestedByUserId === user.id) return true;
  const roles = await getUserPARRoles(user.id, user.tenantId, user.role);
  if (!roles.some((role) => ["approver", "finance", "par_admin"].includes(role))) return false;
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
    .select({ id: parRequests.id, requestedByUserId: parRequests.requestedByUserId, projectId: parRequests.projectId, payerId: parRequests.payerId })
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  if (!par) return c.json({ error: "not_found" }, 404);

  if (!(await hasScopedDossierAccess(user, par))) return c.json({ error: "not_found" }, 404);

  const items = await db
    .select({
      id: parAttachments.id,
      fileName: parAttachments.fileName,
      kind: parAttachments.kind,
      uploadedBy: parAttachments.uploadedBy,
      createdAt: parAttachments.createdAt,
      // Note: fileUrl intentionally included for download
      fileUrl: parAttachments.fileUrl,
      analysis: parAttachments.analysis,
    })
    .from(parAttachments)
    .where(and(eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId)));

  return c.json({ items });
});

type ReconcileCheck = { field: string; expected: string | number | null; found: string | number | null; matches: boolean | null };
const norm = (value: string | null | undefined) => (value ?? "").replace(/\s/g, "").toLocaleLowerCase("ro");

async function analyzeAttachmentAgainstPar(
  par: typeof parRequests.$inferSelect,
  attachment: typeof parAttachments.$inferSelect,
  actorUserId: string,
) {
  const match = attachment.fileUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) throw new Error("analysis_unavailable");
  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  let rawText = "";
  let imageDataUrl: string | undefined;
  if (mime === "application/pdf") rawText = await extractPdfText(buffer).catch(() => "");
  else if (mime.startsWith("image/")) imageDataUrl = attachment.fileUrl;
  else rawText = buffer.toString("utf8");
  const extraction = await extractParParties(rawText, {
    imageDataUrl, tenantId: par.tenantId, userId: actorUserId, prefillId: randomUUID(),
  });
  const choice = choosePayee(extraction, null);
  const payee = choice.payee;
  const checks: ReconcileCheck[] = [
    { field: "sumă", expected: par.totalEstimatedCents, found: choice.amountCents, matches: choice.amountCents == null ? null : choice.amountCents === par.totalEstimatedCents },
    { field: "valută", expected: par.currency, found: choice.currency, matches: !choice.currency ? null : choice.currency === par.currency },
    { field: "beneficiar", expected: par.payeeName, found: payee?.name ?? null, matches: !payee?.name || !par.payeeName ? null : norm(payee.name) === norm(par.payeeName) },
    { field: "IDNO/IDNP", expected: par.payeeIdnp, found: payee?.idno ?? null, matches: !payee?.idno || !par.payeeIdnp ? null : norm(payee.idno) === norm(par.payeeIdnp) },
    { field: "IBAN", expected: par.payeeIban, found: payee?.iban ?? null, matches: !payee?.iban || !par.payeeIban ? null : norm(payee.iban) === norm(par.payeeIban) },
    { field: "bancă", expected: par.payeeBank, found: payee?.bank ?? null, matches: !payee?.bank || !par.payeeBank ? null : norm(payee.bank) === norm(par.payeeBank) },
  ];
  const warnings = checks.filter((check) => check.matches === false).length;
  const analysis = { status: warnings ? "warning" : "match", warnings, checks, analyzedAt: new Date().toISOString() };
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
  const [par] = await db.select({ requestedByUserId: parRequests.requestedByUserId, projectId: parRequests.projectId, payerId: parRequests.payerId }).from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);
  if (!(await hasScopedDossierAccess(user, par))) return c.json({ error: "not_found" }, 404);

  const [attachment] = await db.select().from(parAttachments).where(and(
    eq(parAttachments.id, attId), eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId),
  ));
  if (!attachment) return c.json({ error: "not_found" }, 404);
  if (/^https?:\/\//i.test(attachment.fileUrl)) return c.redirect(attachment.fileUrl);
  const match = attachment.fileUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return c.json({ error: "preview_unavailable" }, 422);
  const bytes = Buffer.from(match[2], "base64");
  const safeName = attachment.fileName.replace(/[\r\n"]/g, "_");
  c.header("Content-Type", match[1]);
  c.header("Content-Disposition", `inline; filename="${safeName}"`);
  c.header("Cache-Control", "private, max-age=60");
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(bytes);
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

    // Verify PAR exists + tenant scope
    const [par] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

    if (!par) return c.json({ error: "not_found" }, 404);
    if (!(await hasScopedDossierAccess(user, par))) return c.json({ error: "not_found" }, 404);

    // Permission: the author may attach while the PAR is editable (draft/changes_requested). ADDITIONALLY,
    // finance/par_admin may attach the payment-confirmation doc to the dossier at the finance stage
    // (approved/in_finance/paid/reapproval_required) — the proof of payment must live with the request.
    const roles = await getUserPARRoles(user.id, tenantId);
    const isFinance = roles.includes("finance") || roles.includes("par_admin");
    const FINANCE_STAGE_STATUSES = ["approved", "in_finance", "reapproval_required", "paid"];
    const authorCanEdit =
      par.requestedByUserId === user.id &&
      EDITABLE_STATUSES.includes(par.status as typeof EDITABLE_STATUSES[number]);
    const financeCanAttach = isFinance && FINANCE_STAGE_STATUSES.includes(par.status);
    if (!authorCanEdit && !financeCanAttach) {
      return c.json(
        { error: `forbidden: cannot add attachments (status '${par.status}')` },
        403
      );
    }

    // VM1-06: enforce the max-attachments limit on the server (UI guards too, but the
    // server is the source of truth — a 10th upload is fine, the 11th is rejected).
    const existing = await db
      .select({ id: parAttachments.id })
      .from(parAttachments)
      .where(and(eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId)));
    if (existing.length >= MAX_ATTACHMENTS_PER_PAR) {
      return c.json(
        {
          error: "too_many_attachments",
          detail: `Maxim ${MAX_ATTACHMENTS_PER_PAR} fișiere per cerere.`,
        },
        409
      );
    }

    // Validate MIME type from data URL prefix or mime field
    const mimeFromDataUrl = body.file_url.match(/^data:([^;]+);base64,/)?.[1];
    const effectiveMime = mimeFromDataUrl ?? body.mime;
    if (!ALLOWED_MIME_TYPES.includes(effectiveMime)) {
      return c.json(
        {
          error: "invalid_file_type",
          detail: `Allowed: PDF, PNG, JPEG, Word, Excel. Got: ${effectiveMime}`,
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

    const [attachment] = await db
      .insert(parAttachments)
      .values({
        tenantId,
        parId,
        fileUrl: body.file_url,
        fileName: body.file_name,
        kind: body.kind,
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

  return c.json({ deleted: true });
});
