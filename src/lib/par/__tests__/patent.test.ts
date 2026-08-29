/**
 * Patenta de întreprinzător — starea și avertismentele.
 *
 * Testul fixează „azi" la o dată concretă: o verificare care depinde de ziua în care rulează
 * suita ar fi verde luni și roșie peste două săptămâni.
 */
import { describe, it, expect } from "vitest";
import {
  formatPatentDate,
  hasPatent,
  normalizePatentDate,
  normalizePatentSeries,
  patentStatus,
  todayIso,
} from "../patent";

const NOW = new Date(2026, 7, 29, 15, 30); // 29 august 2026, ora locală

describe("normalizePatentDate", () => {
  it("acceptă formatele în care oamenii scriu o dată", () => {
    expect(normalizePatentDate("12.03.2026")).toBe("2026-03-12");
    expect(normalizePatentDate("12/03/2026")).toBe("2026-03-12");
    expect(normalizePatentDate("2026-03-12")).toBe("2026-03-12");
    expect(normalizePatentDate("2026-3-9")).toBe("2026-03-09");
  });

  it("refuză ce nu e o dată reală, în loc să inventeze una", () => {
    expect(normalizePatentDate("31.02.2026")).toBeNull(); // februarie nu are 31
    expect(normalizePatentDate("valabilă până la prelungire")).toBeNull();
    expect(normalizePatentDate("")).toBeNull();
    expect(normalizePatentDate(null)).toBeNull();
  });
});

describe("normalizePatentSeries", () => {
  /**
   * Regresia reală (găsită pe prod, 2026-08-29): modelul AI întoarce seria cum e TIPĂRITĂ pe act
   * („AA nr. 0123456"), iar parserul determinist — care rulează local, fără cheie — o curăța
   * („AA 0123456"). Aceeași patentă se scria în două feluri, deci nu mai putea fi căutată în
   * registru. Local nu se vedea: fără cheie AI, ruta modelului nu se execută niciodată.
   */
  it("scrie la fel seria, indiferent cine a citit actul", () => {
    expect(normalizePatentSeries("AA nr. 0123456")).toBe("AA 0123456");
    expect(normalizePatentSeries("AA 0123456")).toBe("AA 0123456");
    expect(normalizePatentSeries("AA0123456")).toBe("AA 0123456");
    expect(normalizePatentSeries("seria AA nr 0123456")).toBe("AA 0123456");
    expect(normalizePatentSeries("Seria și nr. AA № 0123456")).toBe("AA 0123456");
    expect(normalizePatentSeries("aa nr. 0123456")).toBe("AA 0123456");
  });

  it("acceptă și o patentă doar cu număr", () => {
    expect(normalizePatentSeries("0123456")).toBe("0123456");
  });

  it("nu mutilează un format pe care nu-l recunoaște — doar îl curăță de spații", () => {
    expect(normalizePatentSeries("  AA-BB/2026   nr 77 ")).toBe("AA-BB/2026 nr 77");
    expect(normalizePatentSeries("")).toBeNull();
    expect(normalizePatentSeries(null)).toBeNull();
  });
});

describe("formatPatentDate", () => {
  it("arată data ca în Moldova", () => {
    expect(formatPatentDate("2026-03-12")).toBe("12.03.2026");
  });
});

describe("todayIso", () => {
  it("dă ziua LOCALĂ, nu pe cea UTC (o cerere de seara nu are voie să sară în ziua următoare)", () => {
    expect(todayIso(new Date(2026, 7, 29, 23, 45))).toBe("2026-08-29");
  });
});

describe("hasPatent", () => {
  it("bifa explicită contează", () => {
    expect(hasPatent({ isPatentHolder: true })).toBe(true);
  });
  it("datele completate contează chiar fără bifă — acolo e utilă atenționarea", () => {
    expect(hasPatent({ patentValidUntil: "2026-01-01" })).toBe(true);
    expect(hasPatent({ patentSeries: "AA 0123456" })).toBe(true);
  });
  it("un beneficiar fără patentă rămâne fără patentă", () => {
    expect(hasPatent({ isPatentHolder: false })).toBe(false);
    expect(hasPatent(null)).toBe(false);
  });
});

describe("patentStatus", () => {
  it("fără patentă → nu spune nimic", () => {
    const r = patentStatus({ isPatentHolder: false }, NOW);
    expect(r.status).toBe("none");
    expect(r.message).toBeNull();
  });

  it("patentă fără termen → cere termenul", () => {
    const r = patentStatus({ isPatentHolder: true }, NOW);
    expect(r.status).toBe("unknown");
    expect(r.message).toMatch(/fără termen/i);
  });

  it("termen ilizibil → rămâne unknown, nu valabilă", () => {
    const r = patentStatus({ isPatentHolder: true, patentValidUntil: "candva" }, NOW);
    expect(r.status).toBe("unknown");
  });

  it("EXPIRATĂ: termenul a trecut → mesaj explicit, cu data și vechimea", () => {
    const r = patentStatus({ isPatentHolder: true, patentValidUntil: "2026-07-31" }, NOW);
    expect(r.status).toBe("expired");
    expect(r.daysLeft).toBe(-29);
    expect(r.message).toContain("EXPIRAT");
    expect(r.message).toContain("31.07.2026");
  });

  it("ziua de după termen e deja expirare (termenul e ULTIMA zi valabilă)", () => {
    expect(patentStatus({ isPatentHolder: true, patentValidUntil: "2026-08-28" }, NOW).status).toBe("expired");
    expect(patentStatus({ isPatentHolder: true, patentValidUntil: "2026-08-29" }, NOW).status).toBe("expiring");
  });

  it("expiră azi → avertisment, nu expirată", () => {
    const r = patentStatus({ isPatentHolder: true, patentValidUntil: "2026-08-29" }, NOW);
    expect(r.daysLeft).toBe(0);
    expect(r.message).toMatch(/AZI/);
  });

  it("expiră în curând (≤14 zile) → atenționare blândă", () => {
    const r = patentStatus({ isPatentHolder: true, patentValidUntil: "2026-09-05" }, NOW);
    expect(r.status).toBe("expiring");
    expect(r.daysLeft).toBe(7);
  });

  it("valabilă mult timp → confirmare, fără alarmă", () => {
    const r = patentStatus({ isPatentHolder: true, patentValidUntil: "2026-12-31" }, NOW);
    expect(r.status).toBe("valid");
    expect(r.message).toBe("Patentă valabilă până la 31.12.2026.");
  });

  it("data scrisă cu puncte (așa cum o tastează omul) e înțeleasă la fel", () => {
    expect(patentStatus({ isPatentHolder: true, patentValidUntil: "31.07.2026" }, NOW).status).toBe("expired");
  });
});
