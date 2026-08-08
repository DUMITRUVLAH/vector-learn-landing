/**
 * Auto-save the payee of a submitted PAR into the vendor registry.
 *
 * Nobody should have to remember to press "save beneficiary". Every request that
 * reaches submit has a real, reviewed payee on it — that IS the registry. Doing this
 * on the server (not in the form) means it also covers requests created from a
 * template, from an AI document prefill, or by any future client.
 *
 * Rules that keep this from creating a mess:
 *  · Only on submit. A draft's payee is half-typed by definition.
 *  · Match an existing vendor before inserting — IBAN first (it identifies a bank
 *    account exactly), then IDNP/IDNO, then the normalised name. Otherwise every
 *    repeat payment would mint a near-duplicate row.
 *  · Enrich, never clobber: a match fills in fields it is MISSING, and leaves the
 *    ones a human already curated alone.
 *  · Best-effort. This is bookkeeping convenience — it must never fail a submit.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { parRequests, parVendors } from "../../db/schema/par";

// ─── VM1-05 pure helpers ──────────────────────────────────────────────────────
// No DB, so the dedup + normalization logic stays unit-testable on its own
// (server/lib/par/__tests__/vendorAutoSave.test.ts).

/** Normalize an IBAN for comparison: strip all whitespace, uppercase. */
export function normIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Find an existing vendor whose IBAN matches `iban` (ignoring spaces/case).
 * Returns the matching vendor or undefined. Vendors without an IBAN are ignored.
 */
export function findVendorByIban<T extends { iban?: string | null }>(
  vendors: readonly T[],
  iban: string
): T | undefined {
  const target = normIban(iban);
  if (!target) return undefined;
  return vendors.find((v) => !!v.iban && normIban(v.iban) === target);
}

/**
 * Whether a paid PAR's payee should be remembered in the registry.
 * Only inline payees (no vendorId) that carry an IBAN are worth saving —
 * the IBAN is the thing reused next time.
 */
export function shouldAutoSaveVendor(par: {
  vendorId?: string | null;
  payeeIban?: string | null;
}): boolean {
  return !par.vendorId && !!par.payeeIban && par.payeeIban.trim().length > 0;
}

