/**
 * EINV-002: FinDesk e-Factura Moldova (SFS) API
 *
 * REUSE: EfacturaMdClient din server/lib/efacturaMoldova.ts (EFMD, PR #144).
 * Nu se reimplementează clientul SOAP — se importă și se adaptează pentru
 * contextul fin_invoices (B2B) vs invoices (B2C).
 *
 * Routes (mounted at /api/fin in app.ts):
 *   POST /api/fin/einvoices/:invoiceId/submit   → trimite factură la SFS
 *   POST /api/fin/einvoices/:invoiceId/sync     → sincronizează status SFS
 *   POST /api/fin/einvoices/:invoiceId/cancel   → anulează factură la SFS
 *   GET  /api/fin/einvoices/:invoiceId          → status SFS pentru o factură
 *   GET  /api/fin/sfs-settings                 → citește configurarea SFS
 *   PUT  /api/fin/sfs-settings                 → upsert configurare SFS
 *
 * Security:
 * - requireAuth pe toate rutele
 * - Credențiale stocate NUMAI cu encrypt() din server/lib/crypto.ts (AES-256-GCM)
 * - Dacă lipsesc setările SFS → 400 sfs_not_configured (nu se sare check-ul)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db/client";
import { finSfsSettings, finEinvoices } from "../db/schema/finEinvoices";
import { finInvoices, finInvoiceLines } from "../db/schema/finInvoices";
import { finParties } from "../db/schema/finParties";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { encrypt } from "../lib/crypto";
import {
  EfacturaMdClient,
  EfacturaMdError,
  generateSfsInvoiceXml,
  createMockTransport,
  type SfsInvoiceLine,
} from "../lib/efacturaMoldova";
// STMT-003: loadSfsConfig moved to server/lib/fin/sfsConfig.ts (shared with finStatement.ts)
import { loadSfsConfig } from "../lib/fin/sfsConfig";
import { submitInvoiceToSfs } from "../lib/fin/submitInvoiceToSfs";

export const finEinvoicesRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require authentication
finEinvoicesRoutes.use("/*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const upsertSfsSettingsSchema = z.object({
  idno: z.string().min(1).max(13),
  bankAccount: z.string().min(1).max(34),
  environment: z.enum(["mock", "test", "prod"]).optional().default("mock"),
  username: z.string().min(1).max(200).optional(),
  password: z.string().min(1).max(200).optional(),
});

// ─── GET /api/fin/einvoices ──────────────────────────────────────────────────
// EINV-003: list all e-invoices for the tenant (ordered newest first)

finEinvoicesRoutes.get("/einvoices", async (c) => {
  const user = c.get("user");
  const statusParam = c.req.query("status") as string | undefined;

  const rows = await db
    .select()
    .from(finEinvoices)
    .where(
      statusParam
        ? and(
            eq(finEinvoices.tenantId, user.tenantId),
            eq(finEinvoices.sfsStatus, statusParam as typeof finEinvoices.$inferSelect["sfsStatus"])
          )
        : eq(finEinvoices.tenantId, user.tenantId)
    )
    .orderBy(desc(finEinvoices.createdAt))
    .limit(200);

  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      finInvoiceId: r.finInvoiceId,
      sfsStatus: r.sfsStatus,
      sfsSerialNumber: r.sfsSerialNumber,
      sfsInvoiceId: r.sfsInvoiceId,
      sfsRequestStatus: r.sfsRequestStatus,
      sfsErrorMessage: r.sfsErrorMessage,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// ─── GET /api/fin/sfs-settings ───────────────────────────────────────────────

finEinvoicesRoutes.get("/sfs-settings", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select()
    .from(finSfsSettings)
    .where(eq(finSfsSettings.tenantId, user.tenantId))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ data: null });
  }

  const s = rows[0];
  // Never return encrypted credentials — return hasCredentials boolean instead
  return c.json({
    data: {
      id: s.id,
      idno: s.idno,
      bankAccount: s.bankAccount,
      environment: s.environment,
      hasCredentials: !!(s.usernameEncrypted && s.passwordEncrypted),
      lastTestedAt: s.lastTestedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    },
  });
});

// ─── PUT /api/fin/sfs-settings ───────────────────────────────────────────────

finEinvoicesRoutes.put(
  "/sfs-settings",
  zValidator("json", upsertSfsSettingsSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const existing = await db
      .select({ id: finSfsSettings.id })
      .from(finSfsSettings)
      .where(eq(finSfsSettings.tenantId, user.tenantId))
      .limit(1);

    const now = new Date();
    const values: Partial<typeof finSfsSettings.$inferInsert> = {
      idno: body.idno,
      bankAccount: body.bankAccount,
      environment: body.environment,
      updatedAt: now,
    };

    // Only update credentials if provided
    if (body.username) values.usernameEncrypted = encrypt(body.username);
    if (body.password) values.passwordEncrypted = encrypt(body.password);

    let row: typeof finSfsSettings.$inferSelect;

    if (existing.length > 0) {
      [row] = await db
        .update(finSfsSettings)
        .set(values)
        .where(eq(finSfsSettings.tenantId, user.tenantId))
        .returning();
    } else {
      [row] = await db
        .insert(finSfsSettings)
        .values({
          tenantId: user.tenantId,
          idno: body.idno,
          bankAccount: body.bankAccount,
          environment: body.environment,
          usernameEncrypted: body.username ? encrypt(body.username) : null,
          passwordEncrypted: body.password ? encrypt(body.password) : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    }

    return c.json({
      data: {
        id: row.id,
        idno: row.idno,
        bankAccount: row.bankAccount,
        environment: row.environment,
        hasCredentials: !!(row.usernameEncrypted && row.passwordEncrypted),
        lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  }
);

// ─── POST /api/fin/sfs-test ──────────────────────────────────────────────────
// Testează conexiunea + autentificarea la SFS (apel real GetTaxpayersInfo).
// Marchează lastTestedAt la succes. Răspunde mereu 200 cu { ok, message }
// ca UI-ul să arate diagnostic, nu un 500 generic.

finEinvoicesRoutes.post("/sfs-test", async (c) => {
  const user = c.get("user");

  const sfsData = await loadSfsConfig(user.tenantId);
  if (!sfsData) {
    return c.json({ ok: false, message: "Configurare SFS lipsă. Salvează întâi setările." });
  }

  const transport = sfsData.config.mock ? createMockTransport() : undefined;
  const client = new EfacturaMdClient(sfsData.config, transport);

  const result = await client.testConnection(randomUUID());

  if (result.ok && !sfsData.config.mock) {
    await db
      .update(finSfsSettings)
      .set({ lastTestedAt: new Date() })
      .where(eq(finSfsSettings.tenantId, user.tenantId));
  }

  return c.json({
    ok: result.ok,
    message: result.message,
    mock: sfsData.config.mock,
    endpoint: sfsData.config.endpoint,
  });
});

// ─── GET /api/fin/einvoices/:invoiceId ────────────────────────────────────────

finEinvoicesRoutes.get("/einvoices/:invoiceId", async (c) => {
  const user = c.get("user");
  const invoiceId = c.req.param("invoiceId");

  const rows = await db
    .select()
    .from(finEinvoices)
    .where(
      and(eq(finEinvoices.finInvoiceId, invoiceId), eq(finEinvoices.tenantId, user.tenantId))
    )
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const row = rows[0];
  return c.json({
    data: {
      id: row.id,
      finInvoiceId: row.finInvoiceId,
      sfsStatus: row.sfsStatus,
      sfsSerialNumber: row.sfsSerialNumber,
      sfsInvoiceId: row.sfsInvoiceId,
      sfsRequestStatus: row.sfsRequestStatus,
      sfsErrorMessage: row.sfsErrorMessage,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    },
  });
});

// ─── POST /api/fin/einvoices/:invoiceId/submit ────────────────────────────────

finEinvoicesRoutes.post("/einvoices/:invoiceId/submit", async (c) => {
  const user = c.get("user");
  const invoiceId = c.req.param("invoiceId");

  // Delegates to the shared helper (server/lib/fin/submitInvoiceToSfs.ts) so the manual button
  // and the daily auto-billing cron run byte-identical logic. Map the structured result → HTTP.
  const result = await submitInvoiceToSfs(user.tenantId, invoiceId);

  if (result.ok) {
    if (result.alreadyDone) {
      return c.json({ error: "already_submitted", sfsStatus: result.sfsStatus }, 409);
    }
    return c.json({ data: { id: result.einvoiceId, sfsStatus: result.sfsStatus, submittedAt: new Date().toISOString() } });
  }

  const statusByReason: Record<string, number> = {
    sfs_not_configured: 400,
    invoice_not_found: 404,
    buyer_idno_missing: 422,
    buyer_iban_missing: 422,
    invoice_has_no_lines: 422,
    xml_generation_failed: 500,
    sfs_submission_failed: 422,
  };
  return c.json(
    { error: result.reason, detail: result.detail },
    (statusByReason[result.reason ?? "sfs_submission_failed"] ?? 422) as 400 | 404 | 409 | 422 | 500,
  );
});

// ─── POST /api/fin/einvoices/:invoiceId/sync ─────────────────────────────────

finEinvoicesRoutes.post("/einvoices/:invoiceId/sync", async (c) => {
  const user = c.get("user");
  const invoiceId = c.req.param("invoiceId");

  const rows = await db
    .select()
    .from(finEinvoices)
    .where(
      and(eq(finEinvoices.finInvoiceId, invoiceId), eq(finEinvoices.tenantId, user.tenantId))
    )
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const record = rows[0];
  const sfsData = await loadSfsConfig(user.tenantId);
  if (!sfsData) {
    return c.json({ error: "sfs_not_configured" }, 400);
  }

  const transport = sfsData.config.mock ? createMockTransport() : undefined;
  const client = new EfacturaMdClient(sfsData.config, transport);

  const now = new Date();

  // Mapează codul de status SFS (InvoiceStatus) la enum-ul nostru.
  // 0=Draft (trimisă, nesemnată) → rămâne "sent" la noi.
  function mapStatus(inv: number, fallback: typeof record.sfsStatus): typeof record.sfsStatus {
    if (inv === 3 || inv === 8) return "accepted"; // acceptat/semnat de cumpărător
    if (inv === 2) return "rejected";
    if (inv === 5) return "cancelled";
    if (inv === 0 || inv === 1 || inv === 7) return "sent"; // draft/semnat furnizor/trimis
    return fallback;
  }

  try {
    let seria = record.sfsSerialNumber ?? "";
    let number = record.sfsInvoiceId ?? "";
    let newStatus: typeof record.sfsStatus = record.sfsStatus;

    // Sursa de adevăr la reconciliere: SearchInvoices după APIeInvoiceId.
    // Întoarce statutul real chiar și pentru Draft (când Seria/Number sunt încă goale,
    // pentru că SFS le atribuie abia la semnarea manuală în portal).
    const found = await client.searchByApiInvoiceId(invoiceId, randomUUID());

    if (found) {
      newStatus = mapStatus(found.invoiceStatus, record.sfsStatus);
      if (found.seria) seria = found.seria;
      if (found.number) number = found.number;
    }

    // Dacă SFS a atribuit deja serie/număr (factura semnată în portal), putem cere
    // și statutul detaliat prin CheckInvoicesStatus pentru confirmare.
    if (seria && number) {
      try {
        const statusResult = await client.checkInvoiceStatus(seria, number, randomUUID());
        if (statusResult) newStatus = mapStatus(statusResult.invoiceStatus, newStatus);
      } catch {
        // non-fatal — păstrăm statutul din SearchInvoices
      }
    }

    await db
      .update(finEinvoices)
      .set({
        sfsStatus: newStatus,
        sfsSerialNumber: seria || null,
        sfsInvoiceId: number || null,
        lastSyncAt: now,
        updatedAt: now,
      })
      .where(eq(finEinvoices.id, record.id));

    return c.json({
      data: {
        id: record.id,
        sfsStatus: newStatus,
        sfsSerialNumber: seria,
        sfsInvoiceId: number,
        lastSyncAt: now.toISOString(),
      },
    });
  } catch (err) {
    const msg = err instanceof EfacturaMdError ? err.message : String(err);
    return c.json({ error: "sync_failed", detail: msg }, 422);
  }
});

// ─── GET /api/fin/einvoices/:invoiceId/pdf ───────────────────────────────────
// §5.4 GetInvoicesContentForPrint — descarcă PDF-ul oficial al facturii de la SFS.

finEinvoicesRoutes.get("/einvoices/:invoiceId/pdf", async (c) => {
  const user = c.get("user");
  const invoiceId = c.req.param("invoiceId");

  const [record] = await db
    .select()
    .from(finEinvoices)
    .where(and(eq(finEinvoices.finInvoiceId, invoiceId), eq(finEinvoices.tenantId, user.tenantId)))
    .limit(1);

  if (!record) return c.json({ error: "not_found" }, 404);
  if (!record.sfsSerialNumber || !record.sfsInvoiceId) {
    return c.json({ error: "not_reconciled", detail: "Factura nu are încă serie/număr SFS. Semneaz-o în portalul e-Factura, apoi rulează Sincronizează." }, 409);
  }

  const sfsData = await loadSfsConfig(user.tenantId);
  if (!sfsData) return c.json({ error: "sfs_not_configured" }, 400);

  const transport = sfsData.config.mock ? createMockTransport() : undefined;
  const client = new EfacturaMdClient(sfsData.config, transport);

  try {
    const result = await client.getInvoicePdf(
      record.sfsSerialNumber,
      record.sfsInvoiceId,
      randomUUID()
    );
    if (!result) return c.json({ error: "pdf_not_available" }, 404);

    c.header("Content-Type", "application/pdf");
    c.header("Content-Disposition", `inline; filename="${record.sfsSerialNumber}-${record.sfsInvoiceId}.pdf"`);
    return c.body(result.pdf);
  } catch (err) {
    const msg = err instanceof EfacturaMdError ? err.message : String(err);
    return c.json({ error: "pdf_failed", detail: msg }, 422);
  }
});

// ─── GET /api/fin/einvoices/:invoiceId/qr ────────────────────────────────────
// §5.6 GetInvoicesQRcodes — codul QR (PNG base64 + text) al facturii.

finEinvoicesRoutes.get("/einvoices/:invoiceId/qr", async (c) => {
  const user = c.get("user");
  const invoiceId = c.req.param("invoiceId");

  const [record] = await db
    .select()
    .from(finEinvoices)
    .where(and(eq(finEinvoices.finInvoiceId, invoiceId), eq(finEinvoices.tenantId, user.tenantId)))
    .limit(1);

  if (!record) return c.json({ error: "not_found" }, 404);
  if (!record.sfsSerialNumber || !record.sfsInvoiceId) {
    return c.json({ error: "not_reconciled", detail: "Factura nu are încă serie/număr SFS. Semneaz-o în portalul e-Factura, apoi rulează Sincronizează." }, 409);
  }

  const sfsData = await loadSfsConfig(user.tenantId);
  if (!sfsData) return c.json({ error: "sfs_not_configured" }, 400);

  const transport = sfsData.config.mock ? createMockTransport() : undefined;
  const client = new EfacturaMdClient(sfsData.config, transport);

  try {
    const result = await client.getInvoiceQrCode(
      record.sfsSerialNumber,
      record.sfsInvoiceId,
      randomUUID()
    );
    if (!result) return c.json({ error: "qr_not_available" }, 404);

    return c.json({
      data: {
        seria: result.seria,
        number: result.number,
        pngBase64: result.pngBase64,
        text: result.text,
      },
    });
  } catch (err) {
    const msg = err instanceof EfacturaMdError ? err.message : String(err);
    return c.json({ error: "qr_failed", detail: msg }, 422);
  }
});

// ─── POST /api/fin/einvoices/:invoiceId/cancel ────────────────────────────────

finEinvoicesRoutes.post("/einvoices/:invoiceId/cancel", async (c) => {
  const user = c.get("user");
  const invoiceId = c.req.param("invoiceId");

  const rows = await db
    .select()
    .from(finEinvoices)
    .where(
      and(eq(finEinvoices.finInvoiceId, invoiceId), eq(finEinvoices.tenantId, user.tenantId))
    )
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const record = rows[0];

  if (record.sfsStatus !== "sent" && record.sfsStatus !== "accepted") {
    return c.json(
      {
        error: "invalid_status",
        detail: `Anularea este posibilă doar în statusul sent sau accepted (curent: ${record.sfsStatus})`,
      },
      409
    );
  }

  const sfsData = await loadSfsConfig(user.tenantId);
  if (!sfsData) {
    return c.json({ error: "sfs_not_configured" }, 400);
  }

  const transport = sfsData.config.mock ? createMockTransport() : undefined;
  const client = new EfacturaMdClient(sfsData.config, transport);

  const seria = record.sfsSerialNumber;
  const number = record.sfsInvoiceId;

  // Fără Seria/Number reale (atribuite de SFS) nu putem anula la SFS.
  if (!seria || !number) {
    return c.json(
      { error: "not_reconciled", detail: "Seria/numărul SFS lipsesc. Rulează /sync întâi." },
      409
    );
  }

  try {
    await client.cancelInvoice(seria, number, "Anulat de utilizator", randomUUID());

    const now = new Date();
    await db
      .update(finEinvoices)
      .set({ sfsStatus: "cancelled", updatedAt: now })
      .where(eq(finEinvoices.id, record.id));

    return c.json({ data: { id: record.id, sfsStatus: "cancelled" } });
  } catch (err) {
    const msg = err instanceof EfacturaMdError ? err.message : String(err);
    return c.json({ error: "cancel_failed", detail: msg }, 422);
  }
});
