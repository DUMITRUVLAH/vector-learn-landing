/**
 * PAR-EFP: e-Factura de la prestator (după plata unei cereri PAR).
 *
 * Rute (montate la /api/par/efactura în server/app.ts):
 *   GET  /api/par/efactura                              → coada cererilor plătite + starea facturii
 *   POST /api/par/efactura/scan                         → scanează SFS pentru toate cererile în așteptare
 *   GET  /api/par/efactura/invoices                     → TOATE facturile primite în SFS (brut)
 *   GET  /api/par/efactura/invoices/:seria/:number      → conținutul unei facturi (toate câmpurile)
 *   GET  /api/par/efactura/invoices/:seria/:number/pdf  → documentul PDF oficial, din SFS
 *   GET  /api/par/efactura/settings                     → configurarea SFS (par_admin)
 *   PUT  /api/par/efactura/settings                     → salvează configurarea SFS (par_admin)
 *   POST /api/par/efactura/settings/test                → test de conexiune la SFS (par_admin)
 *   GET  /api/par/efactura/requests/:parId              → starea facturii pentru o cerere
 *   POST /api/par/efactura/requests/:parId/scan         → verifică în SFS doar cererea asta
 *   POST /api/par/efactura/requests/:parId/reminder     → email + notificare către SOLICITANT
 *   POST /api/par/efactura/requests/:parId/mark-received→ marchează factura primită manual
 *
 * REUSE (anti-COMPETING_SYSTEM):
 *   - credențialele SFS = `fin_sfs_settings` (EINV-001), nu un al doilea loc de credențiale;
 *   - emailul = `MessagingService` prin serviciul de notificări PAR, nu un provider nou;
 *   - clientul SOAP = `EfacturaMdClient` (EFMD).
 *
 * CORE: backlog/par/PAR-CORE.md §16 (plată) — urmărirea documentului fiscal după plată.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  parRequests,
  parPayments,
  parVendors,
  parAudit,
} from "../db/schema/par";
import { parEinvoices } from "../db/schema/parEinvoices";
import { finSfsSettings } from "../db/schema/finEinvoices";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { canViewPar } from "../lib/par/visibility";
import { accessiblePayerIds, accessibleProjectIds } from "../lib/par/projectScope";
import { encrypt } from "../lib/crypto";
import { loadSfsConfig } from "../lib/fin/sfsConfig";
import { EfacturaMdClient, EFACTURA_MD_STATUS } from "../lib/efacturaMoldova";
import { notifyEfacturaMissing } from "../services/par/notify";
import {
  scanEfacturasForTenant,
  syncEfacturaCandidates,
  listBuyerInvoicesForTenant,
  getBuyerInvoiceDetail,
  getBuyerInvoicePdf,
} from "../services/par/efacturaScan";

export const parEfacturaRoutes = new Hono<{ Variables: AuthVariables }>();
parEfacturaRoutes.use("*", requireAuth);
parEfacturaRoutes.use("/requests/:parId", parUuidGuard("parId"));
parEfacturaRoutes.use("/requests/:parId/*", parUuidGuard("parId"));

/**
 * Un reminder pe zi e suficient — omul care primește emailul are nevoie de timp să sune
 * prestatorul. Fără plafon, butonul devine o unealtă de spam către proprii colegi.
 */
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isElevated(userId: string, tenantId: string): Promise<boolean> {
  const roles = await getUserPARRoles(userId, tenantId);
  return roles.includes("finance") || roles.includes("par_admin");
}

async function writeAudit(params: {
  tenantId: string;
  parId: string;
  actorUserId: string;
  event: string;
  detail: string;
}) {
  await db.insert(parAudit).values({
    tenantId: params.tenantId,
    parId: params.parId,
    actorUserId: params.actorUserId,
    event: params.event,
    detail: params.detail,
  });
}

function fmtAmount(cents: number | null | undefined, currency: string | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return `${v.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency ?? "MDL"}`;
}

