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
 * Escape a string for safe HTML insertion.
 * Prevents XSS / HTML-injection when substituting user-provided values
 * (e.g. from an Excel cell) into an HTML template body.
 */
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render a template by substituting context values.
 * Values are HTML-escaped to prevent injection attacks (AC2 / T-DOCMERGE-003-2).
 * Unmatched placeholders are left as {{tag}} (visible in output — intentional).
 *
 * NOTE: The base renderTemplate in templates.ts does NOT escape — this wrapper
 * adds escaping specifically for docmerge's use-case where values come from
 * untrusted Excel cell data.
 */
export function renderWithContext(
  body: string,
  context: Record<string, string>
): string {
  const escapedContext: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) {
    escapedContext[k] = escHtml(v);
  }
  return renderTemplate(body, escapedContext);
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
