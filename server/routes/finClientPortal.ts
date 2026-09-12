/**
 * CLIENTPORTAL-001/002/003: Financial client portal — magic-link token access.
 *
 * PUBLIC routes (no auth — token-based):
 *   POST /api/fin/client-portal/tokens         — admin generates token (requireAuth)
 *   GET  /api/fin/client-portal/tokens         — admin lists active tokens (requireAuth)
 *   DELETE /api/fin/client-portal/tokens/:id   — admin revokes token (requireAuth)
 *   GET  /api/fin/client-portal/me?token=      — public: validates token, returns identity
 *   GET  /api/fin/client-portal/invoices?token= — public: returns invoices for this client
 *   POST /api/fin/client-portal/documents?token= — public: upload a document
 *   GET  /api/fin/client-portal/documents?token= — public: list uploaded documents
 *   GET  /api/fin/client-portal/admin/documents  — admin: list docs per contact/company (requireAuth)
 *
 * Security: public endpoints validate token (active, non-expired, tenant-scoped).
 * Tenant isolation: all queries are filtered by the token's tenant_id.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  finClientPortalTokens,
  finClientPortalDocuments,
  invoices,
  companyClients,
  students,
  tenants,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { buildObjectPath, downloadObject, uploadObject } from "../lib/storage/objectStore";
import { contentDisposition } from "../lib/http/contentDisposition";

/** Bucket privat cu documentele urcate de clienți prin portalul financiar. */
const CLIENT_PORTAL_BUCKET = "fin-client-portal";

/**
 * Ce știe lista despre un document — metadate, niciodată conținutul. `storagePath` e înadins
 * absent: pe rândurile vechi acolo stă data-URL-ul base64 al fișierului întreg.
 */
interface ClientPortalDocumentSummary {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = result as { rows?: T[] };
  return r.rows ?? [];
}

/** Validate a portal token and return the record, or null if invalid/expired */
async function validatePortalToken(token: string) {
  if (!UUID_REGEX.test(token)) return null;
  const now = new Date();
  const rows = normalizeRows<typeof finClientPortalTokens.$inferSelect>(
    await db
      .select()
      .from(finClientPortalTokens)
      .where(
        and(
          eq(finClientPortalTokens.token, token),
          eq(finClientPortalTokens.isActive, true),
          gte(finClientPortalTokens.expiresAt, now)
        )
      )
      .limit(1)
  );
  const record = rows[0] ?? null;
  if (record) {
    // Update last_used_at in the background
    await db
      .update(finClientPortalTokens)
      .set({ lastUsedAt: now })
      .where(eq(finClientPortalTokens.id, record.id));
  }
  return record;
}

// ─── Admin router (requireAuth) ──────────────────────────────────────────────
const adminRouter = new Hono<{ Variables: AuthVariables }>();
adminRouter.use("*", requireAuth);

const generateTokenSchema = z.object({
  contactId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  expiresInDays: z.number().int().min(1).max(365).default(30),
});

/** POST /tokens — admin generates a new portal token */
adminRouter.post("/tokens", zValidator("json", generateTokenSchema), async (c) => {
  const { contactId, companyId, expiresInDays } = c.req.valid("json");
  const { tenantId, userId } = c.get("user");

  if (!contactId && !companyId) {
    return c.json({ error: "contactId or companyId required" }, 400);
  }

  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const inserted = normalizeRows<typeof finClientPortalTokens.$inferSelect>(
    await db
      .insert(finClientPortalTokens)
      .values({
        tenantId,
        contactId: contactId ?? null,
        companyId: companyId ?? null,
        expiresAt,
        createdBy: userId ?? null,
      })
      .returning()
  );

  const record = inserted[0];
  if (!record) return c.json({ error: "failed_to_create_token" }, 500);

  const portalUrl = `/portal/client?token=${record.token}`;
  return c.json({ token: record.token, expiresAt: record.expiresAt, portalUrl });
});

