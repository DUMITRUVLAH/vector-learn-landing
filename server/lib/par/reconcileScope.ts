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
 * documentele care declară chiar suma de plătit. Identitatea (beneficiar, IDNO, IBAN, bancă,
 * plătitor) se verifică peste tot: acolo semnalul e curat — zero alarme false în datele reale.
 *
 * Versiunea analizei: verdictele salvate de versiuni mai vechi ale extractorului sunt încă în
 * bază, iar unele sunt vizibil greșite (numărul facturii „EBK000758854" citit ca sumă). Ele rămân
 * afișate ca informație, dar nu au voie să blocheze o aprobare — de aceea fiecare analiză nouă e
 * ștampilată cu `ANALYSIS_VERSION`, iar interfața ia în serios doar analizele curente.
 */

/** Se ridică la fiecare schimbare de reguli care face verdictele vechi necomparabile. */
export const ANALYSIS_VERSION = 2;

/**
 * Tipurile de document care DECLARĂ suma de plată. Contractul lipsește intenționat: el arată
 * valoarea angajamentului, nu a plății din cerere.
 */
const AMOUNT_BEARING_KINDS = new Set(["invoice", "quotation", "act_of_receipt", "payment_order"]);

/** Compară suma și valuta doar dacă documentul e de un tip care le poartă. */
export function comparesAmount(kind: string | null | undefined): boolean {
  return AMOUNT_BEARING_KINDS.has(kind ?? "other");
}
