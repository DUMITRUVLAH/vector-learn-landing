/**
 * Ce are sens să compari, în funcție de CE fel de document e atașat.
 *
 * De ce există (verificat pe producție, 10.09.2026): din 23 de atașamente analizate, 17 raportau
 * cel puțin o „nepotrivire", iar 16 dintre ele erau pe câmpul „sumă". Nouă erau pe CONTRACTE —
 * unde totalul contractului (un an de servicii, un plafon-cadru) nu are cum să fie egal cu plata
 * unei singure luni. Restul erau pe documente care nu conțin nicio sumă de plată: un buletin
 * scanat, un export de audit, un fișier de test.
 *
 * Un avertisment care sare pe trei sferturi din cereri nu mai e citit de nimeni — mai ales de când
 * aprobarea unei cereri cu nepotriviri cere o confirmare (VM5-05). Deci suma se compară DOAR pe
 * documentele care declară chiar suma de plătit.
 *
 * A doua măsurătoare (16.09.2026, 40 de analize v2): tot 78% din documente purtau un avertisment,
 * dar de data asta pe „plătitor" și „beneficiar". Cauzele erau în comparator, nu în ce se compară —
 * diacritice, ordinea numelui, forma juridică, banca scrisă altfel, acronimul organizației. Ele
 * sunt reparate în `sameParty.ts`; aici a rămas ce ține de TIPUL documentului.
 *
 * Versiunea analizei: verdictele salvate de versiuni mai vechi ale extractorului sunt încă în
 * bază, iar unele sunt vizibil greșite (numărul facturii „EBK000758854" citit ca sumă). Ele rămân
 * afișate ca informație, dar nu au voie să blocheze o aprobare — de aceea fiecare analiză nouă e
 * ștampilată cu `ANALYSIS_VERSION`, iar interfața ia în serios doar analizele curente.
 */

/**
 * Se ridică la fiecare schimbare de reguli care face verdictele vechi necomparabile.
 *
 * v3 (16.09.2026): comparator de nume insensibil la diacritice/ordine/formă juridică, banca
 * scoasă dintre avertismente, praguri pe sumă, plătitorul verificat doar cu identificator tare,
 * decontul tratat ca decont. Măsurat pe cele 10 zile dinainte: 78% → 25% din documente cu
 * avertisment, iar pe clientul real 75% → 19%.
 */
export const ANALYSIS_VERSION = 3;

/**
 * Tipurile de document care DECLARĂ suma de plată. Contractul lipsește intenționat: el arată
 * valoarea angajamentului, nu a plății din cerere.
 */
const AMOUNT_BEARING_KINDS = new Set(["invoice", "quotation", "act_of_receipt", "payment_order"]);

/** Compară suma și valuta doar dacă documentul e de un tip care le poartă. */
export function comparesAmount(kind: string | null | undefined): boolean {
  return AMOUNT_BEARING_KINDS.has(kind ?? "other");
}

/**
 * Tipurile pe care scrie CU CINE s-a contractat — singurele unde „beneficiarul e altul" e o
 * informație, nu zgomot.
 *
 * `other` lipsește dinadins. Sub el ajung chitanțele de card, pontajele, buletinele și capturile
 * de ecran. Pe un DECONT (PAR-2026-0042: șase chitanțe de card pentru un abonament Mailchimp,
 * rambursat unei colege), documentul numește COMERCIANTUL, iar cererea numește persoana
 * rambursată — două lucruri diferite prin construcție, nu o greșeală. Comparația lor a produs
 * șase avertisme false pe un dosar perfect corect.
 */
const PAYEE_BEARING_KINDS = new Set([
  "invoice", "quotation", "act_of_receipt", "contract", "payment_order",
]);

/** Are sens să verificăm CĂTRE cine merge banul, pe baza acestui document? */
export function comparesPayee(kind: string | null | undefined): boolean {
  return PAYEE_BEARING_KINDS.has(kind ?? "other");
}

/**
 * Sub cât NU e o diferență de sumă, ci o citire imprecisă (în bani/cenți).
 *
 * Pe producție: 340,90 citit „340,00" și 4300,75 citit „4300,00" — bănuții pierduți la OCR pe o
 * factură scanată. Amândouă raportate ca nepotriviri de sumă pe documente corecte. Un leu e sub
 * pragul la care cineva ar opri o plată, deci sub el tăcem.
 */
export const AMOUNT_TOLERANCE_MINOR_UNITS = 100;

