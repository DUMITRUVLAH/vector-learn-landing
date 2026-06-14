/**
 * FISC-002 + FISC-003: FinDesk — Rute API modul fiscal
 *
 * Endpoints:
 *   POST /api/fin/tax/periods                        — creare perioadă fiscală
 *   GET  /api/fin/tax/periods                        — lista perioade (cu declarații)
 *   GET  /api/fin/tax/periods/:id/summary            — detaliu perioadă + payload calcul
 *   POST /api/fin/tax/calculate                      — calcul TVA + impozit venit pentru o perioadă
 *   GET  /api/fin/tax/declarations                   — lista declarații (cu filtre)
 *   GET  /api/fin/tax/declarations/:id/export        — export PDF sau CSV (?format=pdf|csv)
 *   PATCH /api/fin/tax/declarations/:id/file         — marchează declarație ca depusă
 *
 * Toate rutele necesită autentificare și filtrează după tenant_id.
 * Calculul este DETERMINIST (nu AI) — FIN-CORE regula #4.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  finTaxPeriods,
  finTaxDeclarations,
  type FinTaxPeriodType,
  type FinDeclarationType,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  calculateTax,
  toPayload,
  DEFAULT_INCOME_TAX_RATES,
  type TaxLineItem,
} from "../lib/fin/taxCalculator";
import {
  generateDeclaration,
  type ExportFormat,
} from "../lib/fin/declarationGenerator";
import {
  computeDeadlinesForPeriod,
  declarationTypeLabel,
  type DeadlineWithStatus,
} from "../lib/fin/taxDeadlines";

export const finTaxRoutes = new Hono<{ Variables: AuthVariables }>();

finTaxRoutes.use("*", requireAuth);

// ─── Schema validare ──────────────────────────────────────────────────────────

const createPeriodSchema = z.object({
  periodType: z.enum(["monthly", "quarterly", "annual"]),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).optional().nullable(),
  quarter: z.number().int().min(1).max(4).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
});

const calculateSchema = z.object({
  periodId: z.string().uuid(),
  declarationType: z.enum(["tva12_md", "d394_ro", "d301_ro", "income_md"]),
  /** Cota impozit venit (basis points). Dacă lipsă, se folosește default pentru jurisdicție. */
  incomeTaxRateBp: z.number().int().min(0).max(5000).optional(),
  /** Jurisdicție: MD sau RO (pentru default cote). Default: MD. */
  jurisdiction: z.enum(["MD", "RO"]).optional().default("MD"),
  /**
   * Linii facturi pentru calcul TVA colectat.
   * Dacă lipsă sau gol, se încearcă query pe fin_invoices (când tabelul există).
   */
  invoiceLines: z
    .array(
      z.object({
        baseCents: z.number().int(),
        vatCents: z.number().int(),
        vatRateBp: z.number().int(),
      })
    )
    .optional()
    .default([]),
  /**
   * Linii cheltuieli pentru calcul TVA deductibil.
   * Dacă lipsă sau gol, se încearcă query pe fin_expenses (când tabelul există).
   */
  expenseLines: z
    .array(
      z.object({
        baseCents: z.number().int(),
        vatCents: z.number().int(),
        vatRateBp: z.number().int(),
        deductible: z.boolean().optional().default(true),
      })
    )
    .optional()
    .default([]),
  /** Total venituri brute (fără TVA) în perioadă, cenți. */
  totalRevenueCents: z.number().int().min(0).optional().default(0),
  /** Total cheltuieli brute (fără TVA) în perioadă, cenți. */
  totalExpenseCents: z.number().int().min(0).optional().default(0),
});

const fileDeclarationSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
});

// ─── POST /api/fin/tax/periods — creare perioadă fiscală ─────────────────────

finTaxRoutes.post(
  "/periods",
  zValidator("json", createPeriodSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const data = c.req.valid("json");

    const [period] = await db
      .insert(finTaxPeriods)
      .values({
        tenantId,
        periodType: data.periodType as FinTaxPeriodType,
        year: data.year,
        month: data.month ?? null,
        quarter: data.quarter ?? null,
        startDate: data.startDate,
        endDate: data.endDate,
        status: "open",
      })
      .returning();

    return c.json({ period }, 201);
  }
);

// ─── GET /api/fin/tax/periods — lista perioade cu declarații ─────────────────

