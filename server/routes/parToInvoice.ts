/**
 * PAR-FIN-001: bridge PAR → FinDesk invoice (integration flow A from the audit).
 *
 * POST /api/par/:id/to-invoice
 *   Creates a FinDesk DRAFT invoice pre-filled from an approved/paid PAR:
 *   beneficiary → fin_parties (find-or-create, kind=supplier), amount + end_use → one line.
 *   Returns { invoiceId } so the UI can deep-link to /business/fin/invoices and, from there,
 *   the user can review and (if applicable) submit to e-Factura via the EXISTING flow.
 *
 * Why a draft, and why NOT auto-submit to SFS: e-Factura is a fiscal SALES document issued
 * to a BUYER. A PAR beneficiary is a SUPPLIER we pay. Auto-filing an e-Factura from a PAR
 * could lodge an incorrect fiscal document at the paying client, so this bridge stops at a
 * reviewable draft invoice — the SFS submit stays the deliberate, existing action on the invoice.
 *
 * Mounted in server/app.ts BEFORE the catch-all parRoutes.
 */
import { Hono } from "hono";
import { and, eq, max } from "drizzle-orm";
import { db } from "../db/client";
import { parRequests, parLineItems } from "../db/schema/par";
import { finInvoices, finInvoiceLines } from "../db/schema/finInvoices";
import { finParties } from "../db/schema/finParties";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";

export const parToInvoiceRoutes = new Hono<{ Variables: AuthVariables }>();
parToInvoiceRoutes.use("*", requireAuth);

/** IDNO/IBAN must match FinDesk's party validators or the insert is rejected. */
const IDNO_RE = /^[A-Z0-9]{1,13}$/i;
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/;

function formatInvoiceNumber(series: string, year: number, n: number): string {
  return `${series}-${year}-${String(n).padStart(5, "0")}`;
}

parToInvoiceRoutes.post("/:id/to-invoice", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");

  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
    .limit(1);
  if (!par) return c.json({ error: "not_found" }, 404);

  // Only the requestor or an elevated role can bridge a PAR to an invoice.
  const roles = await getUserPARRoles(user.id, tenantId, user.role);
  const elevated = roles.some((r) => ["approver", "finance", "par_admin"].includes(r));
  if (!elevated && par.requestedByUserId !== user.id) {
    return c.json({ error: "forbidden" }, 403);
  }

  // Bridge only makes sense once the PAR is approved (or further along).
  const okStatuses = ["approved", "in_finance", "paid"];
  if (!okStatuses.includes(par.status)) {
    return c.json(
      { error: "not_approved", detail: "Doar cererile aprobate pot genera o factură." },
      409
    );
  }

  if (!par.payeeName?.trim()) {
    return c.json(
      { error: "no_payee", detail: "Cererea nu are un beneficiar — completează beneficiarul întâi." },
      422
    );
  }

  // ── Find-or-create the supplier party from the PAR beneficiary ──────────────
  const idno = par.payeeIdnp && IDNO_RE.test(par.payeeIdnp) ? par.payeeIdnp : null;
  const iban = par.payeeIban && IBAN_RE.test(par.payeeIban) ? par.payeeIban : null;

  let partyId: string | null = null;
  if (idno) {
    const [existing] = await db
      .select({ id: finParties.id })
      .from(finParties)
      .where(and(eq(finParties.tenantId, tenantId), eq(finParties.idno, idno)))
      .limit(1);
    partyId = existing?.id ?? null;
  }
  if (!partyId) {
    const [party] = await db
      .insert(finParties)
      .values({
        tenantId,
        kind: "supplier",
        name: par.payeeName.slice(0, 500),
        idno,
        iban,
        isActive: true,
      })
      .returning({ id: finParties.id });
    partyId = party.id;
  }

  // ── Create the draft invoice + one line from the PAR total + end_use ────────
  const [maxRow] = await db
    .select({ max: max(finInvoices.number) })
    .from(finInvoices)
    .where(eq(finInvoices.tenantId, tenantId));
  const nextNumber = (maxRow?.max ?? 0) + 1;
  const year = new Date().getFullYear();
  const series = "FIN";

  // Pull PAR line items for a faithful description; fall back to end_use / a generic label.
  const parLines = await db
    .select()
    .from(parLineItems)
    .where(and(eq(parLineItems.tenantId, tenantId), eq(parLineItems.parId, parId)));

  const totalCents = par.totalEstimatedCents;
  const description =
    (par.endUse?.trim() ||
      parLines.map((l) => l.description).filter(Boolean).join("; ") ||
      `Plată conform cererii ${par.requestNo}`).slice(0, 2000);

  const [invoice] = await db
    .insert(finInvoices)
    .values({
      tenantId,
      partyId,
      series,
      number: nextNumber,
      invoiceNumber: formatInvoiceNumber(series, year, nextNumber),
      currency: par.currency ?? "MDL",
      notes: `Generat din PAR ${par.requestNo}`,
      totalCents,
      vatTotalCents: 0, // PAR amounts are gross/undeclared-VAT; the accountant sets VAT on review.
    })
    .returning();

  await db.insert(finInvoiceLines).values({
    invoiceId: invoice.id,
    description,
    quantity: 1,
    unitPriceCents: totalCents,
    vatPct: 0,
    lineTotalCents: totalCents,
  });

  return c.json({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, partyId }, 201);
});
