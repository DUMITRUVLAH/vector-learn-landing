/**
 * PAR-VENDOR360 — de câte ori are voie să apară întrebarea „cum a prestat furnizorul?".
 *
 * Owner, 2026-08-31: „la finflow mereu mă întreabă de la ultimul PAR când fac refresh, trebuie să
 * fie doar o dată". Două lucruri o produceau, iar reparat doar primul rămânea la fel de enervant:
 *
 *  1. urma se scria DOAR când apăsai „Mai târziu". Închiderea cu X, cu Esc sau pe fundal nu lăsa
 *     nimic în urmă, deci următoarea încărcare a tabloului de bord punea exact aceeași întrebare,
 *     despre exact aceeași cerere.
 *  2. chiar și cu punctul 1 reparat, cine are zeci de cereri plătite neevaluate ar fi primit un
 *     popup la FIECARE refresh — altă cerere de fiecare dată, aceeași senzație de hărțuire.
 *
 * Regula devine deci: **o întrebare per cerere, o singură dată, și cel mult una pe zi.** Ce nu s-a
 * evaluat nu se pierde: rămâne în „de evaluat" pe fișa furnizorului, cu buton de evaluat oricând.
 * Un popup care tace e o pagubă mult mai mică decât unul care nu se lasă închis.
 *
 * Memoria stă în `localStorage`, nu în baza de date: e o comoditate strict personală, iar cel mai
 * rău lucru care se poate întâmpla pe un calculator nou e să fii întrebat încă o dată.
 */

export const RATING_PROMPT_KEY = "par:rating-prompt";
/** Cheia veche („amânare 7 zile"), citită doar ca să nu reîntrebăm pe cine a apăsat deja „Mai târziu". */
const LEGACY_SNOOZE_KEY = "par:rating-snooze";

/** Cel mult o întrebare pe zi, oricâte cereri plătite ar aștepta o notă. */
export const RATING_PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Câte cereri ținem minte că au fost întrebate. Serverul întoarce cel mult 10 candidați (cele mai
 * recente plăți neevaluate), deci 200 e cu mult peste orice fereastră realistă — plafonul e doar
 * ca stocarea locală să nu crească la nesfârșit.
 */
const MAX_REMEMBERED = 200;

export interface RatingPromptMemory {
  /** parId → momentul (ms) la care omul a fost întrebat despre acea cerere. */
  asked: Record<string, number>;
  /** Ultima dată când s-a deschis popup-ul, indiferent de cerere. `null` = niciodată. */
  lastShownAt: number | null;
}

export const EMPTY_RATING_PROMPT_MEMORY: RatingPromptMemory = { asked: {}, lastShownAt: null };

/**
 * Care cerere merită întrebată acum — sau niciuna.
 *
 * Ordinea condițiilor contează: pauza de 24h se verifică ÎNAINTE de căutarea unei cereri, ca o zi
 * cu multe refresh-uri să însemne o singură întrebare, nu una per cerere neevaluată.
 */
export function chooseNextRating<T extends { parId: string }>(
  pending: readonly T[],
  memory: RatingPromptMemory,
  now: number = Date.now(),
): T | null {
  // Un `lastShownAt` din viitor (ceas dat înapoi) intră tot aici: mai bine tăcem o zi decât să
  // întrebăm din nou pe cineva care tocmai a închis popup-ul.
  if (memory.lastShownAt !== null && now - memory.lastShownAt < RATING_PROMPT_COOLDOWN_MS) return null;
  return pending.find((p) => memory.asked[p.parId] === undefined) ?? null;
}

/**
 * Marchează o cerere drept „întrebată". Se apelează în momentul DESCHIDERII popup-ului, nu la
 * închiderea lui: altfel un refresh cu dialogul pe ecran ar șterge urma și am întreba din nou.
 */
export function rememberAsked(
  memory: RatingPromptMemory,
  parId: string,
  now: number = Date.now(),
): RatingPromptMemory {
  const asked: Record<string, number> = { ...memory.asked, [parId]: now };
  const keys = Object.keys(asked);
  if (keys.length > MAX_REMEMBERED) {
    // Tăiem cele mai vechi intrări. Cel mai rău efect posibil: o cerere veche de tot, rămasă
    // neevaluată după alte 200 de plăți, mai primește o întrebare.
    keys
      .sort((a, b) => asked[a] - asked[b])
      .slice(0, keys.length - MAX_REMEMBERED)
      .forEach((k) => delete asked[k]);
  }
  return { asked, lastShownAt: now };
}

function parseMemory(raw: string | null): RatingPromptMemory | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RatingPromptMemory> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const asked = parsed.asked && typeof parsed.asked === "object" ? parsed.asked : {};
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(asked)) if (typeof v === "number") clean[k] = v;
    return {
      asked: clean,
      lastShownAt: typeof parsed.lastShownAt === "number" ? parsed.lastShownAt : null,
    };
  } catch {
    return null;
  }
}

/** Cererile amânate cu vechea cheie rămân întrebate — altfel „Mai târziu" de ieri ar reveni azi. */
function parseLegacySnooze(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return {};
    // Valoarea 1 = „foarte vechi": dacă vreodată se atinge plafonul, astea pleacă primele.
    return Object.fromEntries(Object.keys(parsed).map((k) => [k, 1]));
  } catch {
    return {};
  }
}

export function readRatingPromptMemory(): RatingPromptMemory {
  try {
    const current = parseMemory(localStorage.getItem(RATING_PROMPT_KEY)) ?? EMPTY_RATING_PROMPT_MEMORY;
    const legacy = parseLegacySnooze(localStorage.getItem(LEGACY_SNOOZE_KEY));
    return { ...current, asked: { ...legacy, ...current.asked } };
  } catch {
    // Fereastră privată, stocare blocată, JSON stricat — niciunul nu e motiv să crape tabloul.
    return EMPTY_RATING_PROMPT_MEMORY;
  }
}

export function writeRatingPromptMemory(memory: RatingPromptMemory): void {
  try {
    localStorage.setItem(RATING_PROMPT_KEY, JSON.stringify(memory));
  } catch {
    /* fără stocare nu putem ține minte nimic; întrebăm din nou data viitoare — acceptabil */
  }
}
