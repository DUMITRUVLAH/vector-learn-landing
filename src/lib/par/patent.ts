/**
 * Patenta de întreprinzător a beneficiarului — stare și avertismente.
 *
 * În Moldova o persoană fizică poate presta legal servicii pe baza unei *patente de
 * întreprinzător*. Patenta se prelungește pe perioade scurte (de regulă lunar), deci un
 * beneficiar salvat în registru azi poate avea patenta EXPIRATĂ peste șase săptămâni, când e
 * refolosit pe o cerere nouă. Plata către un patentar cu patenta expirată e problema
 * PLĂTITORULUI (venitul devine impozabil altfel), așa că termenul trebuie verificat de fiecare
 * dată când beneficiarul apare în fața unui om — la completare, la aprobare, la plată.
 *
 * Modulul e PUR (fără I/O, fără date implicite ascunse): primește datele patentei și „azi",
 * întoarce starea + textul gata de afișat. Oglinda de pe server trăiește în
 * `server/lib/par/patent.ts` (regula celor două copii, ca la parPartyTypes.ts).
 */

export type PatentStatus =
  /** Beneficiarul nu lucrează pe patentă (sau e persoană juridică). */
  | "none"
  /** Are patentă, dar nu știm până când e valabilă. */
  | "unknown"
  /** Valabilă și cu timp suficient înainte. */
  | "valid"
  /** Valabilă, dar expiră în curând — merită cerută prelungirea acum, nu în ziua plății. */
  | "expiring"
  /** Termenul a trecut. */
  | "expired";

export interface PatentInput {
  isPatentHolder?: boolean | null;
  patentSeries?: string | null;
  /** Ultima zi de valabilitate, ISO "YYYY-MM-DD". */
  patentValidUntil?: string | null;
}

export interface PatentCheck {
  status: PatentStatus;
  /** Zile până la expirare (negativ = zile de când a expirat). Null când nu avem termen. */
  daysLeft: number | null;
  /** Mesaj gata de afișat, sau null când nu e nimic de spus. */
  message: string | null;
}

/** Sub câte zile rămase considerăm patenta „pe terminate". */
export const PATENT_EXPIRING_SOON_DAYS = 14;

/** "2026-03-12" → "12.03.2026". Orice altceva se întoarce neschimbat. */
export function formatPatentDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso ?? "");
}

/**
 * Aduce la ISO "YYYY-MM-DD" formatele în care oamenii (și documentele) scriu o dată:
 * "12.03.2026", "12/03/2026", "12-03-2026", "2026-03-12". Întoarce null dacă nu e o dată reală
 * — mai bine niciun termen decât un termen inventat, care ar stinge tocmai avertismentul.
 */
export function normalizePatentDate(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  let y: number, mo: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw);
  if (iso) {
    [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dmy) {
    [d, mo, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  } else {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Ziua trebuie să existe în luna ei: "31.02.2026" nu e o dată, e o greșeală de tastare.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Ziua calendaristică locală a lui `now`, ca ISO "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Diferența în zile întregi între două zile calendaristice ISO (b - a). */
function daysBetween(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  const MS_PER_DAY = 86_400_000;
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

/**
 * Are beneficiarul patentă? Flagul explicit decide, dar datele completate (serie/termen) contează
 * la fel: un rând vechi sau o completare din document poate avea patenta fără ca nimeni să fi
 * bifat căsuța — și tocmai acolo avertismentul e util.
 */
export function hasPatent(v: PatentInput | null | undefined): boolean {
  if (!v) return false;
  return !!v.isPatentHolder || !!v.patentSeries?.trim() || !!v.patentValidUntil?.trim();
}

/**
 * Starea patentei la momentul `now`.
 *
 * Nu blochează nimic — întoarce doar starea și textul. Deciziile (chenar galben, chenar roșu,
 * „cere copia patentei prelungite") se iau în UI, unde e omul care poate opri plata.
 */
export function patentStatus(v: PatentInput | null | undefined, now: Date = new Date()): PatentCheck {
  if (!hasPatent(v)) return { status: "none", daysLeft: null, message: null };

  const validUntil = normalizePatentDate(v?.patentValidUntil);
  if (!validUntil) {
    return {
      status: "unknown",
      daysLeft: null,
      message: "Patentă fără termen de valabilitate — completează data până la care e valabilă.",
    };
  }

  const daysLeft = daysBetween(todayIso(now), validUntil);
  const on = formatPatentDate(validUntil);

  if (daysLeft < 0) {
    const days = Math.abs(daysLeft);
    return {
      status: "expired",
      daysLeft,
      message: `Patenta din sistem a EXPIRAT la ${on} (acum ${days} ${days === 1 ? "zi" : "zile"}) — cere copia patentei prelungite înainte de plată.`,
    };
  }
  if (daysLeft <= PATENT_EXPIRING_SOON_DAYS) {
    return {
      status: "expiring",
      daysLeft,
      message:
        daysLeft === 0
          ? `Patenta expiră AZI (${on}) — verifică prelungirea înainte de plată.`
          : `Patenta expiră în ${daysLeft} ${daysLeft === 1 ? "zi" : "zile"} (${on}) — cere prelungirea din timp.`,
    };
  }
  return { status: "valid", daysLeft, message: `Patentă valabilă până la ${on}.` };
}
