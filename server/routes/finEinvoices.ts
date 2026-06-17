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
    // URL-ul REAL al serviciului SOAP SFS, confirmat din WSDL live
    // (https://efactura-api.sfs.md/Service.svc?wsdl, namespace tempuri.org,
    // SOAPAction http://tempuri.org/IService/<Method>). Ghidul listează
    // `api-test.fisc.md`, dar acel domeniu nu există în DNS — nu îl folosi.
    // Test și prod folosesc același host (SFS nu expune un sandbox separat aici).
    endpoint: "https://efactura-api.sfs.md/Service.svc",
    username: hasCredentials ? decrypt(s.usernameEncrypted!) : "",
    password: hasCredentials ? decrypt(s.passwordEncrypted!) : "",
    supplierIdno: s.idno,
    supplierBankAccount: s.bankAccount,
    // mock when: environment=mock OR no credentials
    mock: s.environment === "mock" || !hasCredentials,
  };

  return { config, settings: s };
}

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

  // ── Load the real invoice + buyer + line items ──────────────────────────────
  const [invoice] = await db
    .select()
    .from(finInvoices)
    .where(and(eq(finInvoices.id, invoiceId), eq(finInvoices.tenantId, user.tenantId)))
    .limit(1);

  if (!invoice) {
    return c.json({ error: "invoice_not_found" }, 404);
  }

  // Buyer IDNO + bank from fin_parties (the invoice recipient).
  let buyerIdno = "";
  let buyerBankAccount: string | undefined;
  if (invoice.partyId) {
    const [party] = await db
      .select()
      .from(finParties)
      .where(and(eq(finParties.id, invoice.partyId), eq(finParties.tenantId, user.tenantId)))
      .limit(1);
    buyerIdno = party?.idno ?? "";
    buyerBankAccount = party?.iban ?? undefined;
  }

  if (!buyerIdno) {
    return c.json({ error: "buyer_idno_missing", detail: "Factura nu are un cumpărător cu IDNO." }, 422);
  }

  // SFS cere OBLIGATORIU contul bancar al cumpărătorului (Buyer/BankAccount).
  // Fără el, PostInvoices eșuează cu "Object reference not set to an instance of
  // an object" (NullReferenceException pe server). Verificat live. Blocăm cu mesaj
  // clar în loc să lăsăm SFS să dea eroarea criptică.
  if (!buyerBankAccount) {
    return c.json(
      {
        error: "buyer_iban_missing",
        detail:
          "Cumpărătorul nu are cont bancar (IBAN) completat. SFS îl cere obligatoriu. " +
          "Adaugă IBAN-ul partenerului în fișa lui, apoi retrimite.",
      },
      422
    );
  }

  const lineRows = await db
    .select()
    .from(finInvoiceLines)
    .where(eq(finInvoiceLines.invoiceId, invoiceId));

  if (lineRows.length === 0) {
    return c.json({ error: "invoice_has_no_lines" }, 422);
  }

  const lines: SfsInvoiceLine[] = lineRows.map((l, i) => ({
    code: l.serviceId ?? String(i + 1),
    name: l.description,
    unitOfMeasure: "buc",
    quantity: l.quantity,
    // cents → currency units, fără TVA (unitPriceCents e prețul unitar fără TVA).
    unitPriceWithoutVat: l.unitPriceCents / 100,
    vatRate: l.vatPct,
  }));

  const requestId = randomUUID();
  const now = new Date();

  let xml: string;
  try {
    xml = generateSfsInvoiceXml({
      supplierIdno: config.supplierIdno,
      supplierBankAccount: config.supplierBankAccount,
      buyerIdno,
      buyerBankAccount,
      deliveryDate: invoice.issuedAt ?? now,
      // APIeInvoiceId — îl folosim la reconciliere (SearchInvoices §5.15) ca să
      // aflăm Seria/Number atribuite de SFS după postare.
      internalId: invoiceId,
      lines,
    });
  } catch (err) {
    return c.json(
      { error: "xml_generation_failed", detail: err instanceof Error ? err.message : String(err) },
      500
    );
  }

  try {
    const result = await client.postInvoices(xml, requestId);

    // În fluxul semiautomatizat SFS atribuie Seria + Number la postare. Le aflăm
    // imediat după, căutând după APIeInvoiceId (= invoiceId). Dacă încă nu e
    // indexată, rămân null și se completează la următorul /sync.
    let sfsSerialNumber: string | null = null;
    let sfsNumber: string | null = null;
    if (!result.errorMessage) {
      try {
        const found = await client.searchByApiInvoiceId(invoiceId, randomUUID());
        if (found) {
          sfsSerialNumber = found.seria || null;
          sfsNumber = found.number || null;
        }
      } catch {
        // Reconcilierea poate întârzia; nu blocăm trimiterea pentru asta.
      }
    }
    const sfsInvoiceId = sfsNumber;

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
