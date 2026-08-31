/**
 * @vitest-environment jsdom
 *
 * Regresia „iar m-am logat și mi-a apărut să dau feedback" (owner, 2026-08-31, a doua raportare).
 *
 * Regula pe care o descriu testele: o întrebare pe sesiune, o singură dată per cerere, niciodată a
 * doua oară. Urma durabilă (serverul) e testată în `pending-rating-prompt.test.tsx`; aici sunt
 * gărzile locale.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  chooseNextRating,
  rememberAsked,
  readRatingPromptMemory,
  writeRatingPromptMemory,
  askedThisSession,
  markAskedThisSession,
  EMPTY_RATING_PROMPT_MEMORY,
  RATING_PROMPT_KEY,
} from "../ratingPrompt";

const T0 = Date.parse("2026-08-31T10:00:00Z");
const par = (id: string) => ({ parId: id });

describe("chooseNextRating", () => {
  it("propune prima cerere neîntrebată când nu s-a mai întrebat nimic", () => {
    expect(chooseNextRating([par("a"), par("b")], EMPTY_RATING_PROMPT_MEMORY)).toEqual(par("a"));
  });

  it("NU repune aceeași întrebare la refresh, oricum ar fi fost închis dialogul", () => {
    // „Închis cu X" e tot o întrebare pusă: urma se scrie la deschidere, nu la apăsarea unui buton.
    const memory = rememberAsked(EMPTY_RATING_PROMPT_MEMORY, "a", T0);
    expect(chooseNextRating([par("a")], memory)).toBeNull();
  });

  it("trece la următoarea cerere neevaluată abia într-o sesiune nouă", () => {
    const memory = rememberAsked(EMPTY_RATING_PROMPT_MEMORY, "a", T0);
    // În aceeași filă, garda de sesiune oprește orice a doua întrebare (vezi testul de mai jos);
    // memoria per cerere spune doar CARE ar fi următoarea, când vine rândul ei.
    expect(chooseNextRating([par("a"), par("b")], memory)).toEqual(par("b"));
  });

  it("nu întreabă nimic dacă nu există cereri plătite neevaluate", () => {
    expect(chooseNextRating([], EMPTY_RATING_PROMPT_MEMORY)).toBeNull();
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

describe("memoria din stocarea browserului", () => {
  // Node 26 expune un `localStorage` global gol dacă nu pornești cu `--localstorage-file`, iar el
  // umbrește implementarea din jsdom. Stub-ul ține testul independent de cum e pornit runner-ul.
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const fake = (store: Map<string, string>) => ({
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  });

  beforeEach(() => {
    local.clear();
    session.clear();
    vi.stubGlobal("localStorage", fake(local));
    vi.stubGlobal("sessionStorage", fake(session));
  });

  it("supraviețuiește refresh-ului (dus-întors prin localStorage)", () => {
    writeRatingPromptMemory(rememberAsked(EMPTY_RATING_PROMPT_MEMORY, "a", T0));
    expect(chooseNextRating([par("a")], readRatingPromptMemory())).toBeNull();
  });

  it("respectă amânările scrise cu vechea cheie, ca să nu reîntrebe după actualizare", () => {
    localStorage.setItem("par:rating-snooze", JSON.stringify({ a: T0 + 1000 }));
    expect(chooseNextRating([par("a"), par("b")], readRatingPromptMemory())).toEqual(par("b"));
  });

  it("un conținut stricat nu blochează și nu aruncă", () => {
    localStorage.setItem(RATING_PROMPT_KEY, "{nu-i json");
    expect(readRatingPromptMemory()).toEqual(EMPTY_RATING_PROMPT_MEMORY);
  });

  it("o singură întrebare pe sesiune, indiferent câte cereri așteaptă o notă", () => {
    expect(askedThisSession()).toBe(false);
    markAskedThisSession();
    expect(askedThisSession()).toBe(true);
  });

  it("fără stocare de sesiune (fereastră privată) nu crapă și nu blochează", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => { throw new Error("blocat"); },
      setItem: () => { throw new Error("blocat"); },
    });
    expect(askedThisSession()).toBe(false);
    expect(() => markAskedThisSession()).not.toThrow();
  });
});
