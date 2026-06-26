/**
 * PAR-FIN-002: shared "find-or-create FinDesk supplier party" helper.
 *
 * Unifies the partner registry across modules: a PAR beneficiary (par_vendors) and
 * a FinDesk supplier (fin_parties) should be the SAME company, matched by IDNO. Used
 * by the PAR→invoice bridge and by the PAR vendor registry so a beneficiary saved in
 * one place is visible in the other.
 *
 * Matching: by IDNO when present (the stable company id); else by exact name within
 * the tenant. Never throws on a soft mismatch — returns the resolved party id.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { finParties } from "../../db/schema/finParties";

/** FinDesk party validators (must match server/routes/finParties.ts or the insert is rejected). */
const IDNO_RE = /^[A-Z0-9]{1,13}$/i;
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/;

export interface SyncSupplierInput {
  tenantId: string;
  name: string;
  idnp?: string | null;
  iban?: string | null;
}

/**
 * Find-or-create a `fin_parties` row (kind=supplier) for a PAR beneficiary.
 * Returns the party id, or null if there's not enough to create one (no name).
 * Backfills a missing IBAN on an existing party but never overwrites existing data.
 */
export async function syncSupplierParty(input: SyncSupplierInput): Promise<string | null> {
  const name = input.name?.trim();
  if (!name) return null;

  const idno = input.idnp && IDNO_RE.test(input.idnp) ? input.idnp : null;
  const iban = input.iban && IBAN_RE.test(input.iban) ? input.iban : null;

  // 1) Match by IDNO (preferred — stable company identifier).
  if (idno) {
    const [byIdno] = await db
      .select({ id: finParties.id, iban: finParties.iban })
      .from(finParties)
      .where(and(eq(finParties.tenantId, input.tenantId), eq(finParties.idno, idno)))
      .limit(1);
    if (byIdno) {
      if (iban && !byIdno.iban) {
        await db.update(finParties).set({ iban, updatedAt: new Date() }).where(eq(finParties.id, byIdno.id));
      }
      return byIdno.id;
    }
  } else {
    // 2) No IDNO → match by exact name to avoid creating duplicates of the same supplier.
    const [byName] = await db
      .select({ id: finParties.id })
      .from(finParties)
      .where(and(eq(finParties.tenantId, input.tenantId), eq(finParties.name, name.slice(0, 500))))
      .limit(1);
    if (byName) return byName.id;
  }

  // 3) Create.
  const [created] = await db
    .insert(finParties)
    .values({
      tenantId: input.tenantId,
      kind: "supplier",
      name: name.slice(0, 500),
      idno,
      iban,
      isActive: true,
    })
    .returning({ id: finParties.id });
  return created.id;
}
