/**
 * DOCMERGE-001: Placeholder extraction and rendering for Document Merge.
 *
 * Re-exports/wraps the same logic as extractVariables/renderTemplate from
 * server/db/schema/templates.ts — DOES NOT re-implement the regex.
 * All {{tag}} detection is delegated to the existing implementation.
 */
import {
  extractVariables,
  renderTemplate,
} from "../../../server/db/schema/templates";

/**
 * Extract placeholder names from a template body.
 * Returns unique names in order of first appearance.
 * e.g. "Salut {{name}}, ai {{amount}}. {{name}}" → ["name", "amount"]
 */
export function extractPlaceholders(body: string): string[] {
  return extractVariables(body);
}

/**
 * Render a template by substituting context values.
 * Unmatched placeholders are left as {{tag}} (visible in output — intentional).
 */
export function renderWithContext(
  body: string,
  context: Record<string, string>
): string {
  return renderTemplate(body, context);
}

/**
 * Build a sample context for preview purposes.
 * Maps each placeholder to a human-readable demo value.
 * Unknown placeholders default to "{name}" to show the tag is filled.
 */
export function sampleContext(
  placeholders: string[]
): Record<string, string> {
  const DEFAULTS: Record<string, string> = {
    // Common field names (Romanian / generic)
    name: "Maria Popescu",
    nume: "Maria Popescu",
    prenume: "Maria",
    amount: "1 500",
    suma: "1 500",
    valoare: "1 500",
    date: "2026-06-17",
    data: "2026-06-17",
    email: "maria@example.com",
    phone: "+373 69 123 456",
    telefon: "+373 69 123 456",
    address: "str. Ștefan cel Mare 1",
    adresa: "str. Ștefan cel Mare 1",
    city: "Chișinău",
    oras: "Chișinău",
    country: "Moldova",
    tara: "Moldova",
    company: "Acme SRL",
    firma: "Acme SRL",
    contract: "CTR-2026-0001",
    nr: "001",
    numar: "001",
    idno: "1234567890123",
    iban: "MD24AG000000000002500000",
  };

  const ctx: Record<string, string> = {};
  for (const p of placeholders) {
    ctx[p] = DEFAULTS[p.toLowerCase()] ?? `{${p}}`;
  }
  return ctx;
}
