/**
 * BANK-INV-001: bank-statement line → FinDesk draft invoice (→ e-Factura).
 *
 * The user uploads a month-end bank statement (PDF/CSV/photo); the AI extracts
 * every transaction into fin_capture_lines. For an INCOMING payment (a client
 * paid the company), this turns one line into a draft client invoice that can
 * then go to e-Factura.
 *
 * POST /api/fin/captures/lines/:lineId/to-invoice
 *   - only for direction="in" lines (you invoice clients who paid you)
 *   - find-or-create a CLIENT party from the counterparty name + IDNO
 *     (IDNO is matched from the AI value or re-derived from the description)
 *   - create a DRAFT invoice (one line; VAT 0 for the accountant to set on review)
 *   - returns { invoiceId } so the UI can deep-link to the invoice doc / e-Factura
 *
 * Stops at a reviewable draft — never auto-submits to SFS. Mounted at /api/fin.
 */
import { Hono } from "hono";
import { and, eq, max } from "drizzle-orm";
import { db } from "../db/client";
import { finCaptureLines } from "../db/schema/finCaptures";
import { finInvoices, finInvoiceLines } from "../db/schema/finInvoices";
import { finParties } from "../db/schema/finParties";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finLineToInvoiceRoutes = new Hono<{ Variables: AuthVariables }>();
finLineToInvoiceRoutes.use("*", requireAuth);

const IDNO_RE = /^[A-Z0-9]{1,13}$/i;

/** Re-derive an IDNO (13 digits, optionally tagged) from a statement line description. */
function idnoFromDescription(desc: string): string | null {
  const tagged = desc.match(/(?:IDNO|c\/f|cod\s*fiscal)\D{0,5}(\d{13})/i);
  if (tagged) return tagged[1];
  const bare = desc.match(/(?<!\d)\d{13}(?!\d)/);
  return bare ? bare[0] : null;
}

function formatInvoiceNumber(series: string, year: number, n: number): string {
  return `${series}-${year}-${String(n).padStart(5, "0")}`;
}

finLineToInvoiceRoutes.post("/captures/lines/:lineId/to-invoice", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const lineId = c.req.param("lineId");

  const [line] = await db
    .select()
    .from(finCaptureLines)
    .where(and(eq(finCaptureLines.id, lineId), eq(finCaptureLines.tenantId, tenantId)))
    .limit(1);
  if (!line) return c.json({ error: "not_found" }, 404);

  // e-Factura is a SALES invoice to a buyer → only incoming payments qualify.
  if (line.direction !== "in") {
    return c.json(
      { error: "not_incoming", detail: "Doar încasările (intrări) pot genera o factură de vânzare." },
      409
    );
  }
  if (line.amountCents <= 0) {
    return c.json({ error: "zero_amount", detail: "Tranzacția nu are sumă." }, 422);
  }

  const name = (line.counterparty || line.description || "Client").slice(0, 500);
  const idno = idnoFromDescription(line.description);
  const validIdno = idno && IDNO_RE.test(idno) ? idno : null;

  // ── Find-or-create the CLIENT party (matched by IDNO, else by name) ─────────
  let partyId: string | null = null;
  if (validIdno) {
    const [byIdno] = await db
      .select({ id: finParties.id })
      .from(finParties)
      .where(and(eq(finParties.tenantId, tenantId), eq(finParties.idno, validIdno)))
      .limit(1);
    partyId = byIdno?.id ?? null;
  }
  if (!partyId && line.counterparty) {
    const [byName] = await db
      .select({ id: finParties.id })
      .from(finParties)
      .where(and(eq(finParties.tenantId, tenantId), eq(finParties.name, name)))
      .limit(1);
    partyId = byName?.id ?? null;
  }
  if (!partyId) {
    const [party] = await db
      .insert(finParties)
      .values({ tenantId, kind: "client", name, idno: validIdno, isActive: true })
      .returning({ id: finParties.id });
    partyId = party.id;
  }

  // ── Create the draft invoice + one line ─────────────────────────────────────
  const [maxRow] = await db
    .select({ max: max(finInvoices.number) })
    .from(finInvoices)
    .where(eq(finInvoices.tenantId, tenantId));
  const nextNumber = (maxRow?.max ?? 0) + 1;
  const year = new Date().getFullYear();
  const series = "FIN";
  const currency = line.currency ?? "MDL";

  const [invoice] = await db
    .insert(finInvoices)
    .values({
      tenantId,
      partyId,
      series,
      number: nextNumber,
      invoiceNumber: formatInvoiceNumber(series, year, nextNumber),
      currency,
      dueDate: line.txDate ?? null,
      notes: `Generat din extras bancar — ${line.description}`.slice(0, 2000),
      totalCents: line.amountCents,
      vatTotalCents: 0, // accountant sets VAT on review before e-Factura
    })
    .returning();

  await db.insert(finInvoiceLines).values({
    invoiceId: invoice.id,
    description: (line.counterparty ? `Încasare de la ${line.counterparty}` : line.description).slice(0, 2000),
    quantity: 1,
    unitPriceCents: line.amountCents,
    vatPct: 0,
    lineTotalCents: line.amountCents,
  });

  return c.json(
    { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, partyId, idnoFound: !!validIdno },
    201
  );
});
