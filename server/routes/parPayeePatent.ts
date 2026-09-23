/**
 * Copia patentei beneficiarului, pe cerere — fișierul, nu doar seria și termenul citite din el.
 *
 * Owner, 23.09.2026: „La atașarea patentei trebuie bifă sau confirmare că s-a încărcat — acum pui,
 * dar nu e clar dacă s-a pus sau nu." Până aici, „Încarcă patenta" trimitea actul DOAR la citirea
 * AI (`/api/par/ai-prefill/payee-doc`): seria și termenul intrau în câmpuri, iar fișierul se
 * arunca. Nu rămânea nimic de arătat, nimic de deschis la aprobare, și aceeași patentă se cerea din
 * nou la fiecare plată către aceeași persoană.
 *
 * Routes (montate în server/app.ts sub /api/par):
 *   POST /:parId/payee-patent/sign      → URL semnat: browserul urcă binarul direct în Storage
 *   POST /:parId/payee-patent/finalize  → verifică octeții reali și leagă fișierul de cerere
 *   GET  /:parId/payee-patent           → servește copia, inline (vizualizatorul din aplicație)
 *
 * Urcarea merge pe același drum ca atașamentele (semnare → PUT → finalizare), nu prin corpul
 * cererii: Vercel plafonează corpul la ~4,5 MB, iar o patentă fotografiată cu telefonul trece ușor.
 * Copia registrului (`GET /api/par/vendors/:id/patent`) stă în parVendors.ts; trecerea ei pe
 * cerere și înapoi în registru — în `PATCH /api/par/:id` și în vendorAutoSave.ts.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { parRequests } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { holdsNamedStep } from "../lib/par/visibility";
import { PAR_ATTACHMENT_BUCKET } from "../lib/par/attachmentStore";
import { isPatentFileMime, patentFileResponse } from "../lib/par/payeePatentFile";
import { downloadObject, removeObjects, signUploads } from "../lib/storage/objectStore";
import { isSafeTenantObjectPath } from "../lib/storage/safePath";
import { MAX_ATTACHMENT_BYTES } from "../../src/lib/par/attachmentLimits";
import { hasScopedDossierAccess, magicBytesMatchBuffer } from "./parAttachments";
import type { Context } from "hono";

export const parPayeePatentRoutes = new Hono<{ Variables: AuthVariables }>();
parPayeePatentRoutes.use("*", requireAuth);
parPayeePatentRoutes.use("/:parId/payee-patent", parUuidGuard("parId"));
parPayeePatentRoutes.use("/:parId/payee-patent/*", parUuidGuard("parId"));

const EDITABLE_STATUSES = ["draft", "changes_requested"];
const MAX_FILE_NAME_LEN = 500;

const INVALID_TYPE = {
  error: "invalid_file_type",
  detail: "Patenta se încarcă ca PDF sau imagine (JPG, PNG, WEBP, HEIC).",
};

/**
 * Doar autorul, cât timp cererea se mai poate edita — exact regula câmpurilor patentei din
 * `PATCH /:id`. Copia face parte din blocul beneficiarului, nu din dosarul de anexe.
 */
async function guardPatentWrite(c: Context<{ Variables: AuthVariables }>, parId: string) {
  const user = c.get("user");
  const [par] = await db
    .select({ id: parRequests.id, requestedByUserId: parRequests.requestedByUserId, status: parRequests.status })
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, user.tenantId)));
  if (!par || par.requestedByUserId !== user.id) {
    return { ok: false as const, response: c.json({ error: "not_found" }, 404) };
  }
  if (!EDITABLE_STATUSES.includes(par.status)) {
    return {
      ok: false as const,
      response: c.json({ error: `forbidden: cannot change the patent (status '${par.status}')` }, 403),
    };
  }
  return { ok: true as const, par };
}

const signSchema = z.object({
  file_name: z.string().min(1).max(MAX_FILE_NAME_LEN),
  mime: z.string().max(100),
  size_bytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
});

parPayeePatentRoutes.post("/:parId/payee-patent/sign", zValidator("json", signSchema), async (c) => {
  const parId = c.req.param("parId");
  const body = c.req.valid("json");
  const guard = await guardPatentWrite(c, parId);
  if (!guard.ok) return guard.response;
  if (!isPatentFileMime(body.mime)) return c.json(INVALID_TYPE, 400);

  try {
    const [signed] = await signUploads(PAR_ATTACHMENT_BUCKET, c.get("user").tenantId, [
      { fileName: body.file_name },
    ]);
    return c.json({ path: signed.path, signed_url: signed.signedUrl });
  } catch {
    return c.json({ error: "storage_unavailable", detail: "Nu pot pregăti încărcarea. Încearcă din nou." }, 503);
  }
});

