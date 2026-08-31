/**
 * PAR-VENDOR360 — de câte ori are voie să apară întrebarea „cum a prestat furnizorul?".
 *
 * Owner, 2026-08-31 (a doua oară): „iar m-am logat și mi-a apărut să dau feedback. Trebuie să mă
 * întrebe doar o dată, direct după ce trimit PAR-ul, și gata — nu de mai multe ori."
 *
 * Regula, în trei condiții care se verifică în această ordine:
 *  1. **Cel mult o întrebare pe sesiune.** Cine are cinci plăți neevaluate nu primește cinci
 *     popup-uri la cinci refresh-uri. Memoria stă în `sessionStorage`: ține cât ține fila.
 *  2. **O singură întrebare per cerere, pentru totdeauna.** Urma se scrie la DESCHIDEREA
 *     dialogului, nu la apăsarea unui buton — închiderea cu X, cu Esc sau pe fundal contează tot
 *     ca „a fost întrebat".
 *  3. **Doar plăți proaspete** (fereastra e a serverului, `RATING_PROMPT_FRESH_DAYS`). O plată
 *     veche de luni de zile nu mai merită un popup.
 *
 * Unde stă memoria și de ce în două locuri:
 *  - **serverul** (`par_requests.rating_prompted_at`, via `markRatingAsked`) e sursa de adevăr:
 *    fără el, o autentificare nouă — alt calculator, fereastră privată, stocare curățată — punea
 *    exact aceeași întrebare. Exact asta a pățit owner-ul;
 *  - **`localStorage`** rămâne ca gardă instantanee: acoperă momentul dintre deschiderea
 *    dialogului și confirmarea de la server, și cazul în care apelul de marcare pică (offline).
 *
 * Ce nu s-a evaluat nu se pierde: cererea rămâne cu buton de evaluat pe fișa furnizorului, iar
 * evaluările date se văd acolo, pe „Prezentare" și lângă cererea care le-a generat.
 */

export const RATING_PROMPT_KEY = "par:rating-prompt";
/** Cheia veche („amânare 7 zile"), citită doar ca să nu reîntrebăm pe cine a apăsat deja „Mai târziu". */
const LEGACY_SNOOZE_KEY = "par:rating-snooze";
/** Cheia de sesiune: „în fila asta am întrebat deja o dată". */
export const RATING_PROMPT_SESSION_KEY = "par:rating-prompt-session";

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
 * Aici rămâne doar condiția 2 (o singură dată per cerere). Condiția 1 (una pe sesiune) se verifică
 * separat, cu `askedThisSession`, ca să poată fi testată și dezactivată independent; condiția 3
 * (prospețimea plății) o aplică serverul, care oricum știe data plății.
 */
export function chooseNextRating<T extends { parId: string }>(
  pending: readonly T[],
  memory: RatingPromptMemory,
): T | null {
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
    // neevaluată după alte 200 de plăți, mai primește o întrebare — dacă serverul n-a apucat să
    // o marcheze, ceea ce e deja improbabil.
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

/** A fost deja pusă o întrebare în fila asta? (condiția 1) */
export function askedThisSession(): boolean {
  try {
    return sessionStorage.getItem(RATING_PROMPT_SESSION_KEY) === "1";
  } catch {
    // Fără `sessionStorage` rămân condițiile 2 și 3 — nu e motiv să întrebăm mai des, dar nici
    // motiv să tăcem de tot.
    return false;
  }
}

export function markAskedThisSession(): void {
  try {
    sessionStorage.setItem(RATING_PROMPT_SESSION_KEY, "1");
  } catch {
    /* la fel: fără stocare de sesiune rămâne garda per cerere, care e cea care contează */
  }
}