finTaxRoutes.get("/periods", async (c) => {
  const tenantId = c.get("user").tenantId;

  const periods = await db.query.finTaxPeriods.findMany({
    where: eq(finTaxPeriods.tenantId, tenantId),
    orderBy: [desc(finTaxPeriods.year), desc(sql`coalesce(${finTaxPeriods.month}, ${finTaxPeriods.quarter} * 3, 12)`)],
    with: {
      declarations: {
        orderBy: [desc(finTaxDeclarations.createdAt)],
      },
    },
  });

  return c.json({ periods });
});

// ─── GET /api/fin/tax/periods/:id/summary — detaliu perioadă ─────────────────

finTaxRoutes.get("/periods/:id/summary", async (c) => {
  const tenantId = c.get("user").tenantId;
  const periodId = c.req.param("id");

  const period = await db.query.finTaxPeriods.findFirst({
    where: and(eq(finTaxPeriods.id, periodId), eq(finTaxPeriods.tenantId, tenantId)),
    with: {
      declarations: {
        orderBy: [desc(finTaxDeclarations.createdAt)],
      },
    },
  });

  if (!period) {
    return c.json({ error: "Perioadă fiscală negăsită." }, 404);
  }

  return c.json({ period });
});

// ─── POST /api/fin/tax/calculate — calcul TVA + impozit venit ─────────────────

finTaxRoutes.post(
  "/calculate",
  zValidator("json", calculateSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const data = c.req.valid("json");

    // Verifică că perioada aparține tenant-ului
    const period = await db.query.finTaxPeriods.findFirst({
      where: and(
        eq(finTaxPeriods.id, data.periodId),
        eq(finTaxPeriods.tenantId, tenantId)
      ),
    });

    if (!period) {
      return c.json({ error: "Perioadă fiscală negăsită." }, 404);
    }

    // Dacă nu sunt furnizate linii de facturi, încearcă să le obțină din fin_invoices
    // (tabelul va exista după merge-ul ramurii BILL)
    let invoiceLines: TaxLineItem[] = data.invoiceLines as TaxLineItem[];
    let expenseLines: TaxLineItem[] = (data.expenseLines as TaxLineItem[]).map((l) => ({
      ...l,
      deductible: true,
    }));

    if (invoiceLines.length === 0) {
      // Încearcă query pe fin_invoices (poate nu există pe această ramură)
      try {
        const rows = await db.execute(
          sql`SELECT COALESCE(SUM(vat_cents), 0) as total_vat, COUNT(*) as cnt
              FROM fin_invoices
              WHERE tenant_id = ${tenantId}
                AND issued_date >= ${period.startDate}
                AND issued_date <= ${period.endDate}
                AND status IN ('sent', 'paid')`
        );
        const row = Array.isArray(rows) ? rows[0] : (rows as { rows: unknown[] }).rows?.[0];
        if (row) {
          const r = row as { total_vat: string; cnt: string };
          const totalVat = parseInt(r.total_vat ?? "0", 10);
          if (totalVat > 0) {
            invoiceLines = [
              {
                baseCents: 0,
                vatCents: totalVat,
                vatRateBp: 2000, // default 20% MD
              },
            ];
          }
        }
      } catch {
        // fin_invoices nu există pe această ramură — continuăm cu date goale
      }
    }

    if (expenseLines.length === 0) {
      // Încearcă query pe fin_expenses
      try {
        const rows = await db.execute(
          sql`SELECT COALESCE(SUM(vat_deductible_cents), 0) as total_vat_ded,
                     COALESCE(SUM(amount_cents), 0) as total_amount,
                     COUNT(*) as cnt
              FROM fin_expenses
              WHERE tenant_id = ${tenantId}
                AND expense_date >= ${period.startDate}
                AND expense_date <= ${period.endDate}
                AND deductible = true`
        );
        const row = Array.isArray(rows) ? rows[0] : (rows as { rows: unknown[] }).rows?.[0];
        if (row) {
          const r = row as { total_vat_ded: string; total_amount: string };
          const totalVatDed = parseInt(r.total_vat_ded ?? "0", 10);
          const totalAmount = parseInt(r.total_amount ?? "0", 10);
          if (totalVatDed > 0) {
            expenseLines = [
              {
                baseCents: totalAmount,
                vatCents: totalVatDed,
                vatRateBp: 2000,
                deductible: true,
              },
            ];
          }
        }
      } catch {
        // fin_expenses nu există pe această ramură — continuăm cu date goale
      }
    }

    // Cota impozit venit
    const incomeTaxRateBp =
      data.incomeTaxRateBp ?? DEFAULT_INCOME_TAX_RATES[data.jurisdiction] ?? 1200;

    // Calcul determinist
    const result = calculateTax({
      startDate: period.startDate,
      endDate: period.endDate,
      invoiceLines,
      expenseLines,
      incomeTaxRateBp,
      totalRevenueCents: data.totalRevenueCents,
      totalExpenseCents: data.totalExpenseCents,
    });

    const payload = toPayload(result);

    // Caută o declarație existentă de același tip pentru această perioadă
    const existing = await db.query.finTaxDeclarations.findFirst({
      where: and(
        eq(finTaxDeclarations.periodId, data.periodId),
        eq(finTaxDeclarations.tenantId, tenantId),
        eq(finTaxDeclarations.declarationType, data.declarationType as FinDeclarationType)
      ),
    });

    let declaration;
    if (existing) {
      // Suprascrie payload-ul existent (idempotent)
      const [updated] = await db
        .update(finTaxDeclarations)
        .set({
          payload,
          status: "ready",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(finTaxDeclarations.id, existing.id),
            eq(finTaxDeclarations.tenantId, tenantId)
          )
        )
        .returning();
      declaration = updated;
    } else {
      // Creare declarație nouă
      const [created] = await db
        .insert(finTaxDeclarations)
        .values({
          tenantId,
          periodId: data.periodId,
          declarationType: data.declarationType as FinDeclarationType,
          status: "ready",
          payload,
        })
        .returning();
      declaration = created;
    }

    return c.json({ declaration, calculation: result }, 200);
  }
);

