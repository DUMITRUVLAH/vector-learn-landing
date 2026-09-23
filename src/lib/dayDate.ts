/**
 * Datele pe care le tastează omul: zi.lună.an (13.01.2027), indiferent de limba browserului.
 *
 * DE CE: `<input type="date">` își ia ordinea câmpurilor din limba browserului, nu din pagină —
 * un Chrome în engleză (SUA) arată 01/13/2027 și niciun atribut nu o schimbă. Owner-ul:
 * „formatul la dată nu e comod, acum e luna, ziua, anul". Așa că afișăm și citim noi data, iar
 * spre formular și API iese tot ISO `YYYY-MM-DD`, ca înainte.
 *
 * Funcții pure, fără React, ca să poată fi testate direct (src/lib/__tests__/dayDate.test.ts).
 */

/** Ce arată câmpul gol, ca omul să știe ordinea înainte să scrie. */
export const DAY_DATE_PLACEHOLDER = "zz.ll.aaaa";

/**
 * Textul tastat → ISO `YYYY-MM-DD`, sau `null` dacă nu e (încă) o dată întreagă și reală.
 *
 * Acceptă 13.01.2027, 13/01/2027, 13-01-2027, 1.2.2027 și ISO-ul lipit din altă parte
 * (2027-01-13). Anul trebuie să aibă 4 cifre: altfel „13.01.20" ar fi deja o dată validă
 * (anul 20) în timp ce omul abia a început să scrie anul.
 */
export function parseDayDate(text: string): string | null {
  const raw = text.trim();
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
  if (y < 1000 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Ziua trebuie să existe în luna ei: 31.02 e o greșeală de tastare, nu 3 martie.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** ISO `YYYY-MM-DD` (sau un timestamp ISO întreg) → „13.01.2027". Gol sau nerecunoscut → "". */
export function formatDayDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/**
 * Pune punctele singur cât omul tastează înainte: „13012027" → „13.01.2027", „130" → „13.0".
 *
 * Atinge textul doar când separatorii existenți stau deja unde i-ar pune el (după zi și după
 * lună). „1.2.2027" sau un ISO lipit rămân cum sunt — le citește `parseDayDate`, iar la ieșirea
 * din câmp se afișează curat.
 */
export function shapeDayDate(raw: string): string {
  if (!/^[\d./-]*$/.test(raw)) return raw;
  for (let i = 0; i < raw.length; i++) {
    if (/\D/.test(raw[i]) && i !== 2 && i !== 5) return raw;
  }
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `.${digits.slice(2, 4)}`;
  if (digits.length > 4) out += `.${digits.slice(4)}`;
  // Punctul tastat de om după zi sau lună rămâne — să nu dispară sub cursor.
  if (/[./-]$/.test(raw) && (digits.length === 2 || digits.length === 4)) out += ".";
  return out;
}
