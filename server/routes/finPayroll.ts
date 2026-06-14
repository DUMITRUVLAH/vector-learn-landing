/**
 * PAY-002 (FIN): FinDesk — Rute API modul Payroll
 *
 * Endpoints:
 *   GET    /api/fin/payroll/employees                — lista angajați activi
 *   POST   /api/fin/payroll/employees                — creare angajat nou
 *   GET    /api/fin/payroll/runs                     — lista rulaje salarizare
 *   POST   /api/fin/payroll/runs                     — creare rulaj nou (draft)
 *   POST   /api/fin/payroll/runs/:id/calculate       — calcul salarii per rulaj
 *   POST   /api/fin/payroll/runs/:id/confirm         — confirmare + postare cheltuieli în fin_expenses
 *   GET    /api/fin/payroll/runs/:id/items           — linii calcul per rulaj
 *
 * Calculul este DETERMINIST (nu AI) — FIN-CORE regula #4.
 * Cotele provin din fin_registry_items (category=payroll_rates) per jurisdicție,
 * cu fallback la DEFAULT_PAYROLL_RATES — FIN-CORE regula #2.
 * La confirmare, se postează cheltuieli în fin_expenses — FIN-CORE regula #3.
 * Dacă fin_expenses nu există, se loghează și se continuă (nu 500).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  finEmployees,
  finPayrollRuns,
  finPayrollItems,
  type FinPayrollRunStatus,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  calculatePayroll,
  toDeductionsJsonb,
  DEFAULT_PAYROLL_RATES,
  type PayrollRates,
  type PayrollJurisdiction,
} from "../lib/fin/payrollCalculator";

export const finPayrollRoutes = new Hono<{ Variables: AuthVariables }>();

finPayrollRoutes.use("*", requireAuth);

// ─── Schema validare ──────────────────────────────────────────────────────────

const createEmployeeSchema = z.object({
  fullName: z.string().min(2).max(255),
  jobTitle: z.string().max(255).optional().nullable(),
  contractType: z.enum(["employee", "contractor"]).default("employee"),
  baseSalaryCents: z.number().int().min(0),
  currency: z.enum(["MDL", "RON", "EUR", "USD"]).default("MDL"),
  notes: z.string().max(2000).optional().nullable(),
});

const createRunSchema = z.object({
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "Format YYYY-MM"),
  notes: z.string().max(2000).optional().nullable(),
});

const calculateSchema = z.object({
  /** Jurisdicția pentru cotele de contribuții. Default: MD. */
  jurisdiction: z.enum(["MD", "RO"]).optional().default("MD"),
  /**
   * Override manual al cotelor (basis points). Dacă lipsă, se citesc din REGISTRY
   * sau se folosesc constantele default.
   */
  rateOverride: z
    .object({
      casEmployeeBp: z.number().int().min(0).max(5000).optional(),
      cassEmployeeBp: z.number().int().min(0).max(5000).optional(),
      incomeTaxBp: z.number().int().min(0).max(5000).optional(),
      casEmployerBp: z.number().int().min(0).max(5000).optional(),
      cassEmployerBp: z.number().int().min(0).max(5000).optional(),
    })
    .optional(),
  /** Lista specifică de angajați (UUID). Dacă lipsă, se calculează pentru toți cei activi. */
  employeeIds: z.array(z.string().uuid()).optional(),
});

// ─── Helper: obține cotele de contribuții (REGISTRY sau default) ──────────────

