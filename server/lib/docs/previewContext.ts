/**
 * DG-107 — contextul pentru previzualizarea unui șablon.
 *
 * Previzualizarea cu date inventate arată frumos și minte: abia cu un furnizor REAL se vede că
 * IBAN-ul depășește rândul, că denumirea juridică e de trei ori mai lungă decât în exemplu, sau că
 * un câmp lipsește cu totul din fișa furnizorului. De aceea preview-ul acceptă un `vendorId`.
 *
 * DG-108 va generaliza asta într-un rezolver folosit și la generarea actelor; aici e forma minimă
 * de care are nevoie previzualizarea.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { parVendors } from "../../db/schema/par";
import { resolveDocumentContext } from "./fieldResolver";

/** Valorile de exemplu, când nu s-a ales niciun furnizor. Ținute scurt, dar realiste pentru MD. */
const SAMPLE: Record<string, string> = {
  "noi.denumire": "Asociația Națională ATIC",
  "noi.idno": "1010620000000",
  "noi.adresa": "mun. Chișinău, str. Ștefan cel Mare 1",
  "noi.iban": "MD24AG000225100013104168",
  "noi.banca": "BC Moldova-Agroindbank SA",
  "noi.administrator": "Irina Oriol",
  "contraparte.denumire": 'SRL "Tehnica Nouă"',
  "contraparte.idno": "1234567890123",
  "contraparte.iban": "MD48ML000002259A19498121",
  "contraparte.banca": "BC Moldindconbank SA",
  "contraparte.bic": "MOLDMD2X309",
  "contraparte.adresa": "mun. Chișinău, bd. Dacia 45",
  "contraparte.administrator": "Andrei Rusu",
  "contraparte.cod_tva": "0301234",
  "proiect.nume": "Digital Skills 2026",
  "proiect.donator": "USAID",
  "eveniment.nume": "Atelier Chișinău, martie",
  "document.numar": "ACT-2026-0007",
  "document.data": new Date().toLocaleDateString("ro-MD"),
  "document.loc": "mun. Chișinău",
  "document.baza": "contractul nr. 14 din 02.02.2026",
  "total.suma": "24 500,00",
  "total.valuta": "MDL",
  "total.in_litere": "douăzeci și patru de mii cinci sute lei 00 bani",
  "utilizator.nume": "Ana Contabil",
  "utilizator.functie": "Contabil-șef",
};

export interface PreviewContextOptions {
  tenantId: string;
  vendorId?: string | null;
  userName?: string | null;
}

/**
 * Construiește contextul de previzualizare: exemple peste tot, dar suprascrise cu datele REALE ale
 * organizației și, dacă e cerut, ale furnizorului ales. Un câmp pe care furnizorul nu-l are rămâne
 * marcat vizibil, ca lipsa să se vadă ÎNAINTE de a trimite actul la semnat.
 */
export async function buildPreviewContext(
  opts: PreviewContextOptions
): Promise<Record<string, string>> {
  // Exemplele sunt doar plasa de siguranță: peste ele vine ADEVĂRUL din registre, prin același
  // rezolver folosit la generarea actelor (DG-108). Două implementări ar diverge, iar
  // previzualizarea ar minți exact acolo unde omul se bazează pe ea.
  const resolved = await resolveDocumentContext({
    tenantId: opts.tenantId,
    vendorId: opts.vendorId,
    totalCents: 2450000,
    currency: "MDL",
    userName: opts.userName,
  });
  const ctx: Record<string, string> = { ...SAMPLE, ...resolved };

  // Ce lipsește din fișa furnizorului se SCRIE ca lipsă, nu se acoperă cu exemplul — altfel
  // previzualizarea ar arăta un act complet, iar cel real ar pleca cu goluri.
  if (opts.vendorId) {
    const [v] = await db
      .select()
      .from(parVendors)
      .where(and(eq(parVendors.id, opts.vendorId), eq(parVendors.tenantId, opts.tenantId)));
    if (v) {
      const missing = (label: string) => `— ${label} lipsește din fișa furnizorului —`;
      if (!v.iban) ctx["contraparte.iban"] = missing("IBAN-ul");
      if (!v.idnp) ctx["contraparte.idno"] = missing("codul fiscal");
      if (!v.bank) ctx["contraparte.banca"] = missing("banca");
      if (!v.bicSwift) ctx["contraparte.bic"] = missing("codul bancar");
      if (!v.legalAddress) ctx["contraparte.adresa"] = missing("adresa juridică");
      if (!v.administratorName) ctx["contraparte.administrator"] = missing("administratorul");
    }
  }

  return ctx;
}