/** GET /tokens — admin lists active tokens for this tenant */
adminRouter.get("/tokens", async (c) => {
  const { tenantId } = c.get("user");
  const rows = normalizeRows<typeof finClientPortalTokens.$inferSelect>(
    await db
      .select()
      .from(finClientPortalTokens)
      .where(
        and(
          eq(finClientPortalTokens.tenantId, tenantId),
          eq(finClientPortalTokens.isActive, true)
        )
      )
      .orderBy(sql`${finClientPortalTokens.createdAt} DESC`)
      .limit(100)
  );
  return c.json({ tokens: rows });
});

/** DELETE /tokens/:id — admin revokes a token */
adminRouter.delete("/tokens/:id", async (c) => {
  const id = c.req.param("id");
  const { tenantId } = c.get("user");
  if (!UUID_REGEX.test(id)) return c.json({ error: "invalid_id" }, 400);

  await db
    .update(finClientPortalTokens)
    .set({ isActive: false })
    .where(and(eq(finClientPortalTokens.id, id), eq(finClientPortalTokens.tenantId, tenantId)));

  return c.json({ ok: true });
});

/** GET /admin/documents — admin lists documents uploaded by a specific client */
adminRouter.get("/admin/documents", async (c) => {
  const { tenantId } = c.get("user");
  const contactId = c.req.query("contactId");
  const companyId = c.req.query("companyId");

  if (!contactId && !companyId) {
    return c.json({ error: "contactId or companyId required" }, 400);
  }

  // Find all portal token IDs for this client+tenant
  const tokenConditions = [eq(finClientPortalTokens.tenantId, tenantId)];
  if (contactId && UUID_REGEX.test(contactId)) {
    tokenConditions.push(eq(finClientPortalTokens.contactId, contactId));
  } else if (companyId && UUID_REGEX.test(companyId)) {
    tokenConditions.push(eq(finClientPortalTokens.companyId, companyId));
  }

  const tokenRows = normalizeRows<{ id: string }>(
    await db
      .select({ id: finClientPortalTokens.id })
      .from(finClientPortalTokens)
      .where(and(...tokenConditions))
  );

  if (tokenRows.length === 0) return c.json({ documents: [] });

  const tokenIds = tokenRows.map((r) => r.id);
  // Proiecție explicită, fără `storagePath`: acolo stătea conținutul fișierului (base64, pe
  // rândurile vechi), deci un `select()` complet trimitea fiecare document încărcat vreodată de
  // client la simpla afișare a listei. Lista are nevoie de nume, tip, mărime — nu de conținut.
  const docs = normalizeRows<ClientPortalDocumentSummary>(
    await db
      .select({
        id: finClientPortalDocuments.id,
        originalName: finClientPortalDocuments.originalName,
        mimeType: finClientPortalDocuments.mimeType,
        sizeBytes: finClientPortalDocuments.sizeBytes,
        uploadedAt: finClientPortalDocuments.uploadedAt,
      })
      .from(finClientPortalDocuments)
      .where(sql`${finClientPortalDocuments.portalTokenId} = ANY(ARRAY[${sql.join(tokenIds.map((id) => sql`${id}::uuid`))}])`)
      .orderBy(sql`${finClientPortalDocuments.uploadedAt} DESC`)
  );

  return c.json({ documents: docs });
});

/**
 * GET /admin/documents/:id/download — servește un document urcat de client.
 *
 * De când conținutul stă în Storage, lista nu-l mai trimite inline, deci trebuie o cale prin care
 * documentul chiar poate fi deschis. Serverul descarcă obiectul și îl trimite mai departe: URL-ul
 * semnat nu pleacă niciodată la browser, deci accesul rămâne verificat aici, pe tenant.
 * Rândurile vechi, cu data-URL base64 în `storage_path`, se servesc la fel — decodate pe loc.
 */
