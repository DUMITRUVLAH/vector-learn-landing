/**
 * PONTAJ-001 — sărbătorile legale nelucrătoare, pe jurisdicție și pe an.
 *
 * Lista e CALCULATĂ, nu stocată: datele fixe sunt în lege, iar cele mobile derivă din Paștele
 * ortodox, deci un tabel populat manual ar fi rămas în urmă în fiecare ianuarie. În baza de date
 * ajung doar zilele pe care platforma NU le poate ști — Hramul localității (art. 111 alin. (1)
 * lit. i) din Codul muncii RM, diferit de la o localitate la alta) și zilele libere proprii
 * companiei. Vezi `pontaj_holidays`.
 *
 * Portat din HR 365 (`src/lib/holidays.ts`), cu datele ca string `yyyy-MM-dd`: serverul rulează
 * în UTC pe Vercel, iar un `Date` construit local ar fi putut aluneca cu o zi la serializare.
 * Aici nu există niciun obiect `Date` care să traverseze granița modulului.
 *
 * Surse: art. 111 din Codul muncii al Republicii Moldova · art. 139 din Legea nr. 53/2003
 * (Codul muncii al României).
 */
import type { CountryCode } from "./jurisdiction";

export interface PublicHoliday {
  /** `yyyy-MM-dd`. */
  date: string;
  name: string;
  /** `legal` = din codul muncii; `company` = adăugată de organizație (Hram, zi liberă proprie). */
  source: "legal" | "company";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(year: number, month1: number, day: number): string {
  return `${year}-${pad2(month1)}-${pad2(day)}`;
}

/** `yyyy-MM-dd` + n zile. Trece corect peste sfârșitul lunii și peste ani bisecți. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = Date.UTC(y, (m || 1) - 1, (d || 1) + days);
  const out = new Date(t);
  return dateKey(out.getUTCFullYear(), out.getUTCMonth() + 1, out.getUTCDate());
}

/** Diferența în zile calendaristice între două chei (`a - b`). */
export function diffDays(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split("-").map(Number);
  const [by, bm, bd] = bKey.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

/** Ziua săptămânii ISO pentru o cheie: 1 = luni … 7 = duminică. */
export function isoWeekday(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  const wd = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay(); // 0 = duminică
  return wd === 0 ? 7 : wd;
}

/** Toate cheile din intervalul `[fromKey, toKey]`, inclusiv capetele. */
export function enumerateDays(fromKey: string, toKey: string, maxDays = 400): string[] {
  const out: string[] = [];
  const span = diffDays(toKey, fromKey);
  if (span < 0) return out;
  for (let i = 0; i <= Math.min(span, maxDays); i += 1) out.push(addDaysToKey(fromKey, i));
  return out;
}

/** Toate zilele unei luni `yyyy-MM`. */
export function enumerateMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return enumerateDays(dateKey(y, m, 1), dateKey(y, m, last), 31);
}

/**
 * Duminica Paștelui ORTODOX, în calendar gregorian.
 *
 * Algoritmul lui Meeus (varianta iuliană) dă data în calendarul iulian; diferența față de cel
 * gregorian e de 13 zile pentru intervalul 1900–2099, care acoperă cu mult orice an pe care
 * l-ar putea deschide cineva în aplicație.
 */
export function orthodoxEaster(year: number): string {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // 3 = martie, 4 = aprilie
  const day = ((d + e + 114) % 31) + 1;
  // Iulian → gregorian: +13 zile, normalizat prin UTC (30 martie + 13 → 12 aprilie).
  return addDaysToKey(dateKey(year, month, day), 13);
}

/**
 * Sărbătorile legale nelucrătoare ale unei țări într-un an, ordonate cronologic.
 *
 * Notă pentru MD: art. 111 include și **ziua Hramului localității**, care diferă de la o
 * localitate la alta și nu poate fi dedusă automat — organizația o adaugă din setările
 * pontajului, ca zi nelucrătoare proprie.
 */
export function legalHolidays(country: CountryCode, year: number): PublicHoliday[] {
  // Jurisdicția generică nu are calendar: nu știm ce țară e, deci orice listă am întoarce ar fi
  // o invenție. Organizația își adaugă zilele manual.
  if (country === "OTHER") return [];

  const easter = orthodoxEaster(year);
  const fixed = (month: number, day: number, name: string): PublicHoliday =>
    ({ date: dateKey(year, month, day), name, source: "legal" });
  const moving = (offset: number, name: string): PublicHoliday =>
    ({ date: addDaysToKey(easter, offset), name, source: "legal" });

  const list: PublicHoliday[] = country === "RO"
    ? [
        fixed(1, 1, "Anul Nou"),
        fixed(1, 2, "Anul Nou (a doua zi)"),
        fixed(1, 6, "Bobotează"),
        fixed(1, 7, "Soborul Sfântului Ioan Botezătorul"),
        fixed(1, 24, "Ziua Unirii Principatelor Române"),
        moving(-2, "Vinerea Mare"),
        moving(0, "Paștele"),
        moving(1, "A doua zi de Paști"),
        fixed(5, 1, "Ziua Muncii"),
        fixed(6, 1, "Ziua Copilului"),
        moving(49, "Rusaliile"),
        moving(50, "A doua zi de Rusalii"),
        fixed(8, 15, "Adormirea Maicii Domnului"),
        fixed(11, 30, "Sfântul Andrei"),
        fixed(12, 1, "Ziua Națională a României"),
        fixed(12, 25, "Crăciunul"),
        fixed(12, 26, "Crăciunul (a doua zi)"),
      ]
    : [
        fixed(1, 1, "Anul Nou"),
        fixed(1, 7, "Nașterea lui Iisus Hristos (Crăciunul pe stil vechi)"),
        fixed(1, 8, "Nașterea lui Iisus Hristos (a doua zi)"),
        fixed(3, 8, "Ziua internațională a femeii"),
        moving(0, "Paștele"),
        moving(1, "A doua zi de Paști"),
        moving(8, "Paștele Blajinilor"),
        fixed(5, 1, "Ziua internațională a solidarității oamenilor muncii"),
        fixed(5, 9, "Ziua Victoriei și a comemorării eroilor căzuți pentru independența Patriei"),
        // Art. 111 alin. (1) lit. g^1) — tot pe 9 mai, deci o singură zi liberă; numele se
        // unește mai jos, la deduplicare, ca formularul tipărit să arate temeiul complet.
        fixed(5, 9, "Ziua Europei"),
        // Lit. h) — lipsea din lista moștenită din HR 365, unde `MOLDOVA_PUBLIC_HOLIDAYS` sărea
        // peste 1 iunie. Confruntat cu textul art. 111: „1 iunie – Ziua ocrotirii copilului".
        fixed(6, 1, "Ziua ocrotirii copilului"),
        fixed(8, 27, "Ziua Independenței"),
        fixed(8, 31, "Limba noastră"),
        fixed(12, 25, "Nașterea lui Iisus Hristos (pe stil nou)"),
      ];

  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Două sărbători legale pot cădea pe ACEEAȘI zi — nu e un caz teoretic: în 2026, a doua zi de
  // Rusalii (Paște + 50) cade pe 1 iunie, care e și Ziua Copilului. Angajatul primește o singură
  // zi liberă; legea nu compensează suprapunerile.
  const merged: PublicHoliday[] = [];
  for (const h of list) {
    const prev = merged[merged.length - 1];
    if (prev && prev.date === h.date) {
      prev.name = `${prev.name} / ${h.name}`;
      continue;
    }
    merged.push({ ...h });
  }
  return merged;
}

/**
 * Harta `yyyy-MM-dd → nume` pentru un interval, din sărbătorile legale ale anilor atinși plus
 * zilele nelucrătoare proprii organizației.
 *
 * Acoperă intenționat și anul următor: ultima zi a lunii decembrie e ajun dacă 1 ianuarie e
 * sărbătoare, iar fără anul următor ziua scurtă din 31 decembrie ar dispărea tăcut.
 */
export function holidayMap(
  country: CountryCode,
  years: number[],
  companyHolidays: { date: string; name: string }[] = [],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const year of new Set(years)) {
    for (const h of legalHolidays(country, year)) map.set(h.date, h.name);
  }
  // Ziua companiei câștigă la nume (Hramul localității e mai specific decât orice etichetă a
  // noastră), dar efectul e identic: zi nelucrătoare.
  for (const h of companyHolidays) map.set(h.date, h.name);
  return map;
}
