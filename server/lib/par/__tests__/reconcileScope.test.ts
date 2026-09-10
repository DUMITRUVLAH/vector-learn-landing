/**
 * Pe ce documente are sens să compari suma.
 *
 * Regula vine din date, nu din intuiție: pe producție (10.09.2026), din 23 de atașamente
 * analizate, 16 raportau „suma nu corespunde" — 9 dintre ele pe CONTRACTE, unde valoarea
 * angajamentului nu are cum să fie egală cu plata din cerere, iar restul pe documente care nu
 * conțin nicio sumă (un buletin scanat, un export de audit, un fișier de test).
 */
import { describe, it, expect } from "vitest";
import { ANALYSIS_VERSION, comparesAmount } from "../reconcileScope";

describe("comparesAmount()", () => {
  it("compară suma pe documentele care o declară", () => {
    for (const kind of ["invoice", "quotation", "act_of_receipt", "payment_order"]) {
      expect(comparesAmount(kind), kind).toBe(true);
    }
  });

  it("NU compară suma pe contract — valoarea contractului nu e plata din cerere", () => {
    expect(comparesAmount("contract")).toBe(false);
  });

  it("NU compară suma pe documentele fără sumă de plată", () => {
    for (const kind of ["participants_list", "narrative_report", "deliverables", "par_pdf", "other"]) {
      expect(comparesAmount(kind), kind).toBe(false);
    }
  });

  it("un tip lipsă se tratează ca „altul”, deci fără comparație de sumă", () => {
    expect(comparesAmount(null)).toBe(false);
    expect(comparesAmount(undefined)).toBe(false);
  });
});

describe("ANALYSIS_VERSION", () => {
  it("e un număr care poate crește — verdictele vechi rămân sub el", () => {
    expect(ANALYSIS_VERSION).toBeGreaterThanOrEqual(2);
  });
});