const finalizeSchema = z.object({
  path: z.string().min(1).max(512),
  file_name: z.string().min(1).max(MAX_FILE_NAME_LEN),
  mime: z.string().max(100),
});

parPayeePatentRoutes.post("/:parId/payee-patent/finalize", zValidator("json", finalizeSchema), async (c) => {
  const parId = c.req.param("parId");
  const user = c.get("user");
  const body = c.req.valid("json");
  const guard = await guardPatentWrite(c, parId);
  if (!guard.ok) return guard.response;

  // Calea vine de la client: forma se impune, nu se presupune (vezi safePath.ts).
  if (!isSafeTenantObjectPath(body.path, user.tenantId)) return c.json({ error: "invalid_path" }, 400);
  if (!isPatentFileMime(body.mime)) return c.json(INVALID_TYPE, 400);

  let bytes: Buffer;
  try {
    bytes = await downloadObject(PAR_ATTACHMENT_BUCKET, body.path);
  } catch {
    return c.json({ error: "upload_not_found", detail: "Fișierul nu a ajuns în întregime. Încearcă din nou." }, 400);
  }
  // Un fișier respins nu rămâne să ocupe spațiu în Storage.
  const reject = async (error: string, detail: string) => {
    await removeObjects(PAR_ATTACHMENT_BUCKET, [body.path]);
    return c.json({ error, detail }, 400);
  };
  if (bytes.byteLength === 0) return reject("empty_file", "Fișierul e gol.");
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return reject("file_too_large", `Fișierul depășește ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`);
  }
  if (!magicBytesMatchBuffer(bytes, body.mime)) {
    return reject("file_content_mismatch", "Conținutul fișierului nu corespunde tipului declarat.");
  }

  // Patenta VECHE nu se șterge din Storage: poate fi copia din registru (aceeași cale pe beneficiar
  // și pe alte cereri) sau snapshotul unei cereri trimise mai demult.
  const uploadedAt = new Date();
  await db
    .update(parRequests)
    .set({
      payeeIsPatentHolder: true,
      payeePatentFilePath: body.path,
      payeePatentFileName: body.file_name,
      payeePatentFileMime: body.mime,
      payeePatentFileSize: bytes.byteLength,
      payeePatentFileUploadedAt: uploadedAt,
      updatedAt: uploadedAt,
    })
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, user.tenantId)));

  return c.json(
    {
      payeePatentFileName: body.file_name,
      payeePatentFileMime: body.mime,
      payeePatentFileSize: bytes.byteLength,
      payeePatentFileUploadedAt: uploadedAt.toISOString(),
    },
    201
  );
});

/**
 * Copia patentei, pentru cine vede blocul beneficiarului: aceeași regulă ca `canSeePayee` din
 * `GET /:id` (autorul + aprobator/finanțe/admin PAR), peste accesul la dosar al atașamentelor.
 * Patenta e un act personal — un coleg de proiect care vede cererea nu-i vede nici IDNP-ul.
 */
parPayeePatentRoutes.get("/:parId/payee-patent", async (c) => {
  const parId = c.req.param("parId");
  const user = c.get("user");
  const [par] = await db
    .select({
      id: parRequests.id,
      requestedByUserId: parRequests.requestedByUserId,
      projectId: parRequests.projectId,
      payerId: parRequests.payerId,
      status: parRequests.status,
      path: parRequests.payeePatentFilePath,
      name: parRequests.payeePatentFileName,
      mime: parRequests.payeePatentFileMime,
    })
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, user.tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);
  if (!(await hasScopedDossierAccess(user, par))) return c.json({ error: "not_found" }, 404);
  if (par.requestedByUserId !== user.id) {
    const roles = await getUserPARRoles(user.id, user.tenantId);
    // Cine e pus PE NUME pe lanț (verificatorul solicitantului, un pre-aprobator de proiect) vede
    // rechizitele pe fișă — deci și copia patentei, altfel linkul „Deschide" i-ar da 404.
    if (
      !roles.some((r) => ["approver", "finance", "par_admin"].includes(r)) &&
      !(await holdsNamedStep(user.id, user.tenantId, parId))
    ) {
      return c.json({ error: "not_found" }, 404);
    }
  }
  return patentFileResponse(c, par);
});
