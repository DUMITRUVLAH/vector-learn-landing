/**
 * VM5-04: „plătitorul e altul" — documentul atașat e emis pe entitatea care plătește?
 *
 * Cerința din ședința de prezentare, cuvânt cu cuvânt: „poate fi integrat ca AI să verifice dacă ce
 * e atașat corespunde cu destinația plății. De exemplu a fost indicat un alt contract sau suma nu
 * corespunde contractului, sau **de exemplu plătitorul e altul**".
 *
 * Reconcilierea existentă verifica doar CĂTRE cine se plătește (beneficiar, IDNO, IBAN, bancă,
 * sumă, valută). Cine plătește nu era verificat niciodată — deci o factură emisă pe altă entitate
 * a workspace-ului (sau pe o firmă din afara lui) trecea fără o vorbă. Într-un workspace cu două
 * entități, exact asta se întâmplă des: omul atașează factura firmei-soră.
 *
 * Regula, construită să NU producă alarme false — ele sunt mai scumpe decât lipsa verificării,
 * pentru că omul învață să dea click pe „aprob" fără să citească:
 *
 *   - fără o entitate plătitoare cu identificator (IDNO / denumire) → `null` (neverificat);
 *   - dacă documentul numește O SINGURĂ parte, nu are „latura plătitoare" de verificat → `null`
 *     (o factură simplă poate lista doar furnizorul);
 *   - dacă vreo parte se potrivește cu entitatea noastră (IDNO exact, IBAN exact sau denumire
 *     fuzzy, care taie „SRL", punctuația și diacriticele) → potrivire;
 *   - altfel → NEPOTRIVIRE, cu numele găsit pe document, ca omul să vadă pe cine e emis.
 */
import { fuzzyOrgMatchAny } from "./choosePayee";

/**
 * Minimul de care are nevoie verificarea. Structural, nu nominal: primește la fel de bine părțile
 * brute din extractor (`ParExtractedParty`) și candidații deja normalizați (`PayeeCandidate`) —
 * apelantul trimite ce are la îndemână, fără conversii.
 */
export interface DocumentParty {
  name: string;
  idno?: string | null;
  iban?: string | null;
}

export interface PayerIdentity {
  name: string | null;
  legalName: string | null;
  idno: string | null;
  iban: string | null;
}

export interface PayerOnDocument {
  /** true = documentul numește entitatea noastră; false = numește altcuiva; null = nu se poate ști. */
  matches: boolean | null;
  /** Ce s-a găsit pe document pentru latura plătitoare (numele altei entități, la nepotrivire). */
  found: string | null;
}

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const compact = (v: string | null | undefined) => (v ?? "").replace(/\s/g, "").toLocaleUpperCase("ro");

/**
 * Partea plătitoare de pe document vs entitatea plătitoare a cererii.
 *
 * `beneficiary` e partea deja identificată drept beneficiar al cererii — ea nu poate fi și
 * plătitorul, deci se scoate din căutare (altfel un document cu două părți ar „confirma" plătitorul
 * folosind chiar beneficiarul).
 */
export function checkPayerOnDocument(
  parties: readonly DocumentParty[],
  payer: PayerIdentity | null,
  beneficiary: { name?: string | null; idno?: string | null } | null | undefined
): PayerOnDocument {
  const names = [payer?.name, payer?.legalName].filter((v): v is string => !!v && v.trim().length > 0);
  const payerIdno = digits(payer?.idno);
  const payerIban = compact(payer?.iban);
  if (!names.length && !payerIdno && !payerIban) return { matches: null, found: null };

  const others = parties.filter((p) => {
    if (!p?.name) return false;
    if (beneficiary?.idno && p.idno && digits(p.idno) === digits(beneficiary.idno)) return false;
    if (beneficiary?.name && !beneficiary.idno && compact(p.name) === compact(beneficiary.name)) return false;
    return true;
  });
  // O singură parte pe document = nu există latură plătitoare de verificat.
  if (parties.length < 2 || others.length === 0) return { matches: null, found: null };

  const hit = others.find(
    (p) =>
      (payerIdno && p.idno && digits(p.idno) === payerIdno) ||
      (payerIban && p.iban && compact(p.iban) === payerIban) ||
      (names.length > 0 && fuzzyOrgMatchAny(p.name, names))
  );
  if (hit) return { matches: true, found: hit.name };

  return { matches: false, found: others[0]?.name ?? null };
}
