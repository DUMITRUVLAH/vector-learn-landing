/**
 * Feature 3: PAR Templates
 * Mounted at app.route("/api/par/templates", parTemplatesRoutes)
 *
 * Routes:
 *   POST   /api/par/templates                    → save template (from existing PAR or inline payload)
 *   GET    /api/par/templates                    → list tenant templates
 *   DELETE /api/par/templates/:id               → delete template
 *   POST   /api/par/templates/:id/instantiate   → create a new draft PAR from template
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import {
  parTemplates,
  parRequests,
  parLineItems,
  parSettings,
  parAudit,
  parProjects,
} from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole, getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { generateRequestNo } from "../lib/par/requestNo";
import { recalcParTotal } from "../lib/par/totals";
import { enabledPayerIds } from "../middleware/requireModuleEntitlement";
import { canViewPar } from "../lib/par/visibility";
import { accessiblePayerIds, accessibleProjectIds, accessibleScopes, mayAccessProject } from "../lib/par/projectScope";

export const parTemplatesRoutes = new Hono<{ Variables: AuthVariables }>();
parTemplatesRoutes.use("*", requireAuth);
// PARQA-006: templates embed payee IBAN/IDNP in their snapshot — restrict the whole surface to
// users who hold a PAR role. A no-role tenant user must not list, instantiate, or delete them.
parTemplatesRoutes.use("*", requirePARRole("requestor", "approver", "finance", "par_admin"));
parTemplatesRoutes.use("/:id", parUuidGuard("id"));
parTemplatesRoutes.use("/:id/:action/*", parUuidGuard("id"));

/** Shape of what we store in the snapshot JSON */
interface TemplateSnapshot {
  // Header fields
  requestorTitle: string | null;
  departmentId: string | null;
  projectId: string | null;
  budgetCodeId: string | null;
  budgetCodeNote: string | null;
  purpose: string;
  chargeTo: string;
  chargeBillingCode: string | null;
  endUse: string | null;
  // Payee
  vendorId: string | null;
  payeeName: string | null;
  payeeIdnp: string | null;
  payeeIban: string | null;
  payeeBank: string | null;
  // Line items
  lineItems: Array<{
    position: number;
    description: string;
    quantity: number;
    unit: string | null;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
}

const lineItemSchema = z.object({
  description: z.string().min(1).max(1000),
  quantity: z.number().int().min(1),
  unit: z.string().max(50).optional().nullable(),
  unitPriceCents: z.number().int().min(0),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(300),
  /** Snapshot from an existing PAR id */
  parId: z.string().uuid().optional(),
  /** Or provide inline snapshot fields */
  snapshot: z
    .object({
      requestorTitle: z.string().max(300).optional().nullable(),
      departmentId: z.string().uuid().optional().nullable(),
      projectId: z.string().uuid().optional().nullable(),
      budgetCodeId: z.string().uuid().optional().nullable(),
      budgetCodeNote: z.string().max(500).optional().nullable(),
      purpose: z.string().optional(),
      chargeTo: z.string().optional(),
      chargeBillingCode: z.string().max(100).optional().nullable(),
      endUse: z.string().optional().nullable(),
      vendorId: z.string().uuid().optional().nullable(),
      payeeName: z.string().max(300).optional().nullable(),
      payeeIdnp: z.string().max(50).optional().nullable(),
      payeeIban: z.string().max(34).optional().nullable(),
      payeeBank: z.string().max(300).optional().nullable(),
      lineItems: z.array(lineItemSchema).optional(),
    })
    .optional(),
});

/** POST /api/par/templates — save a template */
parTemplatesRoutes.post(
  "/",
  zValidator("json", createTemplateSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const userId = c.get("user").id;
    const body = c.req.valid("json");

    let snapshot: TemplateSnapshot;

    if (body.parId) {
      // Snapshot from existing PAR
      const [par] = await db
        .select()
        .from(parRequests)
        .where(and(eq(parRequests.id, body.parId), eq(parRequests.tenantId, tenantId)));
      if (!par) return c.json({ error: "par_not_found" }, 404);

      // SECURITY (audit 2026-08-29): cererea-sursă se citea doar cu `tenantId`, iar snapshot-ul
      // rezultat (IBAN, IDNP, destinația fondurilor, liniile) se întorcea în răspuns. Adică
      // „exfiltrare prin șablon": oricine cunoștea un id de cerere din alt proiect îi obținea
      // rechizitele. Aceeași regulă de vizualizare ca peste tot.
      if (!(await canViewPar(c.get("user"), tenantId, par))) {
        return c.json({ error: "par_not_found" }, 404);
      }

      const lines = await db
        .select()
        .from(parLineItems)
        .where(and(eq(parLineItems.parId, body.parId), eq(parLineItems.tenantId, tenantId)))
        .orderBy(asc(parLineItems.position));

      snapshot = {
        requestorTitle: par.requestorTitle,
        departmentId: par.departmentId,
        projectId: par.projectId,
        budgetCodeId: par.budgetCodeId,
        budgetCodeNote: par.budgetCodeNote,
        purpose: par.purpose,
        chargeTo: par.chargeTo,
        chargeBillingCode: par.chargeBillingCode,
        endUse: par.endUse,
        vendorId: par.vendorId,
        payeeName: par.payeeName,
        payeeIdnp: par.payeeIdnp,
        payeeIban: par.payeeIban,
        payeeBank: par.payeeBank,
        lineItems: lines.map((l) => ({
          position: l.position,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitPriceCents: l.unitPriceCents,
          lineTotalCents: l.lineTotalCents,
        })),
      };
    } else if (body.snapshot) {
      const s = body.snapshot;
      snapshot = {
        requestorTitle: s.requestorTitle ?? null,
        departmentId: s.departmentId ?? null,
        projectId: s.projectId ?? null,
        budgetCodeId: s.budgetCodeId ?? null,
        budgetCodeNote: s.budgetCodeNote ?? null,
        purpose: s.purpose ?? "execute_payment",
        chargeTo: s.chargeTo ?? "program",
        chargeBillingCode: s.chargeBillingCode ?? null,
        endUse: s.endUse ?? null,
        vendorId: s.vendorId ?? null,
        payeeName: s.payeeName ?? null,
        payeeIdnp: s.payeeIdnp ?? null,
        payeeIban: s.payeeIban ?? null,
        payeeBank: s.payeeBank ?? null,
        lineItems: (s.lineItems ?? []).map((l, idx) => ({
          position: idx + 1,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit ?? null,
          unitPriceCents: l.unitPriceCents,
          lineTotalCents: l.quantity * l.unitPriceCents,
        })),
      };
    } else {
      return c.json({ error: "provide parId or snapshot" }, 400);
    }

    const [row] = await db
      .insert(parTemplates)
      .values({
        tenantId,
        name: body.name,
        createdByUserId: userId,
        snapshot: JSON.stringify(snapshot),
      })
      .returning();

    return c.json(
      {
        id: row.id,
        tenantId: row.tenantId,
        name: row.name,
        createdByUserId: row.createdByUserId,
        snapshot,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      201
    );
  }
);

/** GET /api/par/templates — list all templates for tenant */
parTemplatesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const rows = await db
    .select()
    .from(parTemplates)
    .where(eq(parTemplates.tenantId, tenantId))
    .orderBy(asc(parTemplates.name));

  // SECURITY (audit 2026-08-29): listarea întorcea TOATE șabloanele tenantului, cu IBAN/IDNP-ul
  // din snapshot, fără nicio verificare de arie. Un șablon poartă rechizitele bancare ale unui
  // beneficiar, deci se vede doar dacă e al tău sau dacă proiectul/plătitorul lui e în aria ta.
  const { projects: scopedProjects, payers: scopedPayers } = await accessibleScopes(user.id, tenantId, user.role ?? undefined);
  const unrestricted = scopedProjects === null && scopedPayers === null;
  const visible = unrestricted
    ? rows
    : rows.filter((r) => {
        if (r.createdByUserId === user.id) return true;
        let snap: TemplateSnapshot | null = null;
        try { snap = JSON.parse(r.snapshot) as TemplateSnapshot; } catch { return false; }
        if (snap?.projectId) return scopedProjects?.includes(snap.projectId) ?? false;
        // Snapshot-ul nu poartă plătitorul, deci fără proiect nu există arie de verificat →
        // îl vede doar autorul lui.
        return false;
      });

  const templates = visible.map((r) => {
    let snapshot: TemplateSnapshot | null = null;
    try {
      snapshot = JSON.parse(r.snapshot) as TemplateSnapshot;
    } catch {
      snapshot = null;
    }
    return {
      id: r.id,
      tenantId: r.tenantId,
      name: r.name,
      createdByUserId: r.createdByUserId,
      snapshot,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  return c.json({ templates });
});

/** DELETE /api/par/templates/:id */
parTemplatesRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const id = c.req.param("id");

  // PARQA-006: only the creator or a par_admin may delete a template. Templates are per-tenant, but
  // hard-deleting another user's template (which may embed their payee data) must not be allowed.
  const [tmpl] = await db
    .select({ createdByUserId: parTemplates.createdByUserId })
    .from(parTemplates)
    .where(and(eq(parTemplates.id, id), eq(parTemplates.tenantId, tenantId)));
  if (!tmpl) return c.json({ error: "not_found" }, 404);
  const roles = await getUserPARRoles(userId, tenantId);
  if (tmpl.createdByUserId !== userId && !roles.includes("par_admin")) {
    return c.json({ error: "forbidden" }, 403);
  }

  const [deleted] = await db
    .delete(parTemplates)
    .where(and(eq(parTemplates.id, id), eq(parTemplates.tenantId, tenantId)))
    .returning();

  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

/**
 * POST /api/par/templates/:id/instantiate
 * Creates a new draft PAR (header + line items) from the template.
 * Returns the new draft PAR.
 */
parTemplatesRoutes.post("/:id/instantiate", async (c) => {
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const id = c.req.param("id");

  const [tmpl] = await db
    .select()
    .from(parTemplates)
    .where(and(eq(parTemplates.id, id), eq(parTemplates.tenantId, tenantId)));
  if (!tmpl) return c.json({ error: "not_found" }, 404);

  let snapshot: TemplateSnapshot;
  try {
    snapshot = JSON.parse(tmpl.snapshot) as TemplateSnapshot;
  } catch {
    return c.json({ error: "template_snapshot_invalid" }, 500);
  }

  // SECURITY (audit 2026-08-29): `POST /api/par` verifică `mayAccessProject` înainte de a crea o
  // cerere pe un proiect; instanțierea unui șablon copia `snapshot.projectId` fără nicio
  // verificare, deci se puteau crea cereri imputate unui proiect străin, rutate către aprobatorii
  // acelui proiect.
  const actor = c.get("user");
  if (snapshot.projectId && !(await mayAccessProject(actor.id, tenantId, snapshot.projectId, actor.role ?? undefined))) {
    return c.json({ error: "forbidden_project_scope" }, 403);
  }

  // Fetch settings (used for currency below).
  const [settings] = await db
    .select()
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));

  // generateRequestNo(tenantId, year?) reads the prefix from par_settings itself.
  // Passing the prefix as the 2nd (year) arg produced "PAR-PAR-0001" — fixed.
  const requestNo = await generateRequestNo(tenantId);

  // The payer is what every visibility rule keys on: `mayAccessPayer` returns FALSE for a null
  // payer and the list query filters on `payerId IN (entitled payers)`. A template-instantiated
  // PAR without one was invisible to its own author (404 on the detail page it had just been
  // redirected to) and could never be submitted. Resolve it exactly like POST /api/par does:
  // the snapshot's project decides, otherwise the workspace's first PAR-enabled payer.
  const [snapshotProject] = snapshot.projectId
    ? await db
        .select({ payerId: parProjects.payerId })
        .from(parProjects)
        .where(and(eq(parProjects.id, snapshot.projectId), eq(parProjects.tenantId, tenantId)))
    : [];
  const payerId = snapshotProject?.payerId ?? (await enabledPayerIds(tenantId, "par"))[0] ?? null;

  // Create the PAR header
  const [newPar] = await db
    .insert(parRequests)
    .values({
      tenantId,
      requestNo,
      dateOfRequest: new Date(),
      requestedByUserId: userId,
      payerId,
      requestorTitle: snapshot.requestorTitle,
      departmentId: snapshot.departmentId,
      projectId: snapshot.projectId,
      budgetCodeId: snapshot.budgetCodeId,
      budgetCodeNote: snapshot.budgetCodeNote,
      purpose: snapshot.purpose as "execute_payment" | "obtain_quotations" | "provide_estimate",
      chargeTo: snapshot.chargeTo as "operations" | "program" | "other",
      chargeBillingCode: snapshot.chargeBillingCode,
      endUse: snapshot.endUse,
      vendorId: snapshot.vendorId,
      payeeName: snapshot.payeeName,
      payeeIdnp: snapshot.payeeIdnp,
      payeeIban: snapshot.payeeIban,
      payeeBank: snapshot.payeeBank,
      attachmentsPresent: false,
      currency: settings?.defaultCurrency ?? "MDL",
      totalEstimatedCents: 0,
      status: "draft",
    })
    .returning();

  // Create line items
  const lineInserts = snapshot.lineItems.map((l) => ({
    tenantId,
    parId: newPar.id,
    position: l.position,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit,
    unitPriceCents: l.unitPriceCents,
    lineTotalCents: l.lineTotalCents,
  }));

  if (lineInserts.length > 0) {
    await db.insert(parLineItems).values(lineInserts);
  }

  // Recalc total
  const total = snapshot.lineItems.reduce((s, l) => s + l.lineTotalCents, 0);
  const [updatedPar] = await db
    .update(parRequests)
    .set({ totalEstimatedCents: total, updatedAt: new Date() })
    .where(eq(parRequests.id, newPar.id))
    .returning();

  // Audit log
  await db.insert(parAudit).values({
    tenantId,
    parId: newPar.id,
    actorUserId: userId,
    event: "created_from_template",
    detail: `Instantiated from template "${tmpl.name}" (${tmpl.id})`,
  });

  // Return lines too
  const lines = await db
    .select()
    .from(parLineItems)
    .where(and(eq(parLineItems.parId, newPar.id), eq(parLineItems.tenantId, tenantId)))
    .orderBy(asc(parLineItems.position));

  return c.json({ par: updatedPar, line_items: lines }, 201);
});
