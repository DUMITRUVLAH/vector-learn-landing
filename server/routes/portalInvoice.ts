/**
 * PAY-003: Public portal invoice endpoint (no auth required)
 * GET /api/portal/invoice/:id
 * Returns invoice details for the parent portal view.
 * No session required — accessible via link in email/WhatsApp.
 * Tenant is inferred from the invoice, not from a session cookie.
 *
 * Security: The invoice UUID is the only secret. No cross-tenant data leaks because
 * UUIDs are unguessable and the query is scoped by invoice.id (not by tenantId from user).
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { invoices, students, tenants } from "../db/schema";

export const portalInvoiceRoutes = new Hono();

portalInvoiceRoutes.get("/invoice/:id", async (c) => {
  const id = c.req.param("id");

  // Validate UUID format to avoid unnecessary DB queries
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "not_found" }, 404);
  }

  const [row] = await db
    .select({
      invoiceNumber: invoices.invoiceNumber,
      amountCents: invoices.amountCents,
      currency: invoices.currency,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      notes: invoices.notes,
      studentName: students.fullName,
      tenantName: tenants.name,
      iban: tenants.iban,
      bic: tenants.bic,
    })
    .from(invoices)
    .innerJoin(students, eq(invoices.studentId, students.id))
    .innerJoin(tenants, eq(invoices.tenantId, tenants.id))
    .where(eq(invoices.id, id));

  if (!row) return c.json({ error: "not_found" }, 404);

  return c.json(row);
});