async function resolvePayrollRates(
  tenantId: string,
  jurisdiction: PayrollJurisdiction,
  override?: Partial<PayrollRates>
): Promise<PayrollRates> {
  const defaults = { ...DEFAULT_PAYROLL_RATES[jurisdiction] };

  // Încearcă citirea din fin_registry_items (FIN-CORE regula #2)
  // Dacă tabelul nu există (ramura REGISTRY nemerge), se folosesc default-urile.
  try {
    const rows = await db.execute(
      sql`SELECT "key", "value_bp" FROM "fin_registry_items"
          WHERE "tenant_id" = ${tenantId}
            AND "category" = 'payroll_rates'
            AND "jurisdiction" = ${jurisdiction}
            AND "active" = true`
    );
    const items = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows ?? [];
    for (const row of items) {
      const r = row as { key: string; value_bp: string | number };
      const bp = parseInt(String(r.value_bp), 10);
      if (isNaN(bp)) continue;
      switch (r.key) {
        case "cas_employee_bp":
          defaults.casEmployeeBp = bp;
          break;
        case "cass_employee_bp":
          defaults.cassEmployeeBp = bp;
          break;
        case "income_tax_bp":
          defaults.incomeTaxBp = bp;
          break;
        case "cas_employer_bp":
          defaults.casEmployerBp = bp;
          break;
        case "cass_employer_bp":
          defaults.cassEmployerBp = bp;
          break;
      }
    }
  } catch {
    // fin_registry_items nu există pe această ramură — folosim default-urile
  }

  // Override manual suprascrie tot
  if (override) {
    if (override.casEmployeeBp !== undefined)
      defaults.casEmployeeBp = override.casEmployeeBp;
    if (override.cassEmployeeBp !== undefined)
      defaults.cassEmployeeBp = override.cassEmployeeBp;
    if (override.incomeTaxBp !== undefined)
      defaults.incomeTaxBp = override.incomeTaxBp;
    if (override.casEmployerBp !== undefined)
      defaults.casEmployerBp = override.casEmployerBp;
    if (override.cassEmployerBp !== undefined)
      defaults.cassEmployerBp = override.cassEmployerBp;
  }

  return defaults;
}

// ─── GET /api/fin/payroll/employees — lista angajați activi ──────────────────

finPayrollRoutes.get("/employees", async (c) => {
  const tenantId = c.get("user").tenantId;
  const status = (c.req.query("status") as "active" | "inactive") ?? "active";

  const employees = await db.query.finEmployees.findMany({
    where: and(
      eq(finEmployees.tenantId, tenantId),
      eq(finEmployees.status, status)
    ),
    orderBy: [finEmployees.fullName],
  });

  return c.json({ employees });
});

// ─── POST /api/fin/payroll/employees — creare angajat ────────────────────────

finPayrollRoutes.post(
  "/employees",
  zValidator("json", createEmployeeSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const data = c.req.valid("json");

    const [employee] = await db
      .insert(finEmployees)
      .values({
        tenantId,
        fullName: data.fullName,
        jobTitle: data.jobTitle ?? null,
        contractType: data.contractType,
        baseSalaryCents: data.baseSalaryCents,
        currency: data.currency,
        notes: data.notes ?? null,
      })
      .returning();

    return c.json({ employee }, 201);
  }
);

// ─── GET /api/fin/payroll/runs — lista rulaje ─────────────────────────────────

finPayrollRoutes.get("/runs", async (c) => {
  const tenantId = c.get("user").tenantId;

  const runs = await db.query.finPayrollRuns.findMany({
    where: eq(finPayrollRuns.tenantId, tenantId),
    orderBy: [desc(finPayrollRuns.periodMonth)],
    with: {
      items: {
        columns: { grossCents: true, netCents: true, employerCostCents: true },
      },
    },
  });

  // Adaugă totale per rulaj
  const runsWithTotals = runs.map((r) => ({
    ...r,
    totalGrossCents: r.items.reduce((s, i) => s + i.grossCents, 0),
    totalNetCents: r.items.reduce((s, i) => s + i.netCents, 0),
    totalEmployerCostCents: r.items.reduce((s, i) => s + i.employerCostCents, 0),
    itemCount: r.items.length,
    items: undefined, // nu trimitem liniile în lista globală
  }));

  return c.json({ runs: runsWithTotals });
});

// ─── POST /api/fin/payroll/runs — creare rulaj ────────────────────────────────

finPayrollRoutes.post(
  "/runs",
  zValidator("json", createRunSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const data = c.req.valid("json");

    const [run] = await db
      .insert(finPayrollRuns)
      .values({
        tenantId,
        periodMonth: data.periodMonth,
        notes: data.notes ?? null,
        status: "draft",
      })
      .returning();

    return c.json({ run }, 201);
  }
);

// ─── GET /api/fin/payroll/runs/:id/items — linii calcul ──────────────────────

