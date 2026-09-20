/**
 * @vitest-environment node
 *
 * Cum împarte SISTEMUL un lot între agenți (partea pură).
 *
 * Aritmetica asta e ușor de greșit tăcut: la 7 contacte și 2 agenți, procentele dau 3,5 fiecare,
 * iar o rotunjire pierde sau inventează un contact. Un contact pierdut într-o repartizare de 3.000
 * nu se vede niciodată — dar clientul din el nu e sunat de nimeni.
 */
import { describe, it, expect } from "vitest";
import { splitCounts, type AutoMember } from "../lib/crm/distribution";

const m = (userId: string, over: Partial<AutoMember> = {}): AutoMember => ({
  userId,
  name: userId,
  weight: 1,
  remainingCapacity: null,
  orderIndex: 0,
  ...over,
});

const sum = (counts: Map<string, number>) => [...counts.values()].reduce((s, n) => s + n, 0);

describe("Egal, pe rând", () => {
  it("[blocant] suma dată e EXACT cât s-a cerut, chiar când nu se împarte frumos", () => {
    const counts = splitCounts(7, [m("a", { orderIndex: 0 }), m("b", { orderIndex: 1 })], "round_robin");
    expect(sum(counts)).toBe(7);
    expect(counts.get("a")).toBe(4);
    expect(counts.get("b")).toBe(3);
  });

  it("[blocant] restul merge la primii, în ordine stabilă — două rulări dau același rezultat", () => {
    const members = [m("c", { orderIndex: 2 }), m("a", { orderIndex: 0 }), m("b", { orderIndex: 1 })];
    const first = splitCounts(10, members, "round_robin");
    const second = splitCounts(10, [...members].reverse(), "round_robin");
    expect([...first.entries()].sort()).toEqual([...second.entries()].sort());
    expect(first.get("a")).toBe(4);
    expect(first.get("b")).toBe(3);
    expect(first.get("c")).toBe(3);
  });

  it("zero contacte sau zero agenți nu produce nimic, nu o eroare", () => {
    expect(sum(splitCounts(0, [m("a")], "round_robin"))).toBe(0);
    expect(sum(splitCounts(10, [], "round_robin"))).toBe(0);
  });
});

describe("După capacitate", () => {
  it("[blocant] nimeni nu primește peste norma lui — restul rămâne nedat", () => {
    const counts = splitCounts(
      10,
      [m("a", { remainingCapacity: 2, orderIndex: 0 }), m("b", { remainingCapacity: 3, orderIndex: 1 })],
      "capacity"
    );
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(3);
    // Cele 5 rămase NU se îndeasă peste normă: se văd ca lipsă, în rezervă.
    expect(sum(counts)).toBe(5);
  });

  it("norma nelimitată (0 în setări) înseamnă „ia cât e nevoie”", () => {
    const counts = splitCounts(
      9,
      [m("a", { remainingCapacity: null, orderIndex: 0 }), m("b", { remainingCapacity: 2, orderIndex: 1 })],
      "capacity"
    );
    expect(sum(counts)).toBe(9);
    expect(counts.get("b")).toBe(2);
    expect(counts.get("a")).toBe(7);
  });

  it("[blocant] un agent deja plin azi nu primește nimic", () => {
    const counts = splitCounts(
      4,
      [m("plin", { remainingCapacity: 0, orderIndex: 0 }), m("liber", { remainingCapacity: 10, orderIndex: 1 })],
      "capacity"
    );
    expect(counts.get("plin")).toBe(0);
    expect(counts.get("liber")).toBe(4);
  });
});

describe("Ponderat", () => {
  it("[blocant] greutatea 2 primește dublu față de greutatea 1", () => {
    const counts = splitCounts(9, [m("senior", { weight: 2 }), m("junior", { weight: 1, orderIndex: 1 })], "weighted");
    expect(counts.get("senior")).toBe(6);
    expect(counts.get("junior")).toBe(3);
    expect(sum(counts)).toBe(9);
  });

  it("[blocant] suma rămâne exactă și când proporția nu e rotundă", () => {
    const counts = splitCounts(10, [m("a", { weight: 3 }), m("b", { weight: 2, orderIndex: 1 })], "weighted");
    expect(sum(counts)).toBe(10);
    expect(counts.get("a")).toBe(6);
    expect(counts.get("b")).toBe(4);
  });

  it("[blocant] greutatea 0 = scos din tragere, nu „primește puțin”", () => {
    const counts = splitCounts(5, [m("activ", { weight: 1 }), m("scos", { weight: 0, orderIndex: 1 })], "weighted");
    expect(counts.get("scos")).toBe(0);
    expect(counts.get("activ")).toBe(5);
  });

  it("dacă toți au greutate 0, nu se dă nimic — nu se împarte egal pe tăcute", () => {
    const counts = splitCounts(5, [m("x", { weight: 0 }), m("y", { weight: 0, orderIndex: 1 })], "weighted");
    expect(sum(counts)).toBe(0);
  });
});