adminRouter.get("/admin/documents/:id/download", async (c) => {
  const id = c.req.param("id");
  const { tenantId } = c.get("user");
  if (!UUID_REGEX.test(id)) return c.json({ error: "invalid_id" }, 400);

  const rows = normalizeRows<{
    originalName: string; mimeType: string; storagePath: string; inObjectStore: boolean;
  }>(
    await db
      .select({
        originalName: finClientPortalDocuments.originalName,
        mimeType: finClientPortalDocuments.mimeType,
        storagePath: finClientPortalDocuments.storagePath,
        inObjectStore: finClientPortalDocuments.inObjectStore,
      })
      .from(finClientPortalDocuments)
      .where(and(eq(finClientPortalDocuments.id, id), eq(finClientPortalDocuments.tenantId, tenantId)))
      .limit(1)
  );
  const doc = rows[0];
  if (!doc) return c.json({ error: "not_found" }, 404);

  let bytes: Buffer;
  if (doc.inObjectStore) {
    try {
      bytes = await downloadObject(CLIENT_PORTAL_BUCKET, doc.storagePath);
    } catch {
      return c.json({ error: "document_unavailable" }, 502);
    }
  } else {
    const match = doc.storagePath.match(/^data:[^;]+;base64,(.*)$/s);
    if (!match) return c.json({ error: "document_unavailable" }, 422);
    bytes = Buffer.from(match[1], "base64");
  }

  c.header("Content-Type", doc.mimeType || "application/octet-stream");
  c.header("Content-Disposition", contentDisposition("attachment", doc.originalName, "document"));
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(new Uint8Array(bytes));
});

// ─── Public router (no auth — token param required) ──────────────────────────
const publicRouter = new Hono();

/** GET /me?token= — validate token, return client identity */
publicRouter.get("/me", async (c) => {
  const token = c.req.query("token") ?? "";
  const record = await validatePortalToken(token);
  if (!record) return c.json({ error: "invalid_or_expired_token" }, 401);

  // Resolve tenant name
  const tenantRows = normalizeRows<{ name: string }>(
    await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, record.tenantId))
      .limit(1)
  );
  const tenantName = tenantRows[0]?.name ?? "";

  let contactName: string | null = null;
  let companyName: string | null = null;

  if (record.contactId) {
    const studentRows = normalizeRows<{ fullName: string }>(
      await db
        .select({ fullName: students.fullName })
        .from(students)
        .where(eq(students.id, record.contactId))
        .limit(1)
    );
    contactName = studentRows[0]?.fullName ?? null;
  }

  if (record.companyId) {
    const companyRows = normalizeRows<{ name: string }>(
      await db
        .select({ name: companyClients.name })
        .from(companyClients)
        .where(eq(companyClients.id, record.companyId))
        .limit(1)
    );
    companyName = companyRows[0]?.name ?? null;
  }

  return c.json({ contactName, companyName, tenantName, tokenId: record.id });
});

/** GET /invoices?token= — return invoices for this client (tenant-scoped) */
publicRouter.get("/invoices", async (c) => {
  const token = c.req.query("token") ?? "";
  const record = await validatePortalToken(token);
  if (!record) return c.json({ error: "invalid_or_expired_token" }, 401);

  let invoiceRows: typeof invoices.$inferSelect[] = [];

  if (record.contactId) {
    // B2C: invoices linked to the student record
    invoiceRows = normalizeRows<typeof invoices.$inferSelect>(
      await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, record.tenantId),
            eq(invoices.studentId, record.contactId)
          )
        )
        .orderBy(sql`${invoices.issueDate} DESC`)
        .limit(100)
    );
  }
  // For B2B (companyId): invoices don't have a direct companyId FK in the existing schema.
  // Return empty list for now; linking to PARTY model is deferred to CLIENTPORTAL-002 enrichment.

  const totalOwedCents = invoiceRows
    .filter((inv) => inv.status === "issued")
    .reduce((sum, inv) => sum + inv.amountCents, 0);

  // Resolve identity labels for the response
  let contactName: string | null = null;
  let companyName: string | null = null;
  const tenantRows = normalizeRows<{ name: string }>(
    await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, record.tenantId)).limit(1)
  );
  if (record.contactId) {
    const sr = normalizeRows<{ fullName: string }>(
      await db.select({ fullName: students.fullName }).from(students).where(eq(students.id, record.contactId)).limit(1)
    );
    contactName = sr[0]?.fullName ?? null;
  }
  if (record.companyId) {
    const cr = normalizeRows<{ name: string }>(
      await db.select({ name: companyClients.name }).from(companyClients).where(eq(companyClients.id, record.companyId)).limit(1)
    );
    companyName = cr[0]?.name ?? null;
  }

  return c.json({
    invoices: invoiceRows.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      amountCents: inv.amountCents,
      currency: inv.currency,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      stripeSessionId: inv.stripeSessionId,
    })),
    totalOwedCents,
    contactName,
    companyName,
    tenantName: tenantRows[0]?.name ?? "",
  });
});

