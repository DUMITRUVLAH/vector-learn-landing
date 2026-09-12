/**
 * VM5-20 — raportul unui eveniment: planificat vs realizat.
 *
 * Cerința din ședință: „Evenimentul să fie unit cu conturi bugetare — să vadă linia: cât era
 * planificat și cât s-a cheltuit, la event nu s-a depășit totalul." Owner-ul a ales bugetul **pe
 * linii**, nu o sumă globală.
 */
import { describe, it, expect } from "vitest";
import { buildEventBudgetReport, type EventBudgetLineInput, type EventSpendInput } from "../eventBudget";

const L = (lei: number) => lei * 100;
const linie = (o: Partial<EventBudgetLineInput> & { id: string }): EventBudgetLineInput => ({
  budgetCodeId: `bc-${o.id}`, label: `Linia ${o.id}`, allocatedCents: L(10000),
  currency: "MDL", allocatedMdlCents: L(10000), ...o,
});
const cheltuiala = (o: Partial<EventSpendInput> & { budgetCodeId: string | null }): EventSpendInput => ({
  label: "—", committedMdlCents: 0, paidMdlCents: 0, ...o,
});

describe("buildEventBudgetReport()", () => {
  it("pune pe fiecare linie planificatul și realizatul ei", () => {
    const r = buildEventBudgetReport(
      [linie({ id: "a", allocatedMdlCents: L(20000) }), linie({ id: "b", allocatedMdlCents: L(5000) })],
      [cheltuiala({ budgetCodeId: "bc-a", committedMdlCents: L(8000), paidMdlCents: L(4000) })]
    );
    const a = r.lines.find((l) => l.id === "a")!;
    expect(a.allocatedMdlCents).toBe(L(20000));
    expect(a.committedMdlCents).toBe(L(8000));
    expect(a.paidMdlCents).toBe(L(4000));
    expect(a.availableMdlCents).toBe(L(8000));
    expect(a.over).toBe(false);

    const b = r.lines.find((l) => l.id === "b")!;
    expect(b.committedMdlCents).toBe(0);
    expect(b.availableMdlCents).toBe(L(5000));
  });

  /** Întrebarea din ședință, cuvânt cu cuvânt: „la event nu s-a depășit totalul". */
  it("spune dacă s-a depășit TOTALUL evenimentului, nu doar o linie", () => {
    const r = buildEventBudgetReport(
      [linie({ id: "a", allocatedMdlCents: L(10000) }), linie({ id: "b", allocatedMdlCents: L(10000) })],
      [
        cheltuiala({ budgetCodeId: "bc-a", paidMdlCents: L(15000) }),
        cheltuiala({ budgetCodeId: "bc-b", paidMdlCents: L(2000) }),
      ]
    );
    expect(r.plannedMdlCents).toBe(L(20000));
    expect(r.paidMdlCents).toBe(L(17000));
    expect(r.overTotal).toBe(false); // o linie e depășită, totalul nu
    expect(r.lines.find((l) => l.id === "a")!.over).toBe(true);
    expect(r.availableMdlCents).toBe(L(3000));
  });

  it("depășirea totalului se vede chiar dacă fiecare linie pare în regulă", () => {
    const r = buildEventBudgetReport(
      [linie({ id: "a", allocatedMdlCents: L(10000) })],
      [
        cheltuiala({ budgetCodeId: "bc-a", paidMdlCents: L(9000) }),
        cheltuiala({ budgetCodeId: "bc-x", label: "Cheltuieli neplanificate", paidMdlCents: L(4000) }),
      ]
    );
    expect(r.overTotal).toBe(true);
    expect(r.availableMdlCents).toBe(-L(3000));
  });

  /** Angajatul contează: altfel evenimentul pare încadrat până în ziua în care ies banii. */
  it("numără și cererile aprobate, nu doar plățile", () => {
    const r = buildEventBudgetReport(
      [linie({ id: "a", allocatedMdlCents: L(10000) })],
      [cheltuiala({ budgetCodeId: "bc-a", committedMdlCents: L(12000) })]
    );
    expect(r.lines[0].over).toBe(true);
    expect(r.overTotal).toBe(true);
  });

  it("cheltuiala pe un cod care nu e în plan apare separat, nu se pierde", () => {
    const r = buildEventBudgetReport(
      [linie({ id: "a" })],
      [cheltuiala({ budgetCodeId: "bc-surpriza", label: "Transport", paidMdlCents: L(3000) })]
    );
    const extra = r.lines.find((l) => l.unplanned);
    expect(extra).toBeDefined();
    expect(extra!.label).toBe("Transport");
    expect(extra!.paidMdlCents).toBe(L(3000));
    expect(extra!.allocatedMdlCents).toBe(0);
  });

  it("o linie fără cod bugetar intră în total, dar nu pretinde că are realizat", () => {
    const r = buildEventBudgetReport(
      [linie({ id: "liber", budgetCodeId: null, label: "Catering", allocatedMdlCents: L(7000) })],
      [cheltuiala({ budgetCodeId: "bc-altul", label: "Altceva", paidMdlCents: L(1000) })]
    );
    const liber = r.lines.find((l) => l.id === "liber")!;
    expect(liber.availableMdlCents).toBeNull();
    expect(liber.over).toBe(false);
    expect(r.plannedMdlCents).toBe(L(7000));
  });

  it("aceleași sume în valută se compară în lei, nu în cifre brute", () => {
    // 1.000 EUR planificați ≈ 19.500 lei; cheltuiți 18.000 lei → încadrat.
    const r = buildEventBudgetReport(
      [linie({ id: "eur", currency: "EUR", allocatedCents: L(1000), allocatedMdlCents: L(19500) })],
      [cheltuiala({ budgetCodeId: "bc-eur", paidMdlCents: L(18000) })]
    );
    expect(r.lines[0].availableMdlCents).toBe(L(1500));
    expect(r.overTotal).toBe(false);
  });

  it("un eveniment fără plan nu raportează depășire", () => {
    const r = buildEventBudgetReport([], [cheltuiala({ budgetCodeId: "bc-a", paidMdlCents: L(5000) })]);
    expect(r.hasPlan).toBe(false);
    expect(r.overTotal).toBe(false);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].unplanned).toBe(true);
  });

  it("un eveniment fără nimic nu produce rânduri", () => {
    const r = buildEventBudgetReport([], []);
    expect(r.lines).toEqual([]);
    expect(r.plannedMdlCents).toBe(0);
  });
});
