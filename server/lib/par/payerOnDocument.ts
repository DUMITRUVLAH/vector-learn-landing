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
 * ── Ce s-a schimbat pe 16.09.2026 (măsurat pe producție) ──────────────────────────────────────
 *
 * Verificarea asta a devenit singura cea mai mare sursă de alarme false: 17 din cele 59 de
 * „neconcordanțe" ale ultimelor 10 zile. Două cauze, amândouă reparate aici:
 *
 *  1. **Entitatea plătitoare n-avea pe ce fi recunoscută.** La clientul ATIC, `par_payers` avea
 *     `name` = `legal_name` = „ATIC", fără IDNO și fără IBAN, în timp ce actele poartă denumirea
 *     juridică întreagă. Acum comparația folosește aliasurile declarate pe organizație
 *     (`sameParty`), iar dacă organizația n-are NICIUN identificator utilizabil, verificarea
 *     spune cinstit „neverificat" în loc să inventeze o nepotrivire.
 *
 *  2. **Se raporta o parte la întâmplare.** Când documentul n-avea latură plătitoare, funcția
 *     întorcea `others[0].name` — așa a ajuns să scrie „plătitorul e Mariana Alexei" pe o listă de
 *     participanți la workshop și „plătitorul e Mailchimp" pe o chitanță de card. Garda
 *     `parties.length < 2` nu prindea documentele pline de oameni care nu sunt părți contractante.
 *     Acum întrebarea se pune doar pe tipurile de document care CHIAR au un emitent și un
 *     destinatar (`carriesPayerSide`).
 *
 * Regula rămâne construită să NU producă alarme false — ele sunt mai scumpe decât lipsa
 * verificării, pentru că omul învață să dea click pe „aprob" fără să citească.
 */
import { partyAliases, sameParty } from "./sameParty";

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
  /** Acronimul și celelalte denumiri de pe documente (`par_payers.aliases`). */
  aliases?: string | null;
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
 *
 * `carriesPayerSide` spune dacă TIPUL documentului are în general un emitent și un destinatar. Pe
 * `false` (o chitanță de card, un pontaj, o listă de participanți) întrebarea nu se pune deloc.
 */
export function checkPayerOnDocument(
  parties: readonly DocumentParty[],
  payer: PayerIdentity | null,
  beneficiary: { name?: string | null; idno?: string | null } | null | undefined,
  options: { carriesPayerSide?: boolean } = {}
): PayerOnDocument {
  if (options.carriesPayerSide === false) return { matches: null, found: null };

  const aliases = partyAliases(payer);
  const payerIdno = digits(payer?.idno);
  const payerIban = compact(payer?.iban);
  if (!aliases.length && !payerIdno && !payerIban) return { matches: null, found: null };

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
      aliases.some((alias) => sameParty(p.name, alias, { aliases }) === true)
  );
  if (hit) return { matches: true, found: hit.name };

  // Fără identificator tare (IDNO/IBAN) pe entitatea noastră, „nu l-am găsit după nume" nu e o
  // dovadă că documentul e emis pe altcineva: poate fi doar o denumire pe care n-o cunoaștem.
  // Diferența dintre „plătitorul e altul" și „n-am putut verifica" se decide pe identificator.
  if (!payerIdno && !payerIban) return { matches: null, found: null };

  // „Plătitorul e altul" e o ACUZAȚIE — cere dovadă, nu doar absența noastră. Dovada e o parte care
  // poartă un identificator fiscal: o entitate reală, nu un nume citit de pe pagină.
  //
  // Fără condiția asta (măsurat pe producție, 16.09.2026, după ce organizația a primit IDNO),
  // verificarea începea să acuze pe documente unde nu are ce căuta: „plătitorul e Mariana Alexei"
  // pe o listă de participanți încărcată cu tipul greșit, „plătitorul e ANA BALAMATU" pe o factură
  // fotografiată, „plătitorul e Ana Chirita" pe un dosar scanat. Completarea corectă a datelor
  // organizației făcea rezultatul MAI prost — semn sigur că regula, nu datele, era greșită.
  const named = others.find((p) => digits(p.idno).length >= 8 || compact(p.iban).length >= 15);
  if (!named) return { matches: null, found: null };
  return { matches: false, found: named.name };
}
