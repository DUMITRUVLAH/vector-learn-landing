/**
 * @vitest-environment node
 *
 * CC-7 — contactele repartizate și NEATINSE se întorc în rezervă.
 *
 * Regula asta ia clienți de la un agent și îi pune înapoi în stocul comun. Dacă greșește, ia
 * munca cuiva care tocmai o făcea. De aceea testele fixează exact limitele:
 *
 *  1. o atingere de lucru DUPĂ repartizare salvează leadul — inclusiv o simplă notiță;
 *  2. linia de sistem scrisă chiar de repartizare NU contează ca atingere (altfel niciun lead
 *     n-ar fi vreodată „neatins");
 *  3. afacerile închise nu se ating — acolo responsabilul e istorie, nu sarcină;
 *  4. lead-urile fără `assigned_at` (cele dinainte de migrare) nu pleacă: nu știm de când stau,
 *     iar o presupunere le-ar smulge pe toate odată, la prima rulare a cronului;
 *  5. regula OPRITĂ nu face nimic — și e oprită implicit.
 */
import { describe, it, expect } from "vitest";
import { dueForRecall, type RecallLeadInput, type RecallTouch } from "../lib/crm/recall";

const NOW = new Date("2026-09-20T09:00:00.000Z");
const CLOSED = new Set(["contract", "pierdut"]);

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function lead(id: string, overrides: Partial<RecallLeadInput> = {}): RecallLeadInput {
  return { id, assignedTo: "ana", assignedAt: daysAgo(30), stage: "new", ...overrides };
}

describe("Cine se întoarce în rezervă", () => {
  it("[blocant] un contact repartizat de 30 de zile, fără nicio activitate, se întoarce", () => {
    expect(dueForRecall([lead("a")], [], 14, CLOSED, NOW)).toEqual(["a"]);
  });

  it("[blocant] o atingere de lucru DUPĂ repartizare îl salvează", () => {
    const touches: RecallTouch[] = [{ leadId: "a", occurredAt: daysAgo(3) }];
    expect(dueForRecall([lead("a")], touches, 14, CLOSED, NOW)).toEqual([]);
  });

  it("[blocant] o atingere DINAINTE de repartizare nu-l salvează", () => {
    // Leadul a fost lucrat de omul anterior, apoi dat altcuiva — care nu l-a atins.
    const touches: RecallTouch[] = [{ leadId: "a", occurredAt: daysAgo(60) }];
    expect(dueForRecall([lead("a", { assignedAt: daysAgo(30) })], touches, 14, CLOSED, NOW)).toEqual(["a"]);
  });

  it("[blocant] cel repartizat de MAI PUȚIN de N zile rămâne unde e", () => {
    expect(dueForRecall([lead("a", { assignedAt: daysAgo(5) })], [], 14, CLOSED, NOW)).toEqual([]);
  });

  it("[blocant] afacerile închise nu se ating", () => {
    const rows = [lead("a", { stage: "contract" }), lead("b", { stage: "pierdut" }), lead("c")];
    expect(dueForRecall(rows, [], 14, CLOSED, NOW)).toEqual(["c"]);
  });

  it("[blocant] un lead FĂRĂ `assigned_at` nu pleacă — nu știm de când stă", () => {
    expect(dueForRecall([lead("a", { assignedAt: null })], [], 14, CLOSED, NOW)).toEqual([]);
  });

  it("un lead fără responsabil e deja în rezervă, deci nu apare de două ori", () => {
    expect(dueForRecall([lead("a", { assignedTo: null })], [], 14, CLOSED, NOW)).toEqual([]);
  });

  it("[blocant] cu `days = 0` regula nu ia nimic — nu goleşte toată baza", () => {
    expect(dueForRecall([lead("a")], [], 0, CLOSED, NOW)).toEqual([]);
  });

  it("o dată stricată în bază nu produce o întoarcere la întâmplare", () => {
    expect(dueForRecall([lead("a", { assignedAt: "nu e o dată" })], [], 14, CLOSED, NOW)).toEqual([]);
  });
});
