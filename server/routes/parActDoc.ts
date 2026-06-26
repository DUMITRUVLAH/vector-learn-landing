/**
 * PAR-FIN-003: generate an "Act de predare-primire" (handover act) from a PAR.
 *
 * GET /api/par/:id/act-doc?format=pdf|html
 *   Renders the built-in act template with the PAR's beneficiary, amount and line
 *   items. Returns a PDF (default) or HTML. Like the FinDesk invoice doc, it falls
 *   back to HTML when Chromium is unavailable so the route never hard-fails.
 *
 * Reuse over rebuild: uses the DocMerge htmlToPdfBuffer renderer; the act layout
 * lives in lib/par/actTemplate.ts. Mounted before the catch-all parRoutes.
 */
import { Hono } from "hono";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { parRequests, parLineItems, parSettings } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { renderActHtml } from "../lib/par/actTemplate";
import { htmlToPdfBuffer } from "../lib/docmerge/htmlToPdf";

export const parActDocRoutes = new Hono<{ Variables: AuthVariables }>();
parActDocRoutes.use("*", requireAuth);

function fmtMoney(cents: number, currency: string): string {
  const major = (cents / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${major} ${currency}`;
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit", year: "numeric" });
}

parActDocRoutes.get("/:id/act-doc", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");
  const format = c.req.query("format") === "html" ? "html" : "pdf";

  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
    .limit(1);
  if (!par) return c.json({ error: "not_found" }, 404);

  // Visibility: requestor or an elevated PAR role (payee data is GDPR-sensitive).
  const roles = await getUserPARRoles(user.id, tenantId, user.role);
  const elevated = roles.some((r) => ["approver", "finance", "par_admin"].includes(r));
  if (!elevated && par.requestedByUserId !== user.id) {
    return c.json({ error: "forbidden" }, 403);
  }

  if (!par.payeeName?.trim()) {
    return c.json({ error: "no_payee", detail: "Cererea nu are un beneficiar." }, 422);
  }

  const [settings] = await db
    .select({ orgLegalName: parSettings.orgLegalName })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId))
    .limit(1);

  const lines = await db
    .select()
    .from(parLineItems)
    .where(and(eq(parLineItems.tenantId, tenantId), eq(parLineItems.parId, parId)))
    .orderBy(asc(parLineItems.position));

  const currency = par.currency ?? "MDL";
  const html = renderActHtml({
    orgName: settings?.orgLegalName ?? "Organizația",
    requestNo: par.requestNo,
    date: fmtDate(par.dateOfRequest),
    payeeName: par.payeeName,
    payeeIdnp: par.payeeIdnp ?? "",
    payeeIban: par.payeeIban ?? "",
    endUse: par.endUse ?? "",
    totalFormatted: fmtMoney(par.totalEstimatedCents, currency),
    lines: lines.map((l) => ({
      description: l.description,
      qty: l.quantity,
      total: fmtMoney(l.lineTotalCents, currency),
    })),
  });

  const fileBase = `act-predare-primire-${par.requestNo}`.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (format === "html") {
    return c.body(html, 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${fileBase}.html"`,
    });
  }

  const pdf = await htmlToPdfBuffer(html);
  if (!pdf) {
    // Chromium unavailable → serve the print-ready HTML so the user can Print → Save as PDF.
    return c.body(html, 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${fileBase}.html"`,
      "X-PDF-Fallback": "1",
    });
  }
  return c.body(pdf, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
  });
});