/** POST /documents?token= — client uploads a document */
publicRouter.post("/documents", async (c) => {
  const token = c.req.query("token") ?? "";
  const record = await validatePortalToken(token);
  if (!record) return c.json({ error: "invalid_or_expired_token" }, 401);

  let body: FormData;
  try {
    body = await c.req.formData();
  } catch {
    return c.json({ error: "Expected multipart/form-data" }, 400);
  }

  const file = body.get("file") as File | null;
  if (!file) return c.json({ error: "file required" }, 400);

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_BYTES) return c.json({ error: "Fișier prea mare (max 10 MB)" }, 413);

  const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return c.json({ error: "Format neacceptat (PDF, JPG, PNG, WebP)" }, 415);
  }

  // Conținutul merge în Supabase Storage, nu în Postgres. Înainte se scria aici ca data-URL
  // base64 („filesystem storage deferred — no FS in Vercel serverless"), dar alternativa la
  // filesystem nu e baza de date: 10 MB de fișier deveneau ~13,4 MB de rând, iar planul are 500 MB
  // de bază de date cu totul. În DB rămâne doar calea obiectului.
  const arrayBuffer = await file.arrayBuffer();
  let storagePath: string;
  try {
    storagePath = buildObjectPath(record.tenantId, file.name);
    await uploadObject(CLIENT_PORTAL_BUCKET, storagePath, Buffer.from(arrayBuffer), file.type);
  } catch {
    return c.json({ error: "Documentul nu a putut fi salvat. Încearcă din nou." }, 503);
  }

  const inserted = normalizeRows<typeof finClientPortalDocuments.$inferSelect>(
    await db
      .insert(finClientPortalDocuments)
      .values({
        tenantId: record.tenantId,
        portalTokenId: record.id,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        storagePath,
        inObjectStore: true,
      })
      .returning()
  );

  const doc = inserted[0];
  if (!doc) return c.json({ error: "Eroare la salvarea documentului" }, 500);

  return c.json({
    id: doc.id,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    uploadedAt: doc.uploadedAt,
  });
});

/** GET /documents?token= — client lists their uploaded documents */
publicRouter.get("/documents", async (c) => {
  const token = c.req.query("token") ?? "";
  const record = await validatePortalToken(token);
  if (!record) return c.json({ error: "invalid_or_expired_token" }, 401);

  // Răspunsul selecta oricum doar metadate, dar `select()` citea și `storagePath` — adică pe
  // rândurile vechi conținutul base64 al fiecărui document, transferat din bază la server ca să
  // fie aruncat imediat. Proiecția explicită oprește citirea de la sursă.
  const docs = normalizeRows<ClientPortalDocumentSummary>(
    await db
      .select({
        id: finClientPortalDocuments.id,
        originalName: finClientPortalDocuments.originalName,
        mimeType: finClientPortalDocuments.mimeType,
        sizeBytes: finClientPortalDocuments.sizeBytes,
        uploadedAt: finClientPortalDocuments.uploadedAt,
      })
      .from(finClientPortalDocuments)
      .where(
        and(
          eq(finClientPortalDocuments.portalTokenId, record.id),
          eq(finClientPortalDocuments.tenantId, record.tenantId)
        )
      )
      .orderBy(sql`${finClientPortalDocuments.uploadedAt} DESC`)
      .limit(50)
  );

  return c.json({ documents: docs });
});

// ─── Combined export ──────────────────────────────────────────────────────────
export const finClientPortalRoutes = new Hono();

// Mount admin routes first (more specific paths)
finClientPortalRoutes.route("/", adminRouter);
// Mount public routes
finClientPortalRoutes.route("/", publicRouter);