finPayrollRoutes.get("/runs/:id/items", async (c) => {
  const tenantId = c.get("user").tenantId;
  const runId = c.req.param("id");

  const run = await db.query.finPayrollRuns.findFirst({
    where: and(eq(finPayrollRuns.id, runId), eq(finPayrollRuns.tenantId, tenantId)),
  });

  if (!run) {
    return c.json({ error: "Rulaj negăsit." }, 404);
  }

  const items = await db.query.finPayrollItems.findMany({
    where: and(
      eq(finPayrollItems.runId, runId),
      eq(finPayrollItems.tenantId, tenantId)
    ),
    with: { employee: true },
  });

  return c.json({ run, items });
});

// ─── POST /api/fin/payroll/runs/:id/calculate — calcul salarii ───────────────

finPayrollRoutes.post(
  "/runs/:id/calculate",
  zValidator("json", calculateSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const runId = c.req.param("id");
    const data = c.req.valid("json");

    // Verifică că rulajul aparține tenant-ului și e în draft
    const run = await db.query.finPayrollRuns.findFirst({
      where: and(eq(finPayrollRuns.id, runId), eq(finPayrollRuns.tenantId, tenantId)),
    });

    if (!run) {
      return c.json({ error: "Rulaj negăsit." }, 404);
    }

    if (run.status !== "draft") {
      return c.json(
        { error: "Calculul poate fi efectuat doar pe rulaje în starea draft." },
        422
      );
    }

    // Obține cotele de contribuții
    const rates = await resolvePayrollRates(
      tenantId,
      data.jurisdiction,
      data.rateOverride
    );

    // Obține angajații de calculat
    let employees;
    if (data.employeeIds && data.employeeIds.length > 0) {
      employees = await db.query.finEmployees.findMany({
        where: and(
          eq(finEmployees.tenantId, tenantId),
          eq(finEmployees.status, "active"),
          inArray(finEmployees.id, data.employeeIds)
        ),
      });
    } else {
      employees = await db.query.finEmployees.findMany({
        where: and(
          eq(finEmployees.tenantId, tenantId),
          eq(finEmployees.status, "active")
        ),
      });
    }

    if (employees.length === 0) {
      return c.json({ error: "Niciun angajat activ găsit pentru calcul." }, 422);
    }

    // Şterge liniile existente (recalcul idempotent)
    await db
      .delete(finPayrollItems)
      .where(
        and(
          eq(finPayrollItems.runId, runId),
          eq(finPayrollItems.tenantId, tenantId)
        )
      );

    // Calculează şi inserează liniile
    const itemsToInsert = employees.map((emp) => {
      const result = calculatePayroll({
        grossCents: emp.baseSalaryCents,
        rates,
      });

      return {
        tenantId,
        runId,
        employeeId: emp.id,
        grossCents: result.grossCents,
        deductionsJsonb: toDeductionsJsonb(result),
        netCents: result.netCents,
        employerCostCents: result.employerCostCents,
      };
    });

    const insertedItems = await db.insert(finPayrollItems).values(itemsToInsert).returning();

    const totals = insertedItems.reduce(
      (acc, i) => ({
        totalGrossCents: acc.totalGrossCents + i.grossCents,
        totalNetCents: acc.totalNetCents + i.netCents,
        totalEmployerCostCents: acc.totalEmployerCostCents + i.employerCostCents,
      }),
      { totalGrossCents: 0, totalNetCents: 0, totalEmployerCostCents: 0 }
    );

    return c.json({
      run,
      items: insertedItems,
      ...totals,
      ratesUsed: rates,
      employeeCount: insertedItems.length,
    });
  }
);

// ─── POST /api/fin/payroll/runs/:id/confirm — confirmare rulaj ────────────────