/**
 * E o diferență de sumă pe care merită s-o vadă cineva?
 *
 * `null` = nu se poate ști: fie documentul n-a dat nicio sumă (extragere eșuată, nu diferență),
 * fie CEREREA n-are sumă completată — iar o cerere cu totalul 0 nu poate „nu corespunde" cu nimic.
 */
export function amountMismatch(
  expectedMinor: number | null | undefined,
  foundMinor: number | null | undefined
): boolean | null {
  // `0` citit din document nu e „documentul spune zero lei", ci o extragere eșuată: un buletin
  // scanat, un .txt, un contract fără cifre. Raportat ca diferență, dădea „suma nu corespunde:
  // 6000 vs 0" pe acte care nici nu conțin o sumă.
  if (!foundMinor || !expectedMinor) return null;
  if (Math.abs(foundMinor - expectedMinor) < AMOUNT_TOLERANCE_MINOR_UNITS) return false;
  // Aceeași sumă, o dată cu TVA și o dată fără, nu e o diferență de bani — e același document
  // citit de pe alt rând. Pe factura fiscală moldovenească rândul de TOTAL are trei cifre una
  // lângă alta (fără TVA | TVA | cu TVA), iar extractorul o ia uneori pe prima: 3148,15 în loc de
  // 3400,00, adică exact 8%. Cotele sunt fixe prin lege, deci raportul se verifică, nu se ghicește.
  if (isVatRatio(expectedMinor, foundMinor)) return false;
  return true;
}

/**
 * Suma citită se împacă cu propriile rânduri ale documentului?
 *
 * Pe o factură FOTOGRAFIATĂ cu 6 articole (PAR-2026-0046, total real 3795,00), extractorul a
 * întors la rulări diferite 840,00, 777,78 și 7777,00 — o dată valoarea unui rând, o dată o cifră
 * stricată la citire. Niciuna nu e totalul, dar toate produceau „suma nu corespunde".
 *
 * Regula nu ghicește care e adevărul, ci doar constată că nu-l știm: dacă documentul are cel puțin
 * două rânduri de articole, iar suma citită nu e nici totalul lor, nici totalul lor cu/fără TVA,
 * atunci extragerea se contrazice singură → câmpul se raportează „nedetectat", nu „nu corespunde".
 * Un avertisment clădit pe o cifră pe care noi înșine o putem dovedi greșită e mai rău decât lipsa
 * lui: îl învață pe aprobator că avertismentele mint.
 *
 * Preț plătit, conștient: dacă modelul citește doar o parte din rânduri, o diferență REALĂ de sumă
 * pe o factură cu mai multe poziții rămâne nespusă. Pe documentele cu un singur articol (unde a
 * apărut singura diferență reală de sumă din cele 10 zile măsurate — 14.000 cerere vs 70.000
 * factură) regula nu se aplică deloc, la fel pe ordinele de plată, care n-au tabel de articole.
 */
export function amountIsUnreliable(
  amountMinor: number | null | undefined,
  lineItems: readonly { quantity: number; unitPriceCents: number }[] | undefined
): boolean {
  if (!amountMinor || !lineItems || lineItems.length < 2) return false;
  const lineTotal = (li: { quantity: number; unitPriceCents: number }) =>
    (li.quantity || 0) * (li.unitPriceCents || 0);
  const all = lineItems.reduce((sum, li) => sum + lineTotal(li), 0);
  if (all <= 0) return false;
  const close = Math.abs(amountMinor - all) <= Math.max(AMOUNT_TOLERANCE_MINOR_UNITS, all * 0.01);
  return !close && !isVatRatio(amountMinor, all);
}

/** Cotele de TVA din Republica Moldova (art. 96 Cod fiscal): standard, redusă, redusă HoReCa. */
const VAT_RATES = [0.2, 0.12, 0.08];

/**
 * Cele două sume sunt aceeași valoare, una cu TVA și una fără?
 *
 * Toleranța de un ban acoperă rotunjirea pe fiecare rând al facturii (suma rotunjirilor de pe
 * 6 articole poate depăși un ban, de unde pragul proporțional).
 */
export function isVatRatio(a: number, b: number): boolean {
  const [low, high] = a < b ? [a, b] : [b, a];
  if (low <= 0) return false;
  return VAT_RATES.some((rate) => Math.abs(high - low * (1 + rate)) <= Math.max(2, high * 0.0002));
}
