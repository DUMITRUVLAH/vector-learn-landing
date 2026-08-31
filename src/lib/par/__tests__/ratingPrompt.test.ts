/**
 * @vitest-environment jsdom
 *
 * Regresia pentru „mereu mă întreabă de la ultimul PAR când fac refresh" (owner, 2026-08-31).
 *
 * Testele de aici descriu exact ce se vedea pe ecran: o cerere plătită, un refresh, aceeași
 * întrebare. Pe codul vechi (urmă scrisă doar la „Mai târziu", fără pauză între întrebări) primele
 * două cazuri pică.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  chooseNextRating,
  rememberAsked,
  readRatingPromptMemory,
  writeRatingPromptMemory,
  EMPTY_RATING_PROMPT_MEMORY,
  RATING_PROMPT_COOLDOWN_MS,
  RATING_PROMPT_KEY,
} from "../ratingPrompt";

const T0 = Date.parse("2026-08-31T10:00:00Z");
const par = (id: string) => ({ parId: id });

describe("chooseNextRating", () => {
  it("propune prima cerere neîntrebată când nu s-a mai întrebat nimic", () => {
    expect(chooseNextRating([par("a"), par("b")], EMPTY_RATING_PROMPT_MEMORY, T0)).toEqual(par("a"));
  });

  it("NU repune aceeași întrebare la refresh, oricum ar fi fost închis dialogul", () => {
    // „Închis cu X" e tot o întrebare pusă: urma se scrie la deschidere, nu la apăsarea unui buton.
    const memory = rememberAsked(EMPTY_RATING_PROMPT_MEMORY, "a", T0);
    // Refresh peste 5 secunde — cazul din raportul owner-ului.
    expect(chooseNextRating([par("a")], memory, T0 + 5_000)).toBeNull();
    // Și peste o săptămână: o cerere se întreabă o singură dată.
    expect(chooseNextRating([par("a")], memory, T0 + 7 * 24 * 3600_000)).toBeNull();
  });

  it("nu trece imediat la următoarea cerere neevaluată — cel mult o întrebare pe zi", () => {
    const memory = rememberAsked(EMPTY_RATING_PROMPT_MEMORY, "a", T0);
    expect(chooseNextRating([par("a"), par("b")], memory, T0 + 60_000)).toBeNull();
    expect(chooseNextRating([par("a"), par("b")], memory, T0 + RATING_PROMPT_COOLDOWN_MS - 1)).toBeNull();
    expect(chooseNextRating([par("a"), par("b")], memory, T0 + RATING_PROMPT_COOLDOWN_MS)).toEqual(par("b"));
  });

  it("tace și dacă ceasul calculatorului a fost dat înapoi", () => {
    const memory = rememberAsked(EMPTY_RATING_PROMPT_MEMORY, "a", T0);
    expect(chooseNextRating([par("b")], memory, T0 - 3600_000)).toBeNull();
  });

  it("nu întreabă nimic dacă nu există cereri plătite neevaluate", () => {
    expect(chooseNextRating([], EMPTY_RATING_PROMPT_MEMORY, T0)).toBeNull();
  });
});

describe("rememberAsked", () => {
  it("ține minte cererile întrebate, dar nu crește la nesfârșit", () => {
    let memory = EMPTY_RATING_PROMPT_MEMORY;
    for (let i = 0; i < 250; i++) memory = rememberAsked(memory, `par-${i}`, T0 + i);
    expect(Object.keys(memory.asked)).toHaveLength(200);
    expect(memory.asked["par-249"]).toBeDefined();
    expect(memory.asked["par-0"]).toBeUndefined(); // cele mai vechi pleacă primele
  });
});

describe("memoria din localStorage", () => {
  // Node 26 expune un `localStorage` global gol dacă nu pornești cu `--localstorage-file`, iar el
  // umbrește implementarea din jsdom. Stub-ul ține testul independent de cum e pornit runner-ul.
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
    });
  });

  it("supraviețuiește refresh-ului (dus-întors prin localStorage)", () => {
    writeRatingPromptMemory(rememberAsked(EMPTY_RATING_PROMPT_MEMORY, "a", T0));
    expect(chooseNextRating([par("a")], readRatingPromptMemory(), T0 + 1000)).toBeNull();
  });

  it("respectă amânările scrise cu vechea cheie, ca să nu reîntrebe după actualizare", () => {
    localStorage.setItem("par:rating-snooze", JSON.stringify({ a: T0 + 1000 }));
    expect(chooseNextRating([par("a"), par("b")], readRatingPromptMemory(), T0)).toEqual(par("b"));
  });

  it("un conținut stricat nu blochează și nu aruncă", () => {
    localStorage.setItem(RATING_PROMPT_KEY, "{nu-i json");
    expect(readRatingPromptMemory()).toEqual(EMPTY_RATING_PROMPT_MEMORY);
  });
});