/** Forma trimisă în UI pentru starea unei cereri. */
function serializeState(row: typeof parEinvoices.$inferSelect | undefined | null) {
  if (!row) return null;
  return {
    status: row.status,
    supplierIdno: row.supplierIdno,
    sfsSeria: row.sfsSeria,
    sfsNumber: row.sfsNumber,
    sfsInvoiceStatus: row.sfsInvoiceStatus,
    sfsInvoiceStatusLabel:
      row.sfsInvoiceStatus != null ? EFACTURA_MD_STATUS[row.sfsInvoiceStatus] ?? null : null,
    invoiceDate: row.invoiceDate?.toISOString() ?? null,
    invoiceTotalCents: row.invoiceTotalCents,
    lastScanAt: row.lastScanAt?.toISOString() ?? null,
    lastScanSource: row.lastScanSource,
    lastScanMessage: row.lastScanMessage,
    reminderCount: row.reminderCount,
    lastReminderAt: row.lastReminderAt?.toISOString() ?? null,
    lastReminderToEmail: row.lastReminderToEmail,
    markedNote: row.markedNote,
  };
}

/** Rezumatul configurării SFS — fără credențiale, doar dacă există. */
async function sfsSummary(tenantId: string) {
  const [row] = await db
    .select()
    .from(finSfsSettings)
    .where(eq(finSfsSettings.tenantId, tenantId))
    .limit(1);
  if (!row) return { configured: false, environment: null, idno: null, hasCredentials: false, lastTestedAt: null };
  const hasCredentials = !!(row.usernameEncrypted && row.passwordEncrypted);
  return {
    configured: hasCredentials && row.environment !== "mock",
    environment: row.environment,
    idno: row.idno,
    bankAccount: row.bankAccount,
    hasCredentials,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
  };
}

// ─── GET /api/par/efactura — coada ────────────────────────────────────────────

parEfacturaRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  if (!(await isElevated(user.id, tenantId))) {
    return c.json({ error: "forbidden", detail: "Necesită rol finance sau par_admin." }, 403);
  }

  // Coada e derivată din cereri, nu dintr-un tabel scris manual: sincronizăm întâi așteptările,
  // ca o cerere plătită acum 5 minute să apară fără să fi rulat vreo scanare.
  await syncEfacturaCandidates(tenantId);

  const filter = (c.req.query("filter") ?? "missing").toLowerCase();

  const rows = await db
    .select({
      par: parRequests,
      state: parEinvoices,
    })
    .from(parEinvoices)
    .innerJoin(parRequests, eq(parRequests.id, parEinvoices.parId))
    .where(and(eq(parEinvoices.tenantId, tenantId), eq(parRequests.status, "paid")));

  const [projectScope, payerScope] = await Promise.all([
    accessibleProjectIds(user.id, tenantId, user.role),
    accessiblePayerIds(user.id, tenantId, user.role),
  ]);
  const visible = rows.filter(({ par }) =>
    par.projectId
      ? projectScope === null || projectScope.includes(par.projectId)
      : !!par.payerId && (payerScope === null || payerScope.includes(par.payerId))
  );

  const selected = visible.filter(({ state }) => {
    if (filter === "all") return true;
    if (filter === "found") return state.status === "found" || state.status === "received_manual";
    // implicit: doar ce lipsește (asta e treaba de făcut)
    return state.status === "expected";
  });

  const parIds = selected.map(({ par }) => par.id);
  const payments = parIds.length
    ? await db
        .select({ parId: parPayments.parId, actualAmountCents: parPayments.actualAmountCents, paymentDate: parPayments.paymentDate })
        .from(parPayments)
        .where(and(eq(parPayments.tenantId, tenantId), inArray(parPayments.parId, parIds)))
    : [];
  const paymentByPar = new Map(payments.map((p) => [p.parId, p]));

  const vendorIds = [...new Set(selected.map(({ par }) => par.vendorId).filter((v): v is string => !!v))];
  const vendors = vendorIds.length
    ? await db
        .select({ id: parVendors.id, name: parVendors.name, contactEmail: parVendors.contactEmail, contactPhone: parVendors.contactPhone })
        .from(parVendors)
        .where(and(eq(parVendors.tenantId, tenantId), inArray(parVendors.id, vendorIds)))
    : [];
  const vendorById = new Map(vendors.map((v) => [v.id, v]));

  const userIds = [...new Set(selected.map(({ par }) => par.requestedByUserId).filter((v): v is string => !!v))];
  const requestors = userIds.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds)))
    : [];
  const userById = new Map(requestors.map((u) => [u.id, u]));

  const items = selected
    .map(({ par, state }) => {
      const payment = paymentByPar.get(par.id);
      const vendor = par.vendorId ? vendorById.get(par.vendorId) : undefined;
      const requestor = userById.get(par.requestedByUserId);
      return {
        parId: par.id,
        requestNo: par.requestNo,
        payeeName: par.payeeName ?? vendor?.name ?? "—",
        payeeIdnp: par.payeeIdnp ?? null,
        vendorContactEmail: vendor?.contactEmail ?? null,
        endUse: par.endUse ?? null,
        currency: par.currency,
        amountCents: payment?.actualAmountCents ?? par.totalEstimatedCents,
        paidAt: (payment?.paymentDate ?? par.paidAt)?.toISOString() ?? null,
        requestedBy: requestor ? { id: requestor.id, name: requestor.name, email: requestor.email } : null,
        state: serializeState(state),
      };
    })
    .sort((a, b) => (a.paidAt ?? "").localeCompare(b.paidAt ?? ""));

  const counts = {
    missing: visible.filter(({ state }) => state.status === "expected").length,
    found: visible.filter(({ state }) => state.status === "found").length,
    receivedManual: visible.filter(({ state }) => state.status === "received_manual").length,
    notApplicable: visible.filter(({ state }) => state.status === "not_applicable").length,
  };

  return c.json({ items, counts, filter, sfs: await sfsSummary(tenantId) });
});

