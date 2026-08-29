/**
 * PAR-003: Vendor / Payee registry CRUD
 * GET/POST/PATCH/DELETE /api/par/vendors
 * GDPR-sensitive: IDNP + IBAN.
 * Verifică IBAN-ul (ISO 13616, orice țară — plățile pot fi internaționale) și codul fiscal
 * DOAR ca atenționare: scrierea nu e blocată, semnalul ajunge în formular și pe cerere.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, ilike, or } from "drizzle-orm";
import { db } from "../db/client";
import { parVendors } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { validateIban } from "../lib/par/validators";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { zodFieldErrorsHook } from "../lib/zodFieldErrors";
import { splitBankRequisites } from "../lib/par/bankRequisites";
import { normalizePatentDate } from "../../src/lib/par/patent";

export const parVendorsRoutes = new Hono<{ Variables: AuthVariables }>();
parVendorsRoutes.use("*", requireAuth);
parVendorsRoutes.use("/:id", parUuidGuard("id"));

const vendorSchema = z.object({
  name: z.string().min(1).max(300),
  // Cod fiscal: 13 cifre la MD, alt format la beneficiarii străini → lățimea o dă validateFiscalId.
  idnp: z.string().max(50).optional().nullable(),
  iban: z.string().max(34).optional().nullable(),
  bank: z.string().max(300).optional().nullable(),
  bic_swift: z.string().max(32).optional().nullable(),
  vat_code: z.string().max(50).optional().nullable(),
  bank_account: z.string().max(100).optional().nullable(),
  bank_account_currency: z.string().length(3).optional().nullable(),
  legal_address: z.string().max(1000).optional().nullable(),
  contact_name: z.string().max(300).optional().nullable(),
  contact_phone: z.string().max(100).optional().nullable(),
  contact_email: z.string().email().max(255).optional().nullable(),
  administrator_name: z.string().max(300).optional().nullable(),
  /**
   * Patenta de întreprinzător (persoană fizică). Termenul se normalizează la ISO înainte de
   * scriere — un „12.03.2026" tastat de om nu are voie să intre ca text liber, altfel
   * `patentStatus` nu-l poate compara și avertismentul de expirare se stinge tăcut.
   */
  is_patent_holder: z.boolean().optional().nullable(),
  patent_series: z.string().max(50).optional().nullable(),
  patent_valid_until: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});

/**
 * ATENȚIONĂM, NU BLOCĂM (decizie owner, 2026-08-21).
 *
 * Registrul se completează automat din formularul PAR la fiecare trimitere; dacă am respinge aici
 * un IBAN pe care PAR-ul l-a acceptat, beneficiarul pur și simplu n-ar mai fi salvat — o eșuare
 * tăcută, cel mai prost rezultat posibil. Semnalăm în log și lăsăm datele să intre; formularul și
 * pagina cererii afișează avertismentul acolo unde un om îl poate corecta.
 */
function warnOnVendorFields(body: { idnp?: string | null; iban?: string | null }): void {
  if (body.iban) {
    const check = validateIban(body.iban);
    if (!check.ok) {
      console.warn(`[par-vendors] IBAN neverificat (${check.reason}) — salvat oricum`);
    }
  }
}

/** Câmpurile pe care le poate produce separarea rândului de rechizite. */
type SplittableVendorFields = {
  bank?: string | null;
  bic_swift?: string | null;
  vat_code?: string | null;
  idnp?: string | null;
  iban?: string | null;
};

/**
 * Desparte rechizitele lipite în câmpul „Bancă" înainte de scriere.
 *
 * Pe documentele MD banca, codul bancar, codul fiscal și nr. TVA se tipăresc pe un singur rând,
 * iar textul ajungea întreg în `bank` — contabila nu putea citi niciun cod separat. Aici îl
 * despicăm o singură dată, la intrarea în registru, indiferent de sursă (formular, lipit manual,
 * prefill AI, auto-salvare din cerere).
 *
 * ENRICH, NU CLOBBER: un cod extras completează doar un câmp gol. Dacă utilizatorul a scris
 * explicit un IBAN sau un cod fiscal — sau dacă rândul salvat îl are deja (`current`, la PATCH) —
 * valoarea aceea rămâne. Extragerea dintr-un text lipit nu are voie să rescrie un cod curat:
 * schimbarea unui IBAN redirecționează bani.
 */
export function splitVendorBankField<T extends SplittableVendorFields>(
  body: T,
  current?: { idnp?: string | null; bicSwift?: string | null; vatCode?: string | null; iban?: string | null } | null
): T {
  if (!body.bank) return body;
  const parts = splitBankRequisites(body.bank);
  // Nimic de separat → lăsăm obiectul exact cum a venit (idempotent pe rânduri deja curate).
  if (!parts.bankCode && !parts.fiscalCode && !parts.vatCode && !parts.iban) return body;
  const keep = (fromBody: string | null | undefined, stored: string | null | undefined, derived: string | null) =>
    fromBody || stored || derived;
  return {
    ...body,
    bank: parts.bank,
    bic_swift: keep(body.bic_swift, current?.bicSwift, parts.bankCode),
    vat_code: keep(body.vat_code, current?.vatCode, parts.vatCode),
    idnp: keep(body.idnp, current?.idnp, parts.fiscalCode),
    iban: keep(body.iban, current?.iban, parts.iban),
  };
}

