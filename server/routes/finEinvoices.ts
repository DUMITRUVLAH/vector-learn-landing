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
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db/client";
import { finSfsSettings, finEinvoices } from "../db/schema/finEinvoices";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { encrypt, decrypt } from "../lib/crypto";
import {
  EfacturaMdClient,
  EfacturaMdError,
  generateSfsInvoiceXml,
  createMockTransport,
  type EfacturaMdConfig,
  type SfsInvoiceLine,
} from "../lib/efacturaMoldova";

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

// ─── Helper: load + decrypt SFS config for a tenant ─────────────────────────

async function loadSfsConfig(
  tenantId: string
): Promise<{ config: EfacturaMdConfig; settings: typeof finSfsSettings.$inferSelect } | null> {
  const rows = await db
    .select()
    .from(finSfsSettings)
    .where(eq(finSfsSettings.tenantId, tenantId))
    .limit(1);

  if (rows.length === 0) return null;

  const s = rows[0];
  const hasCredentials = !!(s.usernameEncrypted && s.passwordEncrypted);

  const config: EfacturaMdConfig = {
    endpoint:
      s.environment === "prod"
        ? "https://api.fisc.md/Service.svc"
        : "https://api-test.fisc.md/Service.svc",
    username: hasCredentials ? decrypt(s.usernameEncrypted!) : "",
    password: hasCredentials ? decrypt(s.passwordEncrypted!) : "",
    supplierIdno: s.idno,
    supplierBankAccount: s.bankAccount,
    // mock when: environment=mock OR no credentials
    mock: s.environment === "mock" || !hasCredentials,
  };

  return { config, settings: s };
}

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

  // Load SFS settings
  const sfsData = await loadSfsConfig(user.tenantId);
  if (!sfsData) {
    return c.json({ error: "sfs_not_configured" }, 400);
  }

  const { config } = sfsData;

  // Check if already submitted
  const existing = await db
    .select()
    .from(finEinvoices)
    .where(
      and(eq(finEinvoices.finInvoiceId, invoiceId), eq(finEinvoices.tenantId, user.tenantId))
    )
    .limit(1);

  if (existing.length > 0 && existing[0].sfsStatus !== "pending") {
    return c.json(
      {
        error: "already_submitted",
        sfsStatus: existing[0].sfsStatus,
      },
      409
    );
  }

  // Build SFS client — REUSE EfacturaMdClient
  const transport = config.mock ? createMockTransport() : undefined;
  const client = new EfacturaMdClient(config, transport);

  // Build minimal SFS invoice XML
  // In a full implementation, line items come from fin_invoice_lines (BILL-002).
  // For EINV-002 scope: use a placeholder line until the FK is enforced post-merge.
  const placeholderLine: SfsInvoiceLine = {
    code: "SVC001",
    name: "Servicii educationale",
    unitOfMeasure: "buc",
    quantity: 1,
    unitPriceWithoutVat: 1000,
    vatRate: 20,
  };

  const requestId = randomUUID();

  let xml: string;
  try {
    xml = generateSfsInvoiceXml({
      supplierIdno: config.supplierIdno,
      supplierBankAccount: config.supplierBankAccount,
      buyerIdno: "0000000000000", // placeholder — real value from fin_parties.idno
      lines: [placeholderLine],
    });
  } catch (err) {
    return c.json(
      { error: "xml_generation_failed", detail: err instanceof Error ? err.message : String(err) },
      500
    );
  }

  const now = new Date();

  try {
    const result = await client.postInvoices(xml, requestId);

    const sfsSerialNumber = result.errorMessage
      ? null
      : `EFMD-${invoiceId.slice(0, 8).toUpperCase()}`;
    const sfsInvoiceId = result.requestId ?? null;

    // Upsert fin_einvoices row
    if (existing.length > 0) {
      await db
        .update(finEinvoices)
        .set({
          sfsStatus: "sent",
          sfsSerialNumber,
          sfsInvoiceId,
          sfsRequestStatus: result.status,
          sfsErrorMessage: result.errorMessage,
          submittedAt: now,
          updatedAt: now,
        })
        .where(eq(finEinvoices.id, existing[0].id));
    } else {
      await db.insert(finEinvoices).values({
        tenantId: user.tenantId,
        finInvoiceId: invoiceId,
        sfsStatus: "sent",
        sfsSerialNumber,
        sfsInvoiceId,
        sfsRequestStatus: result.status,
        sfsErrorMessage: result.errorMessage,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const [row] = await db
      .select()
      .from(finEinvoices)
      .where(
        and(eq(finEinvoices.finInvoiceId, invoiceId), eq(finEinvoices.tenantId, user.tenantId))
      )
      .limit(1);

    return c.json({ data: { id: row.id, sfsStatus: row.sfsStatus, submittedAt: row.submittedAt?.toISOString() ?? null } });
  } catch (err) {
    const msg = err instanceof EfacturaMdError ? err.message : String(err);

    // Update or insert row with error state
    if (existing.length > 0) {
      await db
        .update(finEinvoices)
        .set({ sfsStatus: "pending", sfsErrorMessage: msg, updatedAt: now })
        .where(eq(finEinvoices.id, existing[0].id));
    } else {
      await db.insert(finEinvoices).values({
        tenantId: user.tenantId,
        finInvoiceId: invoiceId,
        sfsStatus: "pending",
        sfsErrorMessage: msg,
        createdAt: now,
        updatedAt: now,
      });
    }

    return c.json({ error: "sfs_submission_failed", detail: msg }, 422);
  }
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

  const seria = record.sfsSerialNumber ?? "EFMD";
  const number = record.sfsInvoiceId ?? "000000001";
  const requestId = randomUUID();

  const now = new Date();

  try {
    const statusResult = await client.checkInvoiceStatus(seria, number, requestId);

    let newStatus: typeof record.sfsStatus = record.sfsStatus;
    if (statusResult) {
      const inv = statusResult.invoiceStatus;
      // Map SFS invoice status codes to our enum
      if (inv === 3 || inv === 8) newStatus = "accepted"; // accepted by buyer
      else if (inv === 2) newStatus = "rejected";
      else if (inv === 5) newStatus = "cancelled";
      else if (inv === 1 || inv === 7) newStatus = "sent"; // signed/sent
    }

    await db
      .update(finEinvoices)
      .set({ sfsStatus: newStatus, lastSyncAt: now, updatedAt: now })
      .where(eq(finEinvoices.id, record.id));

    return c.json({ data: { id: record.id, sfsStatus: newStatus, lastSyncAt: now.toISOString() } });
  } catch (err) {
    const msg = err instanceof EfacturaMdError ? err.message : String(err);
    return c.json({ error: "sync_failed", detail: msg }, 422);
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

  const seria = record.sfsSerialNumber ?? "EFMD";
  const number = record.sfsInvoiceId ?? "000000001";

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