// ─── POST /api/par/efactura/scan — scanare pe tot workspace-ul ────────────────

parEfacturaRoutes.post("/scan", async (c) => {
  const user = c.get("user");
  if (!(await isElevated(user.id, user.tenantId))) {
    return c.json({ error: "forbidden", detail: "Necesită rol finance sau par_admin." }, 403);
  }
  const result = await scanEfacturasForTenant(user.tenantId);
  return c.json({ result, sfs: await sfsSummary(user.tenantId) });
});

// ─── GET /api/par/efactura/invoices — toate facturile primite din SFS ────────

/**
 * Lista brută: ce facturi are organizația în SFS ca CUMPĂRĂTOR, indiferent dacă sunt legate de o
 * cerere PAR. Răspunde la „ce mi-a emis lumea", nu la „cererea X are factură" — inclusiv facturile
 * pentru care nu există niciun PAR (abonamente, livrări directe) și cele respinse.
 */
parEfacturaRoutes.get("/invoices", async (c) => {
  const user = c.get("user");
  if (!(await isElevated(user.id, user.tenantId))) {
    return c.json({ error: "forbidden", detail: "Necesită rol finance sau par_admin." }, 403);
  }
  // `?refresh=1` = omul a apăsat „Reîncarcă din SFS"; altfel se poate servi cache-ul scurt, ca
  // deschiderea repetată a tabului să nu consume bugetul de cereri al SFS-ului.
  const force = c.req.query("refresh") === "1";
  const result = await listBuyerInvoicesForTenant(user.tenantId, undefined, force);
  return c.json({ ...result, sfs: await sfsSummary(user.tenantId) });
});

/** Seria/numărul vin din URL — le validăm strict, ca să nu ajungă gunoi în cererea SOAP. */
const INVOICE_ID_RE = /^[A-Za-z0-9-]{1,50}$/;

/**
 * Conținutul unei facturi primite — furnizor, cumpărător, date, totaluri, liniile de marfă.
 * Asta răspunde la „ce scrie, de fapt, în factura asta?", fără să deschizi portalul SFS.
 */