// ─── GET /api/fin/tax/declarations — lista declarații cu filtre ───────────────

finTaxRoutes.get("/declarations", async (c) => {
  const tenantId = c.get("user").tenantId;
  const statusFilter = c.req.query("status");
  const yearFilter = c.req.query("year");

  const conditions: ReturnType<typeof eq>[] = [
    eq(finTaxDeclarations.tenantId, tenantId),
  ];

  if (statusFilter && ["draft", "ready", "filed"].includes(statusFilter)) {
    conditions.push(
      eq(
        finTaxDeclarations.status,
        statusFilter as "draft" | "ready" | "filed"
      )
    );
  }

  let declarations = await db.query.finTaxDeclarations.findMany({
    where: and(...conditions),
    orderBy: [desc(finTaxDeclarations.createdAt)],
    with: {
      period: true,
    },
  });

  // Filtrare suplimentară după an (via period.year)
  if (yearFilter) {
    const year = parseInt(yearFilter, 10);
    if (!isNaN(year)) {
      declarations = declarations.filter((d) => d.period?.year === year);
    }
  }

  return c.json({ declarations });
});

// ─── GET /api/fin/tax/declarations/:id/export — export PDF sau CSV ────────────

finTaxRoutes.get("/declarations/:id/export", async (c) => {
  const tenantId = c.get("user").tenantId;
  const declId = c.req.param("id");
  const format = (c.req.query("format") ?? "pdf") as ExportFormat;

  if (!["pdf", "csv"].includes(format)) {
    return c.json({ error: "Format invalid. Folosiți ?format=pdf sau ?format=csv." }, 400);
  }

  // Verifică declarația + perioada
  const declaration = await db.query.finTaxDeclarations.findFirst({
    where: and(
      eq(finTaxDeclarations.id, declId),
      eq(finTaxDeclarations.tenantId, tenantId)
    ),
    with: { period: true },
  });

  if (!declaration) {
    return c.json({ error: "Declarație negăsită." }, 404);
  }

  if (!declaration.period) {
    return c.json({ error: "Perioadă fiscală negăsită." }, 404);
  }

  // Payload gol → nu se poate genera
  const payload = declaration.payload as Record<string, unknown>;
  const isEmpty = !payload || Object.keys(payload).length === 0;
  if (isEmpty) {
    return c.json({
      error: "Payload gol — rulați POST /calculate mai întâi.",
    }, 422);
  }

  const result = generateDeclaration(declaration, declaration.period, format);

  if (format === "pdf") {
    return new Response(result.data as Buffer, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  }

  return new Response(result.data as string, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
});

// ─── GET /api/fin/tax/dashboard — calendar termene, alerte, istoric ──────────
//
// FISC-004: returnează:
//   upcoming_deadlines  — termene cu days_until > 7 şi nedepuse
//   upcoming_alerts     — termene cu 0 <= days_until <= 7 şi nedepuse (roşu/galben în UI)
//   overdue_alerts      — termene depăşite şi nedepuse
//   recent_filings      — ultimele 20 declaraţii depuse (status=filed), descrescător
//
// Nu face niciun calcul fiscal — doar vizualizare şi tracking al statusului.
// DETERMINIST: termene calculate cu taxDeadlines.ts (nu AI).

finTaxRoutes.get("/dashboard", async (c) => {
  const tenantId = c.get("user").tenantId;

  // Preia toate perioadele cu declaraţiile lor (pentru calcul termene)
  const periods = await db.query.finTaxPeriods.findMany({
    where: eq(finTaxPeriods.tenantId, tenantId),
    orderBy: [desc(finTaxPeriods.year), desc(sql`coalesce(${finTaxPeriods.month}, ${finTaxPeriods.quarter} * 3, 12)`)],
    with: {
      declarations: {
        orderBy: [desc(finTaxDeclarations.createdAt)],
      },
    },
  });

  const today = new Date().toISOString().slice(0, 10);

  const allDeadlines: DeadlineWithStatus[] = [];

  for (const p of periods) {
    const label = p.month
      ? `${p.year}-${String(p.month).padStart(2, "0")}`
      : p.quarter
        ? `${p.year} T${p.quarter}`
        : String(p.year);

    const deadlines = computeDeadlinesForPeriod(
      {
        periodId: p.id,
        periodLabel: label,
        periodType: p.periodType,
        year: p.year,
        month: p.month,
        quarter: p.quarter,
        endDate: p.endDate,
        declarations: p.declarations.map((d) => ({
          id: d.id,
          declarationType: d.declarationType,
          status: d.status,
          filedAt: d.filedAt ? d.filedAt.toISOString() : null,
        })),
      },
      today
    );

    allDeadlines.push(...deadlines);
  }

  // Sortează: urgente primele, apoi după daysUntil
  allDeadlines.sort((a, b) => a.daysUntil - b.daysUntil);

  const upcomingDeadlines = allDeadlines.filter(
    (d) => d.daysUntil > 7 && !d.isOverdue && !d.isUrgent
  );
  const upcomingAlerts = allDeadlines.filter((d) => d.isUrgent);
  const overdueAlerts = allDeadlines.filter((d) => d.isOverdue);

  // Ultimele 20 declaraţii depuse (filed)
  const recentFilings = await db.query.finTaxDeclarations.findMany({
    where: and(
      eq(finTaxDeclarations.tenantId, tenantId),
      eq(finTaxDeclarations.status, "filed")
    ),
    orderBy: [desc(finTaxDeclarations.filedAt)],
    limit: 20,
    with: { period: true },
  });

  const recentFilingsOut = recentFilings.map((d) => ({
    id: d.id,
    declarationType: d.declarationType,
    declarationTypeLabel: declarationTypeLabel(d.declarationType),
    periodId: d.periodId,
    periodLabel: d.period
      ? (d.period.month
          ? `${d.period.year}-${String(d.period.month).padStart(2, "0")}`
          : d.period.quarter
            ? `${d.period.year} T${d.period.quarter}`
            : String(d.period.year))
      : "",
    filedAt: d.filedAt ? d.filedAt.toISOString() : null,
    notes: d.notes,
  }));

  return c.json({
    upcoming_deadlines: upcomingDeadlines,
    upcoming_alerts: upcomingAlerts,
    overdue_alerts: overdueAlerts,
    recent_filings: recentFilingsOut,
    generated_at: new Date().toISOString(),
  });
});

// ─── PATCH /api/fin/tax/declarations/:id/file — marchează ca depusă ──────────

finTaxRoutes.patch(
  "/declarations/:id/file",
  zValidator("json", fileDeclarationSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const declId = c.req.param("id");
    const data = c.req.valid("json");

    const existing = await db.query.finTaxDeclarations.findFirst({
      where: and(
        eq(finTaxDeclarations.id, declId),
        eq(finTaxDeclarations.tenantId, tenantId)
      ),
    });

    if (!existing) {
      return c.json({ error: "Declarație negăsită." }, 404);
    }

    const [updated] = await db
      .update(finTaxDeclarations)
      .set({
        status: "filed",
        filedAt: new Date(),
        notes: data.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(finTaxDeclarations.id, declId),
          eq(finTaxDeclarations.tenantId, tenantId)
        )
      )
      .returning();

    return c.json({ declaration: updated });
  }
);