/** GET — list all active vendors */
// PARQA-005 (GDPR): the vendor registry exposes IDNP (13-digit national ID) + IBAN. Reading it
// requires a PAR role too — a tenant user with NO PAR role (e.g. an invited "teacher" account)
// must not be able to enumerate beneficiary bank data. (Matches the write routes below.)
parVendorsRoutes.get("/", requirePARRole("requestor", "approver", "finance", "par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = c.req.query("q")?.trim();
  const conditions = [eq(parVendors.tenantId, tenantId), eq(parVendors.active, true)];
  if (q) {
    const match = or(ilike(parVendors.name, `%${q}%`), ilike(parVendors.idnp, `%${q}%`), ilike(parVendors.iban, `%${q}%`));
    if (match) conditions.push(match);
  }
  const rows = await db
    .select()
    .from(parVendors)
    .where(and(...conditions))
    .orderBy(asc(parVendors.name));
  return c.json({ vendors: rows });
});

/** POST */
parVendorsRoutes.post(
  "/",
  // PARQA-005 (GDPR): the vendor registry holds IDNP + IBAN. Writing requires a PAR role — a
  // requestor legitimately adds a payee inline while creating a PAR, so all four roles are allowed,
  // but a tenant user with NO PAR role (e.g. an invited "teacher" account) cannot write bank data.
  requirePARRole("requestor", "approver", "finance", "par_admin"),
  zValidator("json", vendorSchema, zodFieldErrorsHook),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = splitVendorBankField(c.req.valid("json"));

    warnOnVendorFields(body);

    // VM1-05: dedup by IBAN (normalized) so saving the same beneficiary repeatedly — whether typed
    // manually or filled by AI — links to the existing registry entry instead of creating duplicates.
    // Backfill any fields the existing record was missing. Returns 200 (existing) vs 201 (created).
    const normIban = body.iban ? body.iban.replace(/\s/g, "").toUpperCase() : null;
    if (normIban) {
      const existing = await db
        .select()
        .from(parVendors)
        .where(and(eq(parVendors.tenantId, tenantId), eq(parVendors.iban, normIban)))
        .limit(1);
      if (existing[0]) {
        const e = existing[0];
        const patch: Record<string, unknown> = {};
        if (!e.idnp && body.idnp) patch.idnp = body.idnp;
        if (!e.bank && body.bank) patch.bank = body.bank;
        if (!e.bicSwift && body.bic_swift) patch.bicSwift = body.bic_swift;
        if (!e.vatCode && body.vat_code) patch.vatCode = body.vat_code;
        if (!e.bankAccount && body.bank_account) patch.bankAccount = body.bank_account;
        if (!e.bankAccountCurrency && body.bank_account_currency) patch.bankAccountCurrency = body.bank_account_currency;
        if (!e.legalAddress && body.legal_address) patch.legalAddress = body.legal_address;
        if (!e.contactName && body.contact_name) patch.contactName = body.contact_name;
        if (!e.contactPhone && body.contact_phone) patch.contactPhone = body.contact_phone;
        if (!e.contactEmail && body.contact_email) patch.contactEmail = body.contact_email;
        if (!e.administratorName && body.administrator_name) patch.administratorName = body.administrator_name;
        // Patenta se ACTUALIZEAZĂ, nu se „completează doar dacă lipsește": un termen nou e
        // exact motivul pentru care beneficiarul e salvat din nou (patenta se prelungește lunar).
        if (body.is_patent_holder != null) patch.isPatentHolder = body.is_patent_holder;
        if (body.patent_series) patch.patentSeries = body.patent_series;
        if (normalizePatentDate(body.patent_valid_until)) patch.patentValidUntil = normalizePatentDate(body.patent_valid_until);
        if (!e.active) patch.active = true;
        if (Object.keys(patch).length) {
          const [updated] = await db
            .update(parVendors)
            .set({ ...patch, updatedAt: new Date() })
            .where(and(eq(parVendors.id, e.id), eq(parVendors.tenantId, tenantId)))
            .returning();
          return c.json(updated, 200);
        }
        return c.json(e, 200);
      }
    }

    const [row] = await db
      .insert(parVendors)
      .values({
        tenantId,
        name: body.name,
        idnp: body.idnp ?? null,
        iban: normIban,
        bank: body.bank ?? null,
        bicSwift: body.bic_swift ?? null,
        vatCode: body.vat_code ?? null,
        bankAccount: body.bank_account ?? null,
        bankAccountCurrency: body.bank_account_currency ?? null,
        legalAddress: body.legal_address ?? null,
        contactName: body.contact_name ?? null,
        contactPhone: body.contact_phone ?? null,
        contactEmail: body.contact_email ?? null,
        administratorName: body.administrator_name ?? null,
        isPatentHolder: body.is_patent_holder ?? false,
        patentSeries: body.patent_series ?? null,
        patentValidUntil: normalizePatentDate(body.patent_valid_until),
        notes: body.notes ?? null,
      })
      .returning();
    return c.json(row, 201);
  }
);

