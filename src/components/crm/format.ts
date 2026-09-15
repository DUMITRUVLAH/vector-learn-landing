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

/**
 * Aceeași sumă, dar fără zecimale — DOAR pentru tabla de leaduri. Pe cartonaș, cei doi „,00" de
 * la finalul fiecărei sume nu spun nimic (nimeni nu negociază bani în bani mărunți la nivel de
 * oportunitate) și îngroașă exact rândul care trebuie citit dintr-o privire. Fișa, lista și
 * documentele păstrează `formatCents`: acolo suma e o cifră de lucru, nu un reper vizual.
 */
export function formatCentsShort(cents: number, currency: string = LEAD_CURRENCY): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
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

/**
 * Cele două rânduri de identitate ale cartonașului, fără să spună firma de două ori.
 *
 * Oamenii scriu `dealName` ca „Firma SRL — ce vinzi", iar cardul avea firma și în titlu, și pe
 * rândul de dedesubt. Rezultatul: două rânduri aproape identice, din care se tăia (trunchia)
 * tocmai partea care deosebește o oportunitate de alta. Aici titlul păstrează CE vinzi, iar
 * firma coboară pe rândul secundar — o singură dată.
 */
export function leadCardLines(
  lead: Pick<CrmLead, "dealName" | "fullName" | "company" | "interestCourse">,
): { title: string; subtitle: string | null } {
  const full = leadTitle(lead).trim();
  const company = lead.company?.trim() || null;
  const product = lead.interestCourse?.trim() || null;
  if (!company) return { title: full, subtitle: product };
  const startsWithCompany = full.toLowerCase().startsWith(company.toLowerCase());
  const rest = startsWithCompany ? full.slice(company.length).replace(/^[\s—–\-·|]+/, "").trim() : full;
  // Titlul ERA doar numele firmei: atunci firma rămâne titlu, iar rândul secundar spune ce vinzi.
  if (!rest) return { title: company, subtitle: product };
  return { title: rest, subtitle: company };
}

/** „" (gol după trim) → `null`, altfel textul curățat de spații. Pentru câmpuri opționale
 *  nullable pe server (`.optional().nullable()`) — un string gol NU e o valoare validă pentru
 *  `email` (validarea `.email()` îl respinge), deci golirea unui câmp trebuie să trimită `null`,
 *  nu `""`. */
export function emptyToNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}
