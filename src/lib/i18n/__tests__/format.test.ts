/**
 * Formatarea sensibilă la limbă.
 *
 * Motivul pentru care există: „1.500,00" și „1,500.00" sunt aceeași sumă scrisă
 * pentru doi cititori diferiți, iar o virgulă citită drept punct într-un ecran de
 * finanțe e o greșeală de o sută de ori.
 */
import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatNumber } from "../format";

/** `Intl` folosește spații fine și insecabile; le normalizăm ca să comparăm text, nu bytes. */
const normalize = (value: string) => value.replace(/[\u00a0\u202f\u2009]/g, " ");

describe("sumele", () => {
  it("vin din unități minore și se împart o singură dată", () => {
    expect(normalize(formatMoney(150000, "MDL", "ro"))).toContain("1.500,00");
    expect(normalize(formatMoney(150000, "MDL", "en"))).toContain("1,500.00");
  });

  it("păstrează bănuții — o sumă financiară nu se rotunjește la afișare", () => {
    expect(normalize(formatMoney(12345, "MDL", "ro"))).toContain("123,45");
  });
});

describe("numerele", () => {
  it("folosesc separatorii limbii", () => {
    expect(normalize(formatNumber(1234.5, "ro", { minimumFractionDigits: 1 }))).toBe("1.234,5");
    expect(normalize(formatNumber(1234.5, "en", { minimumFractionDigits: 1 }))).toBe("1,234.5");
  });
});

describe("datele", () => {
  it("respectă ordinea zi/lună a limbii", () => {
    const date = new Date("2026-08-29T10:00:00Z");
    expect(formatDate(date, "ro")).toBe("29.08.2026");
    expect(formatDate(date, "en")).toBe("08/29/2026");
  });

  it("dau „—” pentru o valoare lipsă sau invalidă, nu „Invalid Date”", () => {
    expect(formatDate(null, "ro")).toBe("—");
    expect(formatDate(undefined, "ro")).toBe("—");
    expect(formatDate("nu e o dată", "ro")).toBe("—");
  });
});
