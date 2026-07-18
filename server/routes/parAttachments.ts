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
import { parRequests, parAttachments } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";

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

// ─── GET /:parId/attachments ──────────────────────────────────────────────────

parAttachmentsRoutes.get("/:parId/attachments", async (c) => {
  const { parId } = c.req.param();
  const user = c.get("user");
  const tenantId = user.tenantId;

  // Verify PAR exists and belongs to tenant
  const [par] = await db
    .select({ id: parRequests.id, requestedByUserId: parRequests.requestedByUserId })
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  if (!par) return c.json({ error: "not_found" }, 404);

  const roles = await getUserPARRoles(user.id, tenantId);
  const hasElevatedRole = roles.some((r) =>
    ["approver", "finance", "par_admin"].includes(r)
  );

  if (!hasElevatedRole && par.requestedByUserId !== user.id) {
    return c.json({ error: "not_found" }, 404);
  }

  const items = await db
    .select({
      id: parAttachments.id,
      fileName: parAttachments.fileName,
      kind: parAttachments.kind,
      uploadedBy: parAttachments.uploadedBy,
      createdAt: parAttachments.createdAt,
      // Note: fileUrl intentionally included for download
      fileUrl: parAttachments.fileUrl,
    })
    .from(parAttachments)
    .where(and(eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId)));

  return c.json({ items });
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
