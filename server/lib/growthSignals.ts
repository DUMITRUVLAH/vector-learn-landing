/**
 * PLATFORM-002 — semnalele de creștere: activare și folosire reală a modulelor.
 *
 * Distincția care contează pentru marketing: „modul ACTIVAT" ≠ „modul FOLOSIT", și
 * „s-a logat" ≠ „a activat". Consola arăta până acum doar prima variantă din fiecare
 * pereche, ceea ce face orice decizie de preț sau de canal să fie pe ghicite.
 *
 * Activarea = prima acțiune cu valoare reală: o factură, o cheltuială, o cerere PAR.
 * Se calculează din datele existente (nu cere instrumentare nouă) și se memorează pe
 * `tenants.activated_at` la prima constatare, ca istoricul să nu se rescrie.
 */
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { tenants } from "../db/schema/tenants";
import { users } from "../db/schema/users";
import { finInvoices } from "../db/schema/finInvoices";
import { finExpenses } from "../db/schema/finExpenses";
import { parRequests } from "../db/schema/par";
import { docmergeTemplates } from "../db/schema/docmergeTemplates";
import { itparkEngagements } from "../db/schema/itpark";

/** Câte obiecte reale are fiecare workspace, per modul. Cheia = tenantId. */
export interface UsageRow {
  invoices: number;
  expenses: number;
  parRequests: number;
  docmergeTemplates: number;
  itparkEngagements: number;
}

/**
 * Numărătorile sunt scrise explicit, per tabel, în loc de un helper generic: tipurile
 * drizzle nu pot exprima „orice tabel cu tenantId" fără a cădea în `any`, iar cinci
 * interogări lizibile bat un cast inteligent care ascunde o greșeală de coloană.
 * Fiecare e izolată: dacă un modul lipsește într-un mediu, restul se încarcă normal.
 */
async function safeCount<T>(run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run();
  } catch {
    return [];
  }
}

const toMap = (rows: { tenantId: string; value: number }[]) =>
  new Map(rows.map((r) => [r.tenantId, Number(r.value)]));

export async function loadUsageByTenant(): Promise<Map<string, UsageRow>> {
  const [inv, exp, par, doc, itp] = await Promise.all([
    safeCount(() => db.select({ tenantId: finInvoices.tenantId, value: count() }).from(finInvoices).groupBy(finInvoices.tenantId)).then(toMap),
    safeCount(() => db.select({ tenantId: finExpenses.tenantId, value: count() }).from(finExpenses).groupBy(finExpenses.tenantId)).then(toMap),
    safeCount(() => db.select({ tenantId: parRequests.tenantId, value: count() }).from(parRequests).groupBy(parRequests.tenantId)).then(toMap),
    safeCount(() => db.select({ tenantId: docmergeTemplates.tenantId, value: count() }).from(docmergeTemplates).groupBy(docmergeTemplates.tenantId)).then(toMap),
    safeCount(() => db.select({ tenantId: itparkEngagements.tenantId, value: count() }).from(itparkEngagements).groupBy(itparkEngagements.tenantId)).then(toMap),
  ]);
  const keys = new Set([...inv.keys(), ...exp.keys(), ...par.keys(), ...doc.keys(), ...itp.keys()]);
  const out = new Map<string, UsageRow>();
  for (const k of keys) {
    out.set(k, {
      invoices: inv.get(k) ?? 0,
      expenses: exp.get(k) ?? 0,
      parRequests: par.get(k) ?? 0,
      docmergeTemplates: doc.get(k) ?? 0,
      itparkEngagements: itp.get(k) ?? 0,
    });
  }
  return out;
}

/** Modulul e FOLOSIT dacă workspace-ul are măcar un obiect real în el. */
export function usesModule(usage: UsageRow | undefined, moduleKey: string): boolean {
  if (!usage) return false;
  switch (moduleKey) {
    case "findesk":
      return usage.invoices > 0 || usage.expenses > 0;
    case "par":
      return usage.parRequests > 0;
    case "docmerge":
      return usage.docmergeTemplates > 0;
    case "itpark":
      return usage.itparkEngagements > 0;
    default:
      return false;
  }
}

export function isActivated(usage: UsageRow | undefined): boolean {
  if (!usage) return false;
  return usage.invoices + usage.expenses + usage.parRequests + usage.docmergeTemplates + usage.itparkEngagements > 0;
}

/**
 * Marchează `activated_at` pentru workspace-urile care au făcut deja ceva real, dar la care
 * momentul nu era încă notat (inclusiv cele de dinaintea acestei funcționalități).
 * Idempotent: scrie o singură dată per workspace, doar acolo unde e NULL.
 */
export async function backfillActivation(usage: Map<string, UsageRow>): Promise<number> {
  let marked = 0;
  try {
    const pending = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(isNull(tenants.activatedAt));
    for (const t of pending) {
      if (isActivated(usage.get(t.id))) {
        await db
          .update(tenants)
          .set({ activatedAt: new Date() })
          .where(and(eq(tenants.id, t.id), isNull(tenants.activatedAt)));
        marked++;
      }
    }
  } catch (e) {
    console.warn("[growthSignals] backfill skipped:", e instanceof Error ? e.message : e);
  }
  return marked;
}

/** Emailul de contact al unui workspace = adminul cel mai vechi. Ce folosești la o campanie. */
export async function contactEmailByTenant(): Promise<Map<string, string>> {
  try {
    // Query builder, nu SQL brut: prod e Postgres, local/testele PGlite, iar formele
    // rezultatului diferă (CLAUDE.md §3.5.1). Selecția „cel mai vechi admin" o face JS-ul.
    const rows = await db
      .select({
        tenantId: users.tenantId,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt));
    const out = new Map<string, string>();
    const hasAdmin = new Set<string>();
    // Rândurile vin de la cel mai vechi la cel mai nou. Primul admin al unui workspace
    // câștigă; dacă workspace-ul n-are niciun admin, rămâne primul utilizator creat.
    for (const r of rows) {
      const isAdmin = r.role === "admin";
      if (!out.has(r.tenantId) || (isAdmin && !hasAdmin.has(r.tenantId))) {
        out.set(r.tenantId, r.email);
      }
      if (isAdmin) hasAdmin.add(r.tenantId);
    }
    return out;
  } catch (e) {
    console.warn("[growthSignals] contact emails skipped:", e instanceof Error ? e.message : e);
    return new Map();
  }
}