/** PATCH /:id */
parVendorsRoutes.patch(
  "/:id",
  // PARQA-005 (GDPR/fraud): editing an existing beneficiary's bank details (IBAN/IDNP) is the sharp
  // risk — changing an IBAN redirects money. Restrict to par_admin (matches DELETE). Only the admin
  // Vendors UI calls this; the requestor create flow always POSTs (dedup backfills, never PATCHes).
  requirePARRole("par_admin"),
  zValidator("json", vendorSchema.partial(), zodFieldErrorsHook),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    // Citim rândul înainte de separare: codurile deja salvate au prioritate față de cele deduse
    // dintr-un text lipit în câmpul „Bancă" (vezi splitVendorBankField).
    const [current] = await db
      .select()
      .from(parVendors)
      .where(and(eq(parVendors.id, id), eq(parVendors.tenantId, tenantId)));
    if (!current) return c.json({ error: "not_found" }, 404);
    const body = splitVendorBankField(c.req.valid("json"), current);

    warnOnVendorFields(body);

    const update = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.idnp !== undefined ? { idnp: body.idnp } : {}),
      ...(body.iban !== undefined ? { iban: body.iban?.replace(/\s/g, "").toUpperCase() ?? null } : {}),
      ...(body.bank !== undefined ? { bank: body.bank } : {}),
      ...(body.bic_swift !== undefined ? { bicSwift: body.bic_swift } : {}),
      ...(body.vat_code !== undefined ? { vatCode: body.vat_code } : {}),
      ...(body.bank_account !== undefined ? { bankAccount: body.bank_account } : {}),
      ...(body.bank_account_currency !== undefined ? { bankAccountCurrency: body.bank_account_currency } : {}),
      ...(body.legal_address !== undefined ? { legalAddress: body.legal_address } : {}),
      ...(body.contact_name !== undefined ? { contactName: body.contact_name } : {}),
      ...(body.contact_phone !== undefined ? { contactPhone: body.contact_phone } : {}),
      ...(body.contact_email !== undefined ? { contactEmail: body.contact_email } : {}),
      ...(body.administrator_name !== undefined ? { administratorName: body.administrator_name } : {}),
      ...(body.is_patent_holder !== undefined ? { isPatentHolder: body.is_patent_holder ?? false } : {}),
      ...(body.patent_series !== undefined ? { patentSeries: body.patent_series } : {}),
      ...(body.patent_valid_until !== undefined ? { patentValidUntil: normalizePatentDate(body.patent_valid_until) } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      updatedAt: new Date(),
    };
    const [row] = await db
      .update(parVendors)
      .set(update)
      .where(and(eq(parVendors.id, id), eq(parVendors.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

/**
 * POST /actions/normalize — repară rândurile salvate ÎNAINTE de separare.
 *
 * Beneficiarii introduși până acum au banca, codul bancar, codul fiscal și nr. TVA îngrămădite
 * în coloana „Bancă". Separarea la scriere (mai sus) curăță doar ce se salvează de-acum încolo;
 * istoricul rămâne murdar până e trecut o dată prin același separator. Endpoint-ul face exact
 * asta, pentru tenantul curent, și e sigur de rulat de oricâte ori: pe un rând deja curat
 * `splitBankRequisites` nu găsește niciun cod și rândul e sărit.
 *
 * Calea are DOUĂ segmente intenționat: `use("/:id", parUuidGuard)` prinde doar căile de un
 * segment, deci `/actions/normalize` nu e confundată cu un id de beneficiar.
 */
parVendorsRoutes.post("/actions/normalize", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db.select().from(parVendors).where(eq(parVendors.tenantId, tenantId));

  let updated = 0;
  for (const row of rows) {
    const parts = splitBankRequisites(row.bank);
    if (!parts.bankCode && !parts.fiscalCode && !parts.vatCode && !parts.iban) continue;
    // Enrich, nu clobber: doar câmpurile goale se completează; banca se scurtează la numele ei.
    const patch: Record<string, unknown> = { bank: parts.bank };
    if (!row.bicSwift && parts.bankCode) patch.bicSwift = parts.bankCode;
    if (!row.vatCode && parts.vatCode) patch.vatCode = parts.vatCode;
    if (!row.idnp && parts.fiscalCode) patch.idnp = parts.fiscalCode;
    if (!row.iban && parts.iban) patch.iban = parts.iban;
    await db
      .update(parVendors)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(parVendors.id, row.id), eq(parVendors.tenantId, tenantId)));
    updated++;
  }
  return c.json({ ok: true, scanned: rows.length, updated });
});

/** DELETE /:id — soft delete */
parVendorsRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .update(parVendors)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(parVendors.id, id), eq(parVendors.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