parEfacturaRoutes.get("/invoices/:seria/:number", async (c) => {
  const user = c.get("user");
  if (!(await isElevated(user.id, user.tenantId))) {
    return c.json({ error: "forbidden", detail: "Necesită rol finance sau par_admin." }, 403);
  }
  const seria = c.req.param("seria");
  const number = c.req.param("number");
  if (!INVOICE_ID_RE.test(seria) || !INVOICE_ID_RE.test(number)) {
    return c.json({ error: "invalid_invoice_id" }, 400);
  }
  return c.json(await getBuyerInvoiceDetail(user.tenantId, seria, number));
});

/** Documentul PDF oficial, servit inline ca omul să-l poată citi în browser. */
parEfacturaRoutes.get("/invoices/:seria/:number/pdf", async (c) => {
  const user = c.get("user");
  if (!(await isElevated(user.id, user.tenantId))) {
    return c.json({ error: "forbidden", detail: "Necesită rol finance sau par_admin." }, 403);
  }
  const seria = c.req.param("seria");
  const number = c.req.param("number");
  if (!INVOICE_ID_RE.test(seria) || !INVOICE_ID_RE.test(number)) {
    return c.json({ error: "invalid_invoice_id" }, 400);
  }
  const res = await getBuyerInvoicePdf(user.tenantId, seria, number);
  if ("error" in res) return c.json({ error: "pdf_unavailable", detail: res.error }, 502);
  return new Response(new Uint8Array(res.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="e-factura-${seria}-${number}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
});

// ─── Configurarea SFS (par_admin) ─────────────────────────────────────────────

parEfacturaRoutes.get("/settings", async (c) => {
  const user = c.get("user");
  const roles = await getUserPARRoles(user.id, user.tenantId);
  if (!roles.includes("par_admin")) return c.json({ error: "forbidden" }, 403);
  return c.json({ sfs: await sfsSummary(user.tenantId) });
});

const settingsSchema = z.object({
  idno: z.string().trim().min(5).max(13),
  bank_account: z.string().trim().min(5).max(34),
  environment: z.enum(["mock", "test", "prod"]),
  username: z.string().trim().max(200).optional(),
  password: z.string().trim().max(200).optional(),
});

parEfacturaRoutes.put("/settings", zValidator("json", settingsSchema), async (c) => {
  const user = c.get("user");
  const roles = await getUserPARRoles(user.id, user.tenantId);
  if (!roles.includes("par_admin")) return c.json({ error: "forbidden" }, 403);

  const body = c.req.valid("json");
  const now = new Date();
  const [existing] = await db
    .select({ id: finSfsSettings.id })
    .from(finSfsSettings)
    .where(eq(finSfsSettings.tenantId, user.tenantId))
    .limit(1);

  if (existing) {
    const values: Partial<typeof finSfsSettings.$inferInsert> = {
      idno: body.idno,
      bankAccount: body.bank_account,
      environment: body.environment,
      updatedAt: now,
    };
    // Credențialele se rescriu doar când chiar au fost tastate — un PUT fără ele nu le șterge.
    if (body.username) values.usernameEncrypted = encrypt(body.username);
    if (body.password) values.passwordEncrypted = encrypt(body.password);
    await db.update(finSfsSettings).set(values).where(eq(finSfsSettings.tenantId, user.tenantId));
  } else {
    await db.insert(finSfsSettings).values({
      tenantId: user.tenantId,
      idno: body.idno,
      bankAccount: body.bank_account,
      environment: body.environment,
      usernameEncrypted: body.username ? encrypt(body.username) : null,
      passwordEncrypted: body.password ? encrypt(body.password) : null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return c.json({ sfs: await sfsSummary(user.tenantId) });
});

parEfacturaRoutes.post("/settings/test", async (c) => {
  const user = c.get("user");
  const roles = await getUserPARRoles(user.id, user.tenantId);
  if (!roles.includes("par_admin")) return c.json({ error: "forbidden" }, 403);

  const sfs = await loadSfsConfig(user.tenantId);
  if (!sfs) {
    return c.json({ ok: false, message: "Configurarea SFS lipsește — completeaz-o mai întâi." });
  }
  if (sfs.config.mock) {
    return c.json({
      ok: false,
      message: "Rulează în mod simulat (mediu mock sau credențiale lipsă) — nu se face niciun apel real.",
    });
  }
  const client = new EfacturaMdClient(sfs.config);
  const result = await client.testConnection(`par-efp-test-${Date.now()}`);
  if (result.ok) {
    await db
      .update(finSfsSettings)
      .set({ lastTestedAt: new Date(), updatedAt: new Date() })
      .where(eq(finSfsSettings.tenantId, user.tenantId));
  }
  return c.json(result);
});

// ─── O singură cerere ─────────────────────────────────────────────────────────

/** Încarcă cererea + verifică dreptul de vizualizare. Întoarce null când nu e permis/nu există. */
async function loadViewablePar(
  user: { id: string; tenantId: string; role?: string | null },
  parId: string
): Promise<typeof parRequests.$inferSelect | null> {
  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, user.tenantId)));
  if (!par) return null;
  const allowed = await canViewPar(user, user.tenantId, par);
  return allowed ? par : null;
}

parEfacturaRoutes.get("/requests/:parId", async (c) => {
  const user = c.get("user");
  const parId = c.req.param("parId");
  const par = await loadViewablePar(user, parId);
  if (!par) return c.json({ error: "not_found" }, 404);

  await syncEfacturaCandidates(user.tenantId, [parId]);
  const [state] = await db
    .select()
    .from(parEinvoices)
    .where(and(eq(parEinvoices.tenantId, user.tenantId), eq(parEinvoices.parId, parId)));

  const vendor = par.vendorId
    ? (
        await db
          .select({ name: parVendors.name, contactEmail: parVendors.contactEmail, contactPhone: parVendors.contactPhone })
          .from(parVendors)
          .where(and(eq(parVendors.id, par.vendorId), eq(parVendors.tenantId, user.tenantId)))
      )[0]
    : undefined;

  return c.json({
    parId,
    requestNo: par.requestNo,
    payeeName: par.payeeName ?? vendor?.name ?? "—",
    vendorContactEmail: vendor?.contactEmail ?? null,
    canManage: await isElevated(user.id, user.tenantId),
    state: serializeState(state),
    sfs: await sfsSummary(user.tenantId),
  });
});

parEfacturaRoutes.post("/requests/:parId/scan", async (c) => {
  const user = c.get("user");
  const parId = c.req.param("parId");
  const par = await loadViewablePar(user, parId);
  if (!par) return c.json({ error: "not_found" }, 404);

  const result = await scanEfacturasForTenant(user.tenantId, [parId]);
  const [state] = await db
    .select()
    .from(parEinvoices)
    .where(and(eq(parEinvoices.tenantId, user.tenantId), eq(parEinvoices.parId, parId)));

  return c.json({ result, state: serializeState(state), sfs: await sfsSummary(user.tenantId) });
});

// ─── Reminder către solicitant ────────────────────────────────────────────────

parEfacturaRoutes.post("/requests/:parId/reminder", async (c) => {
  const user = c.get("user");
  const parId = c.req.param("parId");
  const par = await loadViewablePar(user, parId);
  if (!par) return c.json({ error: "not_found" }, 404);

  const [state] = await db
    .select()
    .from(parEinvoices)
    .where(and(eq(parEinvoices.tenantId, user.tenantId), eq(parEinvoices.parId, parId)));

  if (!state || state.status !== "expected") {
    // Nu trimitem reminder pentru o factură deja primită sau pentru o persoană fizică — ar fi un
    // email fals, iar cine îl primește nu are ce face cu el.
    return c.json(
      {
        error: "not_expected",
        detail:
          state?.status === "found" || state?.status === "received_manual"
            ? "Factura este deja înregistrată pentru această cerere."
            : "Această cerere nu așteaptă o e-Factura.",
      },
      409
    );
  }

  const last = state.lastReminderAt?.getTime() ?? 0;
  if (Date.now() - last < REMINDER_COOLDOWN_MS) {
    return c.json(
      {
        error: "too_soon",
        detail: "Un reminder a fost deja trimis în ultimele 24 de ore.",
        nextAllowedAt: new Date(last + REMINDER_COOLDOWN_MS).toISOString(),
      },
      429
    );
  }

  const vendor = par.vendorId
    ? (
        await db
          .select({ name: parVendors.name, contactEmail: parVendors.contactEmail, contactPhone: parVendors.contactPhone })
          .from(parVendors)
          .where(and(eq(parVendors.id, par.vendorId), eq(parVendors.tenantId, user.tenantId)))
      )[0]
    : undefined;
  const [payment] = await db
    .select({ actualAmountCents: parPayments.actualAmountCents, paymentDate: parPayments.paymentDate })
    .from(parPayments)
    .where(and(eq(parPayments.tenantId, user.tenantId), eq(parPayments.parId, parId)));

  const paidAt = payment?.paymentDate ?? par.paidAt;
  const contact = [vendor?.contactEmail, vendor?.contactPhone].filter(Boolean).join(" · ") || null;

  const outcome = await notifyEfacturaMissing(
    { tenantId: user.tenantId, parId, requestNo: par.requestNo },
    par.requestedByUserId,
    {
      payeeName: par.payeeName ?? vendor?.name ?? "prestatorul",
      amountLabel: fmtAmount(payment?.actualAmountCents ?? par.totalEstimatedCents, par.currency),
      servicesLabel: (par.endUse ?? "").trim() || "serviciile din cerere",
      paidAtLabel: paidAt ? paidAt.toLocaleDateString("ro-MD") : null,
      vendorContact: contact,
    }
  );

  const now = new Date();
  await db
    .update(parEinvoices)
    .set({
      reminderCount: state.reminderCount + 1,
      lastReminderAt: now,
      lastReminderToEmail: outcome.toAddress,
      updatedAt: now,
    })
    .where(eq(parEinvoices.id, state.id));

  await writeAudit({
    tenantId: user.tenantId,
    parId,
    actorUserId: user.id,
    event: "efactura_reminder",
    detail: `Reminder e-Factura trimis solicitantului${outcome.toAddress ? ` (${outcome.toAddress})` : ""}.`,
  });

  return c.json({
    sent: true,
    emailed: outcome.emailed,
    toAddress: outcome.toAddress,
    reminderCount: state.reminderCount + 1,
    lastReminderAt: now.toISOString(),
  });
});

// ─── Marcare manuală ──────────────────────────────────────────────────────────

const markSchema = z.object({
  seria: z.string().trim().max(20).optional(),
  number: z.string().trim().max(50).optional(),
  note: z.string().trim().max(500).optional(),
});

parEfacturaRoutes.post("/requests/:parId/mark-received", zValidator("json", markSchema), async (c) => {
  const user = c.get("user");
  const parId = c.req.param("parId");
  const par = await loadViewablePar(user, parId);
  if (!par) return c.json({ error: "not_found" }, 404);
  if (!(await isElevated(user.id, user.tenantId))) {
    return c.json({ error: "forbidden", detail: "Necesită rol finance sau par_admin." }, 403);
  }

  const body = c.req.valid("json");
  const [state] = await db
    .select()
    .from(parEinvoices)
    .where(and(eq(parEinvoices.tenantId, user.tenantId), eq(parEinvoices.parId, parId)));
  if (!state) return c.json({ error: "not_found" }, 404);

  const now = new Date();
  await db
    .update(parEinvoices)
    .set({
      status: "received_manual",
      sfsSeria: body.seria || state.sfsSeria,
      sfsNumber: body.number || state.sfsNumber,
      markedByUserId: user.id,
      markedNote: body.note ?? null,
      updatedAt: now,
    })
    .where(eq(parEinvoices.id, state.id));

  await writeAudit({
    tenantId: user.tenantId,
    parId,
    actorUserId: user.id,
    event: "efactura_marked_received",
    detail: `Factura marcată ca primită manual${body.seria || body.number ? ` (${[body.seria, body.number].filter(Boolean).join(" ")})` : ""}.`,
  });

  const [updated] = await db.select().from(parEinvoices).where(eq(parEinvoices.id, state.id));
  return c.json({ state: serializeState(updated) });
});

export default parEfacturaRoutes;