/** Collapse case/whitespace and drop the punctuation legal names disagree about. */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("ro")
    .replace(/["'„”«»]/g, "")
    .replace(/\s+/g, " ");
}

/** Alias kept so the DB-backed code below reads in its own terms. */
const normalizeIban = normIban;

export interface VendorAutosaveResult {
  /** "created" | "updated" | "matched" (nothing to add) | "skipped" (not enough data) */
  outcome: "created" | "updated" | "matched" | "skipped";
  vendorId: string | null;
}

/**
 * Ensure the PAR's inline payee exists as a vendor, and link the PAR to it.
 * Never throws — callers treat failure as "no autosave happened".
 */
export async function autosaveVendorFromPar(
  parId: string,
  tenantId: string
): Promise<VendorAutosaveResult> {
  try {
    const [par] = await db
      .select({
        vendorId: parRequests.vendorId,
        payeeName: parRequests.payeeName,
        payeeIdnp: parRequests.payeeIdnp,
        payeeIban: parRequests.payeeIban,
        payeeBank: parRequests.payeeBank,
        payeeType: parRequests.payeeType,
      })
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

    if (!par) return { outcome: "skipped", vendorId: null };

    const name = (par.payeeName ?? "").trim();
    const iban = par.payeeIban ? normalizeIban(par.payeeIban) : "";
    const idnp = (par.payeeIdnp ?? "").trim();
    const bank = (par.payeeBank ?? "").trim();
    // A nameless payee is not a registry entry — there'd be nothing to search for later.
    if (!name) return { outcome: "skipped", vendorId: par.vendorId ?? null };

    // Already linked to a saved vendor → top up whatever that record is missing.
    if (par.vendorId) {
      const updated = await enrichVendor(par.vendorId, tenantId, { iban, idnp, bank });
      return { outcome: updated ? "updated" : "matched", vendorId: par.vendorId };
    }

    // Find an existing vendor for this payee, cheapest-signal-first.
    const candidates = await db
      .select({
        id: parVendors.id,
        name: parVendors.name,
        iban: parVendors.iban,
        idnp: parVendors.idnp,
      })
      .from(parVendors)
      .where(eq(parVendors.tenantId, tenantId));

    const wantedName = normalizeName(name);
    const match =
      (iban ? candidates.find((v) => v.iban && normalizeIban(v.iban) === iban) : undefined) ??
      (idnp ? candidates.find((v) => v.idnp && v.idnp.trim() === idnp) : undefined) ??
      candidates.find((v) => normalizeName(v.name) === wantedName);

    if (match) {
      const updated = await enrichVendor(match.id, tenantId, { iban, idnp, bank });
      await linkVendor(parId, tenantId, match.id);
      return { outcome: updated ? "updated" : "matched", vendorId: match.id };
    }

    const [created] = await db
      .insert(parVendors)
      .values({
        tenantId,
        name,
        idnp: idnp || null,
        iban: iban || null,
        bank: bank || null,
        // par_requests stores "fizic"/"juridic"; par_vendors speaks individual/company.
        kind: par.payeeType === "fizic" ? "individual" : "company",
        active: true,
      })
      .returning({ id: parVendors.id });

    if (!created) return { outcome: "skipped", vendorId: null };
    await linkVendor(parId, tenantId, created.id);
    return { outcome: "created", vendorId: created.id };
  } catch {
    // Bookkeeping convenience must never break a submit.
    return { outcome: "skipped", vendorId: null };
  }
}

/** Fill only the fields the vendor record is missing. Returns true if anything changed. */
async function enrichVendor(
  vendorId: string,
  tenantId: string,
  incoming: { iban: string; idnp: string; bank: string }
): Promise<boolean> {
  const patch: Record<string, string | Date> = {};
  if (incoming.iban) {
    const [row] = await db
      .select({ iban: parVendors.iban, idnp: parVendors.idnp, bank: parVendors.bank })
      .from(parVendors)
      .where(and(eq(parVendors.id, vendorId), eq(parVendors.tenantId, tenantId)));
    if (!row) return false;
    if (!row.iban) patch.iban = incoming.iban;
    if (!row.idnp && incoming.idnp) patch.idnp = incoming.idnp;
    if (!row.bank && incoming.bank) patch.bank = incoming.bank;
  } else {
    const [row] = await db
      .select({ idnp: parVendors.idnp, bank: parVendors.bank })
      .from(parVendors)
      .where(and(eq(parVendors.id, vendorId), eq(parVendors.tenantId, tenantId)));
    if (!row) return false;
    if (!row.idnp && incoming.idnp) patch.idnp = incoming.idnp;
    if (!row.bank && incoming.bank) patch.bank = incoming.bank;
  }
  if (Object.keys(patch).length === 0) return false;
  patch.updatedAt = new Date();
  await db
    .update(parVendors)
    .set(patch)
    .where(and(eq(parVendors.id, vendorId), eq(parVendors.tenantId, tenantId)));
  return true;
}

/** Point the PAR at the vendor it turned out to be, so later reads resolve one record. */
async function linkVendor(parId: string, tenantId: string, vendorId: string): Promise<void> {
  await db
    .update(parRequests)
    .set({ vendorId, updatedAt: new Date() })
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
}

/**
 * One-off backfill: register every payee that has already been used on a submitted PAR.
 * Exposed so the tenant's history is not stranded behind the day this feature shipped.
 */
export async function backfillVendorsFromPars(tenantId: string): Promise<{ processed: number; created: number }> {
  const rows = await db
    .select({ id: parRequests.id })
    .from(parRequests)
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        isNotNull(parRequests.payeeName),
        sql`${parRequests.status} <> 'draft'`
      )
    );

  let created = 0;
  for (const r of rows) {
    const res = await autosaveVendorFromPar(r.id, tenantId);
    if (res.outcome === "created") created += 1;
  }
  return { processed: rows.length, created };
}
