/**
 * CRM Faza 9 — fișiere atașate unui lead (oferta primită, caietul de sarcini, poza de la fața
 * locului).
 *
 * Montat la /api/crm/lead-files.
 *
 * GET    /api/crm/lead-files?leadId=      — fișierele leadului
 * POST   /api/crm/lead-files/sign         — URL semnat de încărcare (verifică dreptul ÎNAINTE)
 * POST   /api/crm/lead-files/finalize     — confirmă încărcarea, după ce verifică octeții reali
 * GET    /api/crm/lead-files/:id/preview  — servește fișierul (singura cale de deschidere)
 * DELETE /api/crm/lead-files/:id          — șterge rândul + obiectul din Storage
 *
 * Portare din crm-vector (`src/lib/crm/files.ts`), dar NU prin `supabase-js` din browser:
 * browserul nu are (și nu trebuie să aibă) cheia de service. Secvența e cea de la atașamentele
 * PAR, care a rezolvat deja aceleași probleme:
 *
 *   1. `sign`     — serverul verifică dreptul de a atașa înainte să dea un URL de scriere;
 *   2. browserul PUT-ează binarul direct în Storage (nu trece prin funcția serverless, unde
 *      corpul e plafonat la ~4,5 MB);
 *   3. `finalize` — serverul descarcă obiectul, îi verifică octeții reali, abia apoi scrie rândul.
 *
 * Pasul 3 nu e opțional: între 1 și 3 clientul poate urca ORICE la calea semnată, deci tipul
 * declarat rămâne o afirmație neverificată până când serverul se uită la conținut.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadAttachments, type NewLeadAttachment } from "../db/schema/leads";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { downloadObject, removeObjects, signUploads } from "../lib/storage/objectStore";
import { isSafeTenantObjectPath } from "../lib/storage/safePath";
import { magicBytesMatchBuffer } from "./parAttachments";
import { contentDisposition } from "../lib/http/contentDisposition";

/** Bucket propriu: fișierele CRM n-au ce căuta lângă dosarele de plată. */
export const CRM_LEAD_FILES_BUCKET = "crm-lead-files";

/** 15 MB — aceeași limită ca la dosarele PAR; un scan de contract încape, un film nu. */
export const MAX_LEAD_FILE_BYTES = 15 * 1024 * 1024;

/**
 * Ce poate purta un lead: oferta primită, caietul de sarcini, poza de la fața locului.
 *
 * SVG lipsește înadins, deși e imagine: ruta de preview servește `Content-Disposition: inline`,
 * iar un SVG e un document care poartă script — previzualizarea ar rula JS-ul celui care l-a
 * încărcat pe originea noastră.
 */
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "text/plain",
  "text/csv",
  "application/rtf",
  "application/zip",
  "application/x-zip-compressed",
];

export const crmLeadFilesRoutes = new Hono<{ Variables: AuthVariables }>();
crmLeadFilesRoutes.use("/*", requireAuth);

const signSchema = z.object({
  leadId: z.string().uuid(),
  fileName: z.string().min(1).max(300),
  mime: z.string().max(100),
  sizeBytes: z.number().int().min(1).max(MAX_LEAD_FILE_BYTES),
});

const finalizeSchema = z.object({
  leadId: z.string().uuid(),
  path: z.string().min(1).max(512),
  fileName: z.string().min(1).max(300),
  mime: z.string().max(100),
});

async function leadOfTenant(leadId: string, tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
  return !!row;
}

/** Adresa prin care interfața deschide fișierul — niciodată URL-ul din Storage. */
export function leadFilePreviewUrl(id: string): string {
  return `/api/crm/lead-files/${id}/preview`;
}

// ─── GET / ────────────────────────────────────────────────────────────────────

crmLeadFilesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const leadId = c.req.query("leadId");
  if (!leadId) return c.json({ error: "lead_id_required" }, 400);

  try {
    const rows = await db
      .select()
      .from(leadAttachments)
      .where(and(eq(leadAttachments.tenantId, user.tenantId), eq(leadAttachments.leadId, leadId)))
      .orderBy(desc(leadAttachments.createdAt));

    // Nu întoarcem niciodată calea din Storage sau data-URL-ul: lista ar căra conținutul
    // fișierelor la fiecare deschidere de fișă, iar calea e o adresă internă.
    return c.json({
      items: rows.map((a) => ({
        id: a.id,
        leadId: a.leadId,
        fileName: a.fileName,
        mime: a.mime,
        sizeBytes: a.sizeBytes,
        uploadedBy: a.uploadedBy,
        createdAt: a.createdAt,
        previewUrl: leadFilePreviewUrl(a.id),
      })),
    });
  } catch (e) {
    console.error("[crm/lead-files] listare eșuată:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});

// ─── POST /sign ───────────────────────────────────────────────────────────────

crmLeadFilesRoutes.post("/sign", zValidator("json", signSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  if (!(await leadOfTenant(body.leadId, user.tenantId))) return c.json({ error: "not_found" }, 404);

  if (!ALLOWED_MIME_TYPES.includes(body.mime)) {
    return c.json(
      {
        error: "invalid_file_type",
        detail: `Acceptate: PDF, imagini, Word, Excel, PowerPoint, OpenDocument, text/CSV, ZIP. Primit: ${body.mime}`,
      },
      400
    );
  }

  try {
    const [signed] = await signUploads(CRM_LEAD_FILES_BUCKET, user.tenantId, [{ fileName: body.fileName }]);
    return c.json({ path: signed.path, signedUrl: signed.signedUrl });
  } catch {
    return c.json({ error: "storage_unavailable", detail: "Nu pot pregăti încărcarea. Încearcă din nou." }, 503);
  }
});

// ─── POST /finalize ───────────────────────────────────────────────────────────

crmLeadFilesRoutes.post("/finalize", zValidator("json", finalizeSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const body = c.req.valid("json");

  if (!(await leadOfTenant(body.leadId, tenantId))) return c.json({ error: "not_found" }, 404);

  // Calea vine de la client. Un `startsWith(tenantId)` nu e o gardă: normalizarea de URL
  // colapsează `..` înainte ca cererea să plece, deci „<tenant A>/../<tenant B>/x.pdf" ar trece
  // prefixul și ar citi obiectul altui workspace (auditul din 29.08.2026).
  if (!isSafeTenantObjectPath(body.path, tenantId)) return c.json({ error: "invalid_path" }, 400);
  if (!ALLOWED_MIME_TYPES.includes(body.mime)) return c.json({ error: "invalid_file_type" }, 400);

  let bytes: Buffer;
  try {
    bytes = await downloadObject(CRM_LEAD_FILES_BUCKET, body.path);
  } catch {
    return c.json({ error: "upload_not_found", detail: "Fișierul nu a ajuns în întregime. Încearcă din nou." }, 400);
  }

  const reject = async (error: string, detail: string) => {
    // Un fișier respins nu are voie să rămână ocupând spațiu în bucket.
    await removeObjects(CRM_LEAD_FILES_BUCKET, [body.path]);
    return c.json({ error, detail }, 400);
  };

  if (bytes.byteLength === 0) return reject("empty_file", "Fișierul e gol.");
  if (bytes.byteLength > MAX_LEAD_FILE_BYTES) {
    return reject("file_too_large", `Fișierul depășește ${Math.round(MAX_LEAD_FILE_BYTES / 1024 / 1024)} MB.`);
  }
  if (!magicBytesMatchBuffer(bytes, body.mime)) {
    return reject("file_content_mismatch", "Conținutul fișierului nu corespunde tipului declarat.");
  }

  const values: NewLeadAttachment = {
    tenantId,
    leadId: body.leadId,
    fileName: body.fileName,
    storagePath: body.path,
    fileUrl: null,
    mime: body.mime,
    sizeBytes: bytes.byteLength,
    uploadedBy: user.id,
  };
  const [row] = await db.insert(leadAttachments).values(values).returning();

  return c.json(
    {
      id: row.id,
      leadId: row.leadId,
      fileName: row.fileName,
      mime: row.mime,
      sizeBytes: row.sizeBytes,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt,
      previewUrl: leadFilePreviewUrl(row.id),
    },
    201
  );
});

// ─── GET /:id/preview ─────────────────────────────────────────────────────────

crmLeadFilesRoutes.get("/:id/preview", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [attachment] = await db
    .select()
    .from(leadAttachments)
    .where(and(eq(leadAttachments.id, id), eq(leadAttachments.tenantId, user.tenantId)));
  if (!attachment) return c.json({ error: "not_found" }, 404);

  // Rândurile vechi (dinainte de Storage) pot purta un link extern sau un data-URL.
  if (attachment.fileUrl && /^https?:\/\//i.test(attachment.fileUrl)) return c.redirect(attachment.fileUrl);

  let bytes: Buffer;
  if (attachment.storagePath) {
    try {
      bytes = await downloadObject(CRM_LEAD_FILES_BUCKET, attachment.storagePath);
    } catch {
      return c.json({ error: "preview_unavailable" }, 422);
    }
  } else if (attachment.fileUrl?.startsWith("data:")) {
    const m = attachment.fileUrl.match(/^data:[^;]*;base64,(.*)$/s);
    if (!m) return c.json({ error: "preview_unavailable" }, 422);
    bytes = Buffer.from(m[1], "base64");
  } else {
    return c.json({ error: "preview_unavailable" }, 422);
  }

  c.header("Content-Type", attachment.mime);
  // Numele trece prin RFC 6266: un antet HTTP nu poate purta „ă" ca atare.
  c.header("Content-Disposition", contentDisposition("inline", attachment.fileName, "fisier"));
  // Conținutul unui fișier nu se schimbă pentru același id (o modificare = alt fișier), iar
  // accesul s-a verificat deja mai sus. `private`: rămâne în browserul unui singur om.
  c.header("Cache-Control", "private, max-age=3600");
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(new Uint8Array(bytes));
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

crmLeadFilesRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(leadAttachments)
    .where(and(eq(leadAttachments.id, id), eq(leadAttachments.tenantId, user.tenantId)))
    .returning();
  if (!deleted) return c.json({ error: "not_found" }, 404);

  // Rândul din bază e sursa adevărului; un obiect orfan în Storage nu strică nimic, deci
  // ștergerea lui e best-effort și nu poate răsturna un DELETE reușit.
  if (deleted.storagePath) await removeObjects(CRM_LEAD_FILES_BUCKET, [deleted.storagePath]);

  return c.json({ ok: true });
});
