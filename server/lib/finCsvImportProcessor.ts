/**
 * MASS-003: FinDesk CSV Import Processor
 *
 * Provides two processor factories:
 * - makePartyImportProcessor: imports clients/suppliers from CSV
 * - makeSpendImportProcessor: imports expense records from CSV
 *
 * Both processors follow the RowProcessor interface from finBulkRunner:
 *   (row: FinBulkRow) => Promise<ProcessorResult>
 *
 * CSV format for parties:
 *   kind,name,country,idno,iban,address,city,email,phone
 *
 * CSV format for spend:
 *   category,amount_cents,currency,vat_deductible,description,vendor_name,expense_date,reference
 *
 * Idempotency:
 *   - Parties: skip if a party with the same IDNO (non-null) already exists for the tenant.
 *   - Spend: SHA-256 hash of the raw CSV row stored in import_hash; skip if hash already exists.
 */

import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { finParties } from "../db/schema/finParties";
import { finExpenses } from "../db/schema/finExpenses";
import type { FinBulkRow } from "../db/schema/finBulk";
import type { ProcessorResult } from "./finBulkRunner";

// ─── Simple CSV parser (no external dep) ─────────────────────────────────────

/**
 * Parse a single CSV row, respecting quoted fields.
 * Handles commas inside quoted fields and escaped quotes ("").
 */
function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        // escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Party import ─────────────────────────────────────────────────────────────

/**
 * Expected CSV headers (case-insensitive):
 *   kind, name, country, idno, iban, address, city, email, phone
 *
 * The row.meta.csv_line should contain the raw CSV line for this party.
 * row.meta.csv_headers should contain the header line.
 */
export function makePartyImportProcessor(tenantId: string) {
  return async function processPartyRow(row: FinBulkRow): Promise<ProcessorResult> {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const csvLine = meta.csv_line as string | undefined;
    const csvHeaders = meta.csv_headers as string | undefined;

    if (!csvLine || !csvHeaders) {
      return { error: "Missing csv_line or csv_headers in row meta" };
    }

    const headers = parseCSVRow(csvHeaders).map((h) => h.toLowerCase());
    const values = parseCSVRow(csvLine);

    const get = (header: string): string | undefined => {
      const idx = headers.indexOf(header);
      return idx >= 0 ? (values[idx] ?? "").trim() : undefined;
    };

    // Validate required fields
    const kind = get("kind")?.toLowerCase();
    if (!kind || !["client", "supplier", "both"].includes(kind)) {
      return { error: `Invalid or missing 'kind' field: '${kind ?? ""}'` };
    }

    const name = get("name");
    if (!name) {
      return { error: "Missing required field: name" };
    }

    const country = get("country");
    if (!country || country.length !== 2) {
      return { error: `Invalid country code: '${country ?? ""}'` };
    }

    const idno = get("idno") || null;

    // Idempotency: skip if a party with same IDNO already exists
    if (idno) {
      const existing = await db
        .select({ id: finParties.id })
        .from(finParties)
        .where(and(eq(finParties.tenantId, tenantId), eq(finParties.idno, idno)))
        .limit(1);

      if (existing.length > 0) {
        return { skip: true, ref: existing[0].id };
      }
    }

    // Insert the party
    const inserted = await db
      .insert(finParties)
      .values({
        tenantId,
        kind: kind as "client" | "supplier" | "both",
        name,
        country: country.toUpperCase(),
        idno,
        iban: get("iban") || null,
        address: get("address") || null,
        city: get("city") || null,
        email: get("email") || null,
        phone: get("phone") || null,
        isActive: true,
      })
      .returning({ id: finParties.id });

    return { ref: inserted[0]?.id };
  };
}

// ─── Spend import ─────────────────────────────────────────────────────────────

const VALID_CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "marketing",
  "supplies",
  "software",
  "maintenance",
  "other",
] as const;

type ExpenseCategory = (typeof VALID_CATEGORIES)[number];

/**
 * Expected CSV headers (case-insensitive):
 *   category, amount_cents, currency, vat_deductible, description,
 *   vendor_name, expense_date, reference
 *
 * row.meta.csv_line = raw CSV line (used for hash)
 * row.meta.csv_headers = header line
 * row.meta.created_by = userId who initiated the import (required by schema)
 */
export function makeSpendImportProcessor(tenantId: string) {
  return async function processSpendRow(row: FinBulkRow): Promise<ProcessorResult> {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const csvLine = meta.csv_line as string | undefined;
    const csvHeaders = meta.csv_headers as string | undefined;
    const createdBy = meta.created_by as string | undefined;

    if (!csvLine || !csvHeaders) {
      return { error: "Missing csv_line or csv_headers in row meta" };
    }

    if (!createdBy) {
      return { error: "Missing created_by in row meta" };
    }

    // Idempotency: SHA-256 hash of tenantId + csvLine
    const importHash = createHash("sha256")
      .update(`${tenantId}:${csvLine}`)
      .digest("hex");

    const existingExpense = await db
      .select({ id: finExpenses.id })
      .from(finExpenses)
      .where(
        and(eq(finExpenses.tenantId, tenantId), eq(finExpenses.importHash, importHash))
      )
      .limit(1);

    if (existingExpense.length > 0) {
      return { skip: true, ref: existingExpense[0].id };
    }

    // Parse CSV fields
    const headers = parseCSVRow(csvHeaders).map((h) => h.toLowerCase());
    const values = parseCSVRow(csvLine);

    const get = (header: string): string | undefined => {
      const idx = headers.indexOf(header);
      return idx >= 0 ? (values[idx] ?? "").trim() : undefined;
    };

    // Validate required fields
    const category = get("category")?.toLowerCase();
    if (!category || !VALID_CATEGORIES.includes(category as ExpenseCategory)) {
      return { error: `Invalid category: '${category ?? ""}'` };
    }

    const amountRaw = get("amount_cents");
    const amountCents = amountRaw ? parseInt(amountRaw, 10) : NaN;
    if (isNaN(amountCents) || amountCents < 0) {
      return { error: `Invalid amount_cents: '${amountRaw ?? ""}'` };
    }

    const expenseDate = get("expense_date");
    if (!expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      return {
        error: `Invalid expense_date (expected YYYY-MM-DD): '${expenseDate ?? ""}'`,
      };
    }

    const vatDeductibleRaw = get("vat_deductible")?.toLowerCase();
    const vatDeductible =
      vatDeductibleRaw === "true" || vatDeductibleRaw === "1" || vatDeductibleRaw === "yes";

    // Insert the expense
    const inserted = await db
      .insert(finExpenses)
      .values({
        tenantId,
        category: category as ExpenseCategory,
        amountCents,
        currency: get("currency") || "MDL",
        vatDeductible,
        source: "manual" as const,
        status: "draft" as const,
        description: get("description") || null,
        vendorName: get("vendor_name") || null,
        reference: get("reference") || null,
        expenseDate,
        importHash,
        createdBy,
      })
      .returning({ id: finExpenses.id });

    return { ref: inserted[0]?.id };
  };
}

// ─── CSV parsing utility (exported for testing) ───────────────────────────────

export { parseCSVRow };
