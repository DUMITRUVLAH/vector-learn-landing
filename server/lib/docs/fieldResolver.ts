/**
 * DG-108 — de unde vine fiecare câmp al unui act.
 *
 * Aici se ține promisiunea modulului: rechizitele se scriu O DATĂ, în registrul de furnizori, și
 * apar corect în toate actele. Clientul NU trimite IBAN-ul și codul fiscal — trimite id-ul
 * furnizorului, iar serverul le citește din `par_vendors`. Așa dispare clasa de erori „am copiat
 * IBAN-ul din actul precedent", care se termină cu bani trimiși greșit.
 *
 * Ce rezolvă, pe grupuri (aceleași nume ca în catalogul editorului, src/lib/docs/fieldCatalog.ts):
 *   noi.*         — organizația (par_settings + par_payers)
 *   contraparte.* — furnizorul ales (par_vendors)
 *   proiect.* / eveniment.*
 *   document.*    — numărul, data, locul, actul-sursă
 *   total.*       — sumă, valută, suma în litere (amountToWordsRo)
 *   utilizator.*  — cine întocmește
 *
 * Ce NU face: nu inventează. Un câmp fără sursă rămâne nerezolvat, iar apelantul îl raportează ca
 * lipsă înainte de finalizare (DG-111) — mai bine un act oprit decât unul semnat cu un gol tăcut.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { parVendors, parPayers, parSettings, parProjects, parEvents } from "../../db/schema/par";
import { amountToWordsRo } from "./amountToWords";

export interface ResolveContextInput {
  tenantId: string;
  vendorId?: string | null;
  projectId?: string | null;
  eventId?: string | null;
  payerId?: string | null;
  docNumber?: string | null;
  docDate?: Date | null;
  docPlace?: string | null;
  basedOn?: string | null;
  totalCents?: number | null;
  currency?: string | null;
  userName?: string | null;
  userTitle?: string | null;
}

/** Data pe act se scrie ca la noi: 12.03.2026. */
export function formatDateRo(d: Date): string {
  return d.toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Suma cu separator de mii și două zecimale: 24 500,00. */
export function formatMoneyRo(cents: number): string {
  return (cents / 100).toLocaleString("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function put(ctx: Record<string, string>, key: string, value: string | null | undefined) {
  if (value != null && value !== "") ctx[key] = value;
}

export async function resolveDocumentContext(
  input: ResolveContextInput
): Promise<Record<string, string>> {
  const ctx: Record<string, string> = {};

  // ── Organizația noastră ────────────────────────────────────────────────────
  const [settings] = await db
    .select()
    .from(parSettings)
    .where(eq(parSettings.tenantId, input.tenantId))
    .limit(1);
  put(ctx, "noi.denumire", settings?.orgLegalName);

  const payerFilter = input.payerId
    ? and(eq(parPayers.tenantId, input.tenantId), eq(parPayers.id, input.payerId))
    : and(eq(parPayers.tenantId, input.tenantId), eq(parPayers.active, true));
  const [payer] = await db.select().from(parPayers).where(payerFilter).limit(1);
  if (payer) {
    if (!ctx["noi.denumire"]) put(ctx, "noi.denumire", payer.legalName ?? payer.name);
    put(ctx, "noi.idno", payer.idno);
  }

  // ── Contrapartea ───────────────────────────────────────────────────────────
  if (input.vendorId) {
    const [v] = await db
      .select()
      .from(parVendors)
      .where(and(eq(parVendors.id, input.vendorId), eq(parVendors.tenantId, input.tenantId)));
    if (v) {
      put(ctx, "contraparte.denumire", v.name);
      put(ctx, "contraparte.idno", v.idnp);
      put(ctx, "contraparte.iban", v.iban);
      put(ctx, "contraparte.banca", v.bank);
      put(ctx, "contraparte.bic", v.bicSwift);
      put(ctx, "contraparte.adresa", v.legalAddress);
      put(ctx, "contraparte.administrator", v.administratorName);
      put(ctx, "contraparte.cod_tva", v.vatCode);
    }
  }

  // ── Proiect / eveniment ────────────────────────────────────────────────────
  if (input.projectId) {
    const [p] = await db
      .select()
      .from(parProjects)
      .where(and(eq(parProjects.id, input.projectId), eq(parProjects.tenantId, input.tenantId)));
    if (p) {
      put(ctx, "proiect.nume", p.name);
      put(ctx, "proiect.donator", p.donor);
    }
  }
  if (input.eventId) {
    const [e] = await db
      .select()
      .from(parEvents)
      .where(and(eq(parEvents.id, input.eventId), eq(parEvents.tenantId, input.tenantId)));
    if (e) put(ctx, "eveniment.nume", e.name);
  }

  // ── Actul în sine ──────────────────────────────────────────────────────────
  put(ctx, "document.numar", input.docNumber);
  put(ctx, "document.data", formatDateRo(input.docDate ?? new Date()));
  put(ctx, "document.loc", input.docPlace ?? "mun. Chișinău");
  put(ctx, "document.baza", input.basedOn);

  // ── Sume ───────────────────────────────────────────────────────────────────
  const currency = input.currency ?? "MDL";
  if (input.totalCents != null) {
    put(ctx, "total.suma", formatMoneyRo(input.totalCents));
    put(ctx, "total.valuta", currency);
    put(ctx, "total.in_litere", amountToWordsRo(input.totalCents, { currency }));
  }

  // ── Cine întocmește ────────────────────────────────────────────────────────
  put(ctx, "utilizator.nume", input.userName);
  put(ctx, "utilizator.functie", input.userTitle);

  return ctx;
}

/**
 * Câmpurile cerute de șablon care NU au valoare. Lista asta e ce vede omul înainte de finalizare —
 * de aceea întoarce nume, nu un simplu „incomplet".
 */
export function missingFields(
  placeholders: string[],
  context: Record<string, string>
): string[] {
  return placeholders.filter((p) => !context[p] || context[p].trim() === "");
}
