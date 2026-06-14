/**
 * EXPORT-001: Rute export contabil structurat FinDesk
 * Montare: app.route("/api/fin/export", finExportRoutes)
 *
 * Endpoints:
 *   GET /journal        — jurnal GL în CSV (filtre: from, to, account_code)
 *   GET /trial-balance  — balanță de verificare CSV (filtru: as_of)
 *   GET /invoices-sfs   — facturi SFS Moldova CSV (filtre: from, to)
 *   GET /saf-t-ro       — SAF-T RO simplificat XML (filtre: year, period)
 *
 * Soft reference: dacă tabelele fin_ledger_entries / fin_accounts / fin_invoices
 * nu există pe branch curent, returnează CSV gol (200, nu 500).
 *
 * Design:
 * - Tenant isolation via session.tenantId
 * - No raw .execute().rows — Drizzle query builder sau SQL safe
 * - requireAuth pe toate rutele
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/client";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  buildCsv,
  buildEmptyCsv,
  formatCentsToLei,
  formatDate,
} from "../lib/fin/exportCsv";
import { generateSafT, type SaftAccount, type SaftJournalEntry } from "../lib/fin/exportSafT";
import { generate1cXml, type OneCEntry } from "../lib/fin/export1c";
import { generateSagaCsv, type SagaEntry } from "../lib/fin/exportSaga";

export const finExportRoutes = new Hono<{ Variables: AuthVariables }>();

finExportRoutes.use("*", requireAuth);

// ─── Helpere ──────────────────────────────────────────────────────────────────

function csvResponse(c: { header: (k: string, v: string) => void; text: (s: string) => Response }, csv: string, filename: string): Response {
  // Hono context
  return (c as unknown as import("hono").Context).newResponse(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
}

function xmlResponse(c: unknown, xml: string, filename: string): Response {
  return (c as unknown as import("hono").Context).newResponse(xml, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
}

// ─── Soft imports: încearcă să importe schema, returnează null dacă absent ────

async function tryGetLedgerSchema() {
  try {
    const m = await import("../db/schema/finLedger");
    return m;
  } catch {
    return null;
  }
}

async function tryGetInvoicesSchema() {
  try {
    const m = await import("../db/schema/finInvoices");
    return m;
  } catch {
    return null;
  }
}

// ─── GET /journal ─────────────────────────────────────────────────────────────

finExportRoutes.get(
  "/journal",
  zValidator(
    "query",
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      account_code: z.string().max(20).optional(),
    })
  ),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { from, to, account_code } = c.req.valid("query");

    const HEADERS = ["date", "ref", "description", "account_code", "account_name", "debit_lei", "credit_lei"];
    const filename = `jurnal_${from ?? "all"}_${to ?? "all"}.csv`;

    const schema = await tryGetLedgerSchema();
    if (!schema?.finLedgerEntries || !schema?.finAccounts) {
      return csvResponse(c as unknown, buildEmptyCsv(HEADERS), filename);
    }

    try {
      const { finLedgerEntries, finAccounts } = schema;
      const { eq, and, gte, lte, sql } = await import("drizzle-orm");

      const conditions: import("drizzle-orm").SQL[] = [
        eq(finLedgerEntries.tenantId, tenantId),
      ];
      if (from) conditions.push(gte(sql`date(${finLedgerEntries.entryDate})`, from));
      if (to) conditions.push(lte(sql`date(${finLedgerEntries.entryDate})`, to));
      if (account_code) conditions.push(eq(finLedgerEntries.accountCode, account_code));

      const entries = await db
        .select({
          entryDate: finLedgerEntries.entryDate,
          ref: finLedgerEntries.ref,
          description: finLedgerEntries.description,
          accountCode: finLedgerEntries.accountCode,
          accountName: finAccounts.name,
          debitCents: finLedgerEntries.debitCents,
          creditCents: finLedgerEntries.creditCents,
        })
        .from(finLedgerEntries)
        .leftJoin(finAccounts, eq(finLedgerEntries.accountCode, finAccounts.code))
        .where(and(...conditions))
        .orderBy(finLedgerEntries.entryDate, finLedgerEntries.ref);

      const rows = entries.map((e) => [
        formatDate(e.entryDate ?? ""),
        e.ref ?? "",
        e.description ?? "",
        e.accountCode ?? "",
        e.accountName ?? "",
        formatCentsToLei(e.debitCents ?? 0),
        formatCentsToLei(e.creditCents ?? 0),
      ]);

      return csvResponse(c as unknown, buildCsv(HEADERS, rows), filename);
    } catch {
      return csvResponse(c as unknown, buildEmptyCsv(HEADERS), filename);
    }
  }
);

// ─── GET /trial-balance ───────────────────────────────────────────────────────

finExportRoutes.get(
  "/trial-balance",
  zValidator(
    "query",
    z.object({
      as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
  ),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { as_of } = c.req.valid("query");

    const HEADERS = [
      "account_code", "account_name", "class",
      "debit_total_lei", "credit_total_lei",
    ];
    const filename = `balanta_verificare_${as_of ?? "all"}.csv`;

    const schema = await tryGetLedgerSchema();
    if (!schema?.finLedgerEntries || !schema?.finAccounts) {
      return csvResponse(c as unknown, buildEmptyCsv(HEADERS), filename);
    }

    try {
      const { finLedgerEntries, finAccounts } = schema;
      const { eq, and, lte, sql, sum } = await import("drizzle-orm");

      const conds: import("drizzle-orm").SQL[] = [
        eq(finLedgerEntries.tenantId, tenantId),
      ];
      if (as_of) conds.push(lte(sql`date(${finLedgerEntries.entryDate})`, as_of));

      const rows_data = await db
        .select({
          code: finAccounts.code,
          name: finAccounts.name,
          class: finAccounts.class,
          totalDebit: sum(finLedgerEntries.debitCents),
          totalCredit: sum(finLedgerEntries.creditCents),
        })
        .from(finAccounts)
        .leftJoin(
          finLedgerEntries,
          and(
            eq(finLedgerEntries.accountCode, finAccounts.code),
            eq(finLedgerEntries.tenantId, tenantId),
            ...(as_of ? [lte(sql`date(${finLedgerEntries.entryDate})`, as_of)] : [])
          )
        )
        .where(eq(finAccounts.tenantId, tenantId))
        .groupBy(finAccounts.code, finAccounts.name, finAccounts.class)
        .orderBy(finAccounts.code);

      const rows = rows_data.map((r) => [
        r.code,
        r.name,
        r.class ?? "",
        formatCentsToLei(Number(r.totalDebit ?? 0)),
        formatCentsToLei(Number(r.totalCredit ?? 0)),
      ]);

      return csvResponse(c as unknown, buildCsv(HEADERS, rows), filename);
    } catch {
      return csvResponse(c as unknown, buildEmptyCsv(HEADERS), filename);
    }
  }
);

// ─── GET /invoices-sfs ────────────────────────────────────────────────────────

finExportRoutes.get(
  "/invoices-sfs",
  zValidator(
    "query",
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
  ),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { from, to } = c.req.valid("query");

    const HEADERS = [
      "seria", "numar", "data", "cumparator_idno", "cumparator_name",
      "total_fara_tva_lei", "tva_12_lei", "total_cu_tva_lei",
    ];
    const filename = `facturi_sfs_${from ?? "all"}_${to ?? "all"}.csv`;

    const invoicesSchema = await tryGetInvoicesSchema();
    if (!invoicesSchema?.finInvoices) {
      // Soft reference: tabelul absent → CSV gol (200)
      return csvResponse(c as unknown, buildEmptyCsv(HEADERS), filename);
    }

    try {
      const { finInvoices } = invoicesSchema;
      const { eq, and, gte, lte, sql } = await import("drizzle-orm");

      const conds: import("drizzle-orm").SQL[] = [
        eq(finInvoices.tenantId, tenantId),
      ];
      if (from) conds.push(gte(sql`date(${finInvoices.invoiceDate})`, from));
      if (to) conds.push(lte(sql`date(${finInvoices.invoiceDate})`, to));

      const invs = await db
        .select()
        .from(finInvoices)
        .where(and(...conds))
        .orderBy(finInvoices.invoiceDate, finInvoices.number);

      const rows = invs.map((inv) => [
        inv.series ?? "",
        inv.number ?? "",
        formatDate(inv.invoiceDate ?? ""),
        inv.buyerIdno ?? "",
        inv.buyerName ?? "",
        formatCentsToLei(inv.subtotalCents ?? 0),
        formatCentsToLei(inv.vatCents ?? 0),
        formatCentsToLei(inv.totalCents ?? 0),
      ]);

      return csvResponse(c as unknown, buildCsv(HEADERS, rows), filename);
    } catch {
      return csvResponse(c as unknown, buildEmptyCsv(HEADERS), filename);
    }
  }
);

// ─── GET /saf-t-ro ───────────────────────────────────────────────────────────

finExportRoutes.get(
  "/saf-t-ro",
  zValidator(
    "query",
    z.object({
      year: z.coerce.number().int().min(2000).max(2100).optional(),
      period: z.string().max(10).optional(), // "1"–"12" sau "Q1"–"Q4"
    })
  ),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { year = new Date().getFullYear(), period } = c.req.valid("query");

    // Calculează intervalul datei din year + period
    let startDate: string;
    let endDate: string;

    if (period && /^Q[1-4]$/.test(period)) {
      const q = parseInt(period[1]);
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = q * 3;
      startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
      const lastDay = new Date(year, endMonth, 0).getDate();
      endDate = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;
    } else if (period && /^\d{1,2}$/.test(period)) {
      const m = parseInt(period);
      startDate = `${year}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(year, m, 0).getDate();
      endDate = `${year}-${String(m).padStart(2, "0")}-${lastDay}`;
    } else {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    }

    const filename = `saft_ro_${year}${period ? `_${period}` : ""}.xml`;

    const schema = await tryGetLedgerSchema();

    let accounts: SaftAccount[] = [];
    let entries: SaftJournalEntry[] = [];

    if (schema?.finAccounts && schema?.finLedgerEntries) {
      try {
        const { finAccounts, finLedgerEntries } = schema;
        const { eq, and, gte, lte, sql } = await import("drizzle-orm");

        const accs = await db
          .select()
          .from(finAccounts)
          .where(eq(finAccounts.tenantId, tenantId))
          .orderBy(finAccounts.code);

        accounts = accs.map((a) => ({
          code: a.code,
          name: a.name ?? "",
          class: a.class ?? null,
        }));

        const entr = await db
          .select()
          .from(finLedgerEntries)
          .where(
            and(
              eq(finLedgerEntries.tenantId, tenantId),
              gte(sql`date(${finLedgerEntries.entryDate})`, startDate),
              lte(sql`date(${finLedgerEntries.entryDate})`, endDate)
            )
          )
          .orderBy(finLedgerEntries.entryDate);

        entries = entr.map((e) => ({
          entryId: e.id,
          entryDate: formatDate(e.entryDate ?? startDate),
          description: e.description ?? "",
          accountCode: e.accountCode ?? "",
          debitCents: e.debitCents ?? 0,
          creditCents: e.creditCents ?? 0,
          ref: e.ref ?? null,
        }));
      } catch {
        // Soft reference — keep empty arrays
      }
    }

    // Obține denumirea companiei din tenant (optional)
    let companyName = "Vector Learn";
    try {
      const { tenants } = await import("../db/schema");
      const { eq } = await import("drizzle-orm");
      const t = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (t[0]?.name) companyName = t[0].name;
    } catch {
      // ignore
    }

    const xml = generateSafT({
      companyName,
      startDate,
      endDate,
      accounts,
      entries,
    });

    return xmlResponse(c as unknown, xml, filename);
  }
);

// ─── EXPORT-002 ───────────────────────────────────────────────────────────────

// GET /formats — lista tuturor formatelor disponibile
finExportRoutes.get("/formats", async (c) => {
  const formats = [
    {
      id: "journal-csv",
      label: "Jurnal GL (CSV)",
      description: "Jurnal înregistrări contabile în format CSV (compatibil Excel RO/MD)",
      mime: "text/csv",
      endpoint: "/api/fin/export/journal",
      params: ["from", "to", "account_code"],
    },
    {
      id: "trial-balance-csv",
      label: "Balanță de verificare (CSV)",
      description: "Balanță de verificare cu totaluri debit/credit per cont",
      mime: "text/csv",
      endpoint: "/api/fin/export/trial-balance",
      params: ["as_of"],
    },
    {
      id: "invoices-sfs-csv",
      label: "Facturi SFS Moldova (CSV)",
      description: "Registru facturi în format SFS Moldova (pentru declarații TVA)",
      mime: "text/csv",
      endpoint: "/api/fin/export/invoices-sfs",
      params: ["from", "to"],
    },
    {
      id: "saf-t-ro-xml",
      label: "SAF-T RO simplificat (XML)",
      description: "Standard Audit File simplificat pentru ANAF România",
      mime: "application/xml",
      endpoint: "/api/fin/export/saf-t-ro",
      params: ["year", "period"],
    },
    {
      id: "saf-t-ro-full",
      label: "SAF-T RO complet cu TVA (XML)",
      description: "Standard Audit File cu TaxTable TVA — pentru declarații ANAF",
      mime: "application/xml",
      endpoint: "/api/fin/export/saf-t-ro-full",
      params: ["year", "period"],
    },
    {
      id: "1c-xml",
      label: "Export 1C:Accounting (XML)",
      description: "XML compatibil import în 1C:Contabilitate (format Moldova)",
      mime: "application/xml",
      endpoint: "/api/fin/export/1c-xml",
      params: ["from", "to"],
    },
    {
      id: "saga-csv",
      label: "Export SAGA C (CSV)",
      description: "Jurnal în format SAGA C (România) — delimitator virgulă, UTF-8",
      mime: "text/csv",
      endpoint: "/api/fin/export/saga-csv",
      params: ["from", "to"],
    },
  ];
  return c.json({ formats });
});

// GET /1c-xml — export XML 1C:Accounting
finExportRoutes.get(
  "/1c-xml",
  zValidator(
    "query",
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
  ),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { from, to } = c.req.valid("query");
    const filename = `export_1c_${from ?? "all"}_${to ?? "all"}.xml`;

    const schema = await tryGetLedgerSchema();

    let entries: OneCEntry[] = [];

    if (schema?.finLedgerEntries) {
      try {
        const { finLedgerEntries, finAccounts } = schema;
        const { eq, and, gte, lte, sql } = await import("drizzle-orm");

        const conds: import("drizzle-orm").SQL[] = [eq(finLedgerEntries.tenantId, tenantId)];
        if (from) conds.push(gte(sql`date(${finLedgerEntries.entryDate})`, from));
        if (to) conds.push(lte(sql`date(${finLedgerEntries.entryDate})`, to));

        const rows = await db
          .select({
            entryDate: finLedgerEntries.entryDate,
            ref: finLedgerEntries.ref,
            description: finLedgerEntries.description,
            accountCode: finLedgerEntries.accountCode,
            debitCents: finLedgerEntries.debitCents,
            creditCents: finLedgerEntries.creditCents,
          })
          .from(finLedgerEntries)
          .leftJoin(finAccounts, eq(finLedgerEntries.accountCode, finAccounts.code))
          .where(and(...conds))
          .orderBy(finLedgerEntries.entryDate, finLedgerEntries.ref);

        entries = rows.map((r) => ({
          date: formatDate(r.entryDate ?? ""),
          ref: r.ref ?? null,
          description: r.description ?? null,
          accountCode: r.accountCode ?? "",
          debitCents: r.debitCents ?? 0,
          creditCents: r.creditCents ?? 0,
        }));
      } catch {
        // Soft reference — empty entries
      }
    }

    const xml = generate1cXml(entries);
    return xmlResponse(c as unknown, xml, filename);
  }
);

// GET /saga-csv — export CSV SAGA C
finExportRoutes.get(
  "/saga-csv",
  zValidator(
    "query",
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
  ),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { from, to } = c.req.valid("query");
    const filename = `jurnal_saga_${from ?? "all"}_${to ?? "all"}.csv`;

    const EMPTY_CSV = "Data,Cont,DenumireCont,Suma,TipOperatie,Descriere\r\n";

    const schema = await tryGetLedgerSchema();

    if (!schema?.finLedgerEntries) {
      return csvResponse(c as unknown, EMPTY_CSV, filename);
    }

    try {
      const { finLedgerEntries, finAccounts } = schema;
      const { eq, and, gte, lte, sql } = await import("drizzle-orm");

      const conds: import("drizzle-orm").SQL[] = [eq(finLedgerEntries.tenantId, tenantId)];
      if (from) conds.push(gte(sql`date(${finLedgerEntries.entryDate})`, from));
      if (to) conds.push(lte(sql`date(${finLedgerEntries.entryDate})`, to));

      const rows = await db
        .select({
          entryDate: finLedgerEntries.entryDate,
          accountCode: finLedgerEntries.accountCode,
          accountName: finAccounts.name,
          debitCents: finLedgerEntries.debitCents,
          creditCents: finLedgerEntries.creditCents,
          description: finLedgerEntries.description,
        })
        .from(finLedgerEntries)
        .leftJoin(finAccounts, eq(finLedgerEntries.accountCode, finAccounts.code))
        .where(and(...conds))
        .orderBy(finLedgerEntries.entryDate);

      const entries: SagaEntry[] = rows.map((r) => ({
        date: formatDate(r.entryDate ?? ""),
        accountCode: r.accountCode ?? "",
        accountName: r.accountName ?? null,
        debitCents: r.debitCents ?? 0,
        creditCents: r.creditCents ?? 0,
        description: r.description ?? null,
      }));

      return csvResponse(c as unknown, generateSagaCsv(entries), filename);
    } catch {
      return csvResponse(c as unknown, EMPTY_CSV, filename);
    }
  }
);

// GET /saf-t-ro-full — SAF-T RO complet cu TaxTable TVA
finExportRoutes.get(
  "/saf-t-ro-full",
  zValidator(
    "query",
    z.object({
      year: z.coerce.number().int().min(2000).max(2100).optional(),
      period: z.string().max(10).optional(),
    })
  ),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { year = new Date().getFullYear(), period } = c.req.valid("query");

    let startDate: string;
    let endDate: string;

    if (period && /^Q[1-4]$/.test(period)) {
      const q = parseInt(period[1]);
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = q * 3;
      startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
      const lastDay = new Date(year, endMonth, 0).getDate();
      endDate = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;
    } else if (period && /^\d{1,2}$/.test(period)) {
      const m = parseInt(period);
      startDate = `${year}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(year, m, 0).getDate();
      endDate = `${year}-${String(m).padStart(2, "0")}-${lastDay}`;
    } else {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    }

    const filename = `saft_ro_full_${year}${period ? `_${period}` : ""}.xml`;

    const schema = await tryGetLedgerSchema();

    let accounts: SaftAccount[] = [];
    let entries: SaftJournalEntry[] = [];

    if (schema?.finAccounts && schema?.finLedgerEntries) {
      try {
        const { finAccounts, finLedgerEntries } = schema;
        const { eq, and, gte, lte, sql } = await import("drizzle-orm");

        const accs = await db
          .select()
          .from(finAccounts)
          .where(eq(finAccounts.tenantId, tenantId))
          .orderBy(finAccounts.code);

        accounts = accs.map((a) => ({
          code: a.code,
          name: a.name ?? "",
          class: a.class ?? null,
        }));

        const entr = await db
          .select()
          .from(finLedgerEntries)
          .where(
            and(
              eq(finLedgerEntries.tenantId, tenantId),
              gte(sql`date(${finLedgerEntries.entryDate})`, startDate),
              lte(sql`date(${finLedgerEntries.entryDate})`, endDate)
            )
          )
          .orderBy(finLedgerEntries.entryDate);

        entries = entr.map((e) => ({
          entryId: e.id,
          entryDate: formatDate(e.entryDate ?? startDate),
          description: e.description ?? "",
          accountCode: e.accountCode ?? "",
          debitCents: e.debitCents ?? 0,
          creditCents: e.creditCents ?? 0,
          ref: e.ref ?? null,
        }));
      } catch {
        // Soft reference — keep empty arrays
      }
    }

    let companyName = "Vector Learn";
    try {
      const { tenants } = await import("../db/schema");
      const { eq } = await import("drizzle-orm");
      const t = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (t[0]?.name) companyName = t[0].name;
    } catch {
      // ignore
    }

    const xml = generateSafT({
      companyName,
      startDate,
      endDate,
      accounts,
      entries,
      includeTax: true,
    });

    return xmlResponse(c as unknown, xml, filename);
  }
);
