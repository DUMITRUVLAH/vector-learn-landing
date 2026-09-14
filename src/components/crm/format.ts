/**
 * CRM (Faza 1) — formatare comună: bani (cenți) și titlul cardului/fișei de lead.
 *
 * Extras din `CrmPipelinePage.tsx` ca să nu se dubleze în `LeadDetailSheet.tsx` — un singur
 * loc care știe cum se transformă `valueCents` în text și înapoi.
 */
import type { CrmLead } from "@/lib/api/crm";

/**
 * Schema `leads` (`server/db/schema/leads.ts`) nu are un câmp de monedă per lead —
 * `valueCents` e un întreg simplu, în moneda unică a tenantului. Faza 1 fixează
 * MDL (clientul e din Moldova); dacă apare multi-monedă pe leaduri, se adaugă
 * atunci o coloană `currency` reală, nu se ghicește aici.
 */
export const LEAD_CURRENCY = "MDL";

/** Aceeași convenție locală ca în restul FinDesk (vezi `FinCalendarPage.tsx`). */
export function formatCents(cents: number, currency: string = LEAD_CURRENCY): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** „1500" / „1.500,50" → cenți. Analog `leiToCents` din `FinInvoiceCreateModal.tsx`. */
export function leadValueToCents(text: string): number {
  const n = parseFloat((text || "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

/** Titlul cardului/fișei: `dealName` (dacă e setat) înlocuiește `fullName` — vezi schema leads. */
export function leadTitle(lead: Pick<CrmLead, "dealName" | "fullName">): string {
  return lead.dealName || lead.fullName;
}

/** „" (gol după trim) → `null`, altfel textul curățat de spații. Pentru câmpuri opționale
 *  nullable pe server (`.optional().nullable()`) — un string gol NU e o valoare validă pentru
 *  `email` (validarea `.email()` îl respinge), deci golirea unui câmp trebuie să trimită `null`,
 *  nu `""`. */
export function emptyToNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}