finPayrollRoutes.post("/runs/:id/confirm", async (c) => {
  const tenantId = c.get("user").tenantId;
  const runId = c.req.param("id");

  const run = await db.query.finPayrollRuns.findFirst({
    where: and(eq(finPayrollRuns.id, runId), eq(finPayrollRuns.tenantId, tenantId)),
    with: { items: { with: { employee: true } } },
  });

  if (!run) {
    return c.json({ error: "Rulaj negăsit." }, 404);
  }

  if (run.status !== "draft") {
    return c.json(
      { error: "Doar rulajele în starea draft pot fi confirmate." },
      422
    );
  }

  if (run.items.length === 0) {
    return c.json(
      { error: "Rulajul nu are linii calculate. Efectuați calculul mai întâi." },
      422
    );
  }

  // FIN-CORE regula #3: postare automată cheltuieli în fin_expenses
  // Dacă fin_expenses nu există (ramura SPEND nemerge), se loghează şi se continuă.
  let expensesPosted = 0;
  const expensesErrors: string[] = [];

  for (const item of run.items) {
    try {
      await db.execute(
        sql`INSERT INTO "fin_expenses" (
              "id", "tenant_id", "amount_cents", "category",
              "deductible", "description", "expense_date", "created_at"
            ) VALUES (
              gen_random_uuid(), ${tenantId}, ${item.employerCostCents},
              'payroll', true,
              ${"Salariu " + (item.employee?.fullName ?? "angajat") + " " + run.periodMonth},
              ${run.periodMonth + "-01"},
              now()
            )`
      );
      expensesPosted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Dacă tabelul nu există (PG: 42P01 undefined_table), e OK — continuăm
      if (msg.includes("undefined_table") || msg.includes("does not exist")) {
        expensesErrors.push(`fin_expenses not yet available (SPEND module pending)`);
        break; // Loghăm o dată şi ieşim din buclă
      }
      expensesErrors.push(msg);
    }
  }

  // Actualizează statusul rulajului la confirmed
  const [updatedRun] = await db
    .update(finPayrollRuns)
    .set({
      status: "confirmed" as FinPayrollRunStatus,
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(eq(finPayrollRuns.id, runId), eq(finPayrollRuns.tenantId, tenantId))
    )
    .returning();

  return c.json({
    run: updatedRun,
    expensesPosted,
    expensesErrors: expensesErrors.length > 0 ? expensesErrors : undefined,
    itemCount: run.items.length,
  });
});

// ─── PATCH /api/fin/payroll/employees/:id — editare angajat ──────────────────

const patchEmployeeSchema = z.object({
  fullName: z.string().min(2).max(255).optional(),
  jobTitle: z.string().max(255).nullable().optional(),
  contractType: z.enum(["employee", "contractor"]).optional(),
  baseSalaryCents: z.number().int().min(0).optional(),
  currency: z.enum(["MDL", "RON", "EUR", "USD"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

finPayrollRoutes.patch(
  "/employees/:id",
  zValidator("json", patchEmployeeSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const employeeId = c.req.param("id");
    const data = c.req.valid("json");

    const existing = await db.query.finEmployees.findFirst({
      where: and(eq(finEmployees.id, employeeId), eq(finEmployees.tenantId, tenantId)),
    });

    if (!existing) {
      return c.json({ error: "Angajat negăsit." }, 404);
    }

    const updates: Partial<typeof finEmployees.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.fullName !== undefined) updates.fullName = data.fullName;
    if (data.jobTitle !== undefined) updates.jobTitle = data.jobTitle;
    if (data.contractType !== undefined) updates.contractType = data.contractType;
    if (data.baseSalaryCents !== undefined) updates.baseSalaryCents = data.baseSalaryCents;
    if (data.currency !== undefined) updates.currency = data.currency;
    if (data.status !== undefined) updates.status = data.status;
    if (data.notes !== undefined) updates.notes = data.notes;

    const [updated] = await db
      .update(finEmployees)
      .set(updates)
      .where(and(eq(finEmployees.id, employeeId), eq(finEmployees.tenantId, tenantId)))
      .returning();

    return c.json({ employee: updated });
  }
);

// ─── POST /api/fin/payroll/runs/:id/mark-paid — marcare plată efectuată ──────

finPayrollRoutes.post("/runs/:id/mark-paid", async (c) => {
  const tenantId = c.get("user").tenantId;
  const runId = c.req.param("id");

  const run = await db.query.finPayrollRuns.findFirst({
    where: and(eq(finPayrollRuns.id, runId), eq(finPayrollRuns.tenantId, tenantId)),
  });

  if (!run) {
    return c.json({ error: "Rulaj negăsit." }, 404);
  }

  if (run.status !== "confirmed") {
    return c.json(
      { error: "Doar rulajele confirmate pot fi marcate ca plătite." },
      422
    );
  }

  const [updatedRun] = await db
    .update(finPayrollRuns)
    .set({
      status: "paid" as FinPayrollRunStatus,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(finPayrollRuns.id, runId), eq(finPayrollRuns.tenantId, tenantId)))
    .returning();

  return c.json({ run: updatedRun });
});
