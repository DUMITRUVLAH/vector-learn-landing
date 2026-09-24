/**
 * Persoană juridică sau fizică — pentru un beneficiar din registru.
 *
 * De ce există: pe producție coloana `par_vendors.kind` a fost adăugată de heal-ul generic din
 * `sync-schema.ts` FĂRĂ default, iar două căi de inserare (plata înregistrată și adăugarea din
 * administrare) nu o completau. Drizzle lasă default-ul pe seama bazei, deci rândul primea NULL:
 * 17 beneficiari (NEWS MAKER SRL, Vector Academy SRL…) apăreau „Persoană fizică" în fișa lor, iar
 * semnalul „compania e inactivă în registrul de stat" nu se mai declanșa pentru ei.
 *
 * Ordinea dovezilor: tipul ales pe cerere > codul fiscal (IDNO-ul unei persoane juridice începe cu
 * 1, IDNP-ul unei persoane fizice cu 0 sau 2) > cuvintele din denumire (SRL, SA, AO…).
 */
import { detectPayeeType } from "./payeeTypeDetectorServer";

export type VendorKind = "company" | "individual";

export function vendorKindFor(input: {
  payeeType?: string | null;
  idnp?: string | null;
  name?: string | null;
}): VendorKind {
  if (input.payeeType === "juridic") return "company";
  if (input.payeeType === "fizic") return "individual";
  const code = (input.idnp ?? "").replace(/\s/g, "");
  if (/^1\d{12}$/.test(code)) return "company";
  if (/^[02]\d{12}$/.test(code)) return "individual";
  return detectPayeeType(input.name ?? "") === "juridic" ? "company" : "individual";
}
