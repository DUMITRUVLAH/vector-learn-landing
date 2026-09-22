/**
 * PONTAJ-001 — motorul pur: sărbători, ziua scurtă din ajun, concedii pe interval, totaluri.
 *
 * Testele închid REGULILE, nu implementarea: fiecare `it` numește o prevedere din Codul muncii
 * sau un caz care a costat deja o dată într-un produs de pontaj (ajunul care cade pe duminică,
 * concediul care trece peste sfârșitul lunii, ziua scurtată la cei cu program parțial).
 */
import { describe, it, expect } from "vitest";
import {
  addDaysToKey,
  diffDays,
  enumerateMonth,
  holidayMap,
  isoWeekday,
  legalHolidays,
  orthodoxEaster,
} from "../holidays";
import { composeDays, minutesToHours, monthTotals, preHolidayMinutes } from "../day";
import { getJurisdiction, resolveCountry } from "../jurisdiction";

const MD = getJurisdiction("MD");

/** Contextul standard: Moldova, luni–vineri, normă de 8 ore. */
function ctx(overrides: Partial<Parameters<typeof composeDays>[0]> = {}) {
  return {
    days: enumerateMonth("2026-03"),
    workWeekdays: [1, 2, 3, 4, 5],
    holidays: holidayMap("MD", [2026, 2027]),
    dailyMinutes: 480,
    fullDailyNormMinutes: 480,
    preHolidayReductionMinutes: MD.preHolidayReductionMinutes,
    reducedSchedule: false,
    leaves: [],
    entries: [],
    ...overrides,
  };
}

describe("aritmetica de zi", () => {
  it("trece corect peste sfârșitul lunii și peste ani bisecți", () => {
    expect(addDaysToKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysToKey("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysToKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysToKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(diffDays("2026-03-10", "2026-03-01")).toBe(9);
  });

  it("numără zilele săptămânii ISO, cu duminica pe 7", () => {
    expect(isoWeekday("2026-03-02")).toBe(1); // luni
    expect(isoWeekday("2026-03-08")).toBe(7); // duminică
  });

  it("enumeră lunile complet, inclusiv februarie bisect", () => {
    expect(enumerateMonth("2026-02")).toHaveLength(28);
    expect(enumerateMonth("2024-02")).toHaveLength(29);
    expect(enumerateMonth("2026-12")).toHaveLength(31);
  });
});

describe("Paștele ortodox și sărbătorile legale", () => {
  it("dă datele cunoscute ale Paștelui ortodox", () => {
    expect(orthodoxEaster(2025)).toBe("2025-04-20");
    expect(orthodoxEaster(2026)).toBe("2026-04-12");
    expect(orthodoxEaster(2027)).toBe("2027-05-02");
  });

  it("include în MD zilele din art. 111, inclusiv 1 iunie", () => {
    const dates = legalHolidays("MD", 2026).map((h) => h.date);
    expect(dates).toContain("2026-01-01");
    expect(dates).toContain("2026-01-07");
    expect(dates).toContain("2026-03-08");
    expect(dates).toContain("2026-05-01");
    expect(dates).toContain("2026-05-09");
    expect(dates).toContain("2026-06-01"); // Ziua ocrotirii copilului — lipsea din lista moștenită
    expect(dates).toContain("2026-08-27");
    expect(dates).toContain("2026-08-31");
    expect(dates).toContain("2026-12-25");
  });

  it("unește două sărbători care cad în aceeași zi într-o singură zi liberă", () => {
    const nine = legalHolidays("MD", 2026).filter((h) => h.date === "2026-05-09");
    expect(nine).toHaveLength(1);
    expect(nine[0].name).toContain("Ziua Europei");
  });

  it("derivă Paștele Blajinilor la o săptămână după Paști", () => {
    const md = legalHolidays("MD", 2026);
    const blajini = md.find((h) => h.name.includes("Blajinilor"));
    expect(blajini?.date).toBe(addDaysToKey(orthodoxEaster(2026), 8));
  });

  it("nu inventează niciun calendar pentru jurisdicția generică", () => {
    expect(legalHolidays("OTHER", 2026)).toEqual([]);
    expect(resolveCountry("XX")).toBe("OTHER");
    expect(resolveCountry(null)).toBe("MD");
  });
});

describe("ziua scurtă din ajun — art. 102 CM RM", () => {
  it("scade exact o oră la norma întreagă", () => {
    expect(preHolidayMinutes(480, 60, 480, false)).toBe(420);
  });

  it("nu atinge programul sub normă (art. 96/97)", () => {
    expect(preHolidayMinutes(240, 60, 480, false)).toBe(240);
    expect(preHolidayMinutes(480, 60, 480, true)).toBe(480);
  });

  it("nu scurtează nimic într-o jurisdicție fără prevedere", () => {
    expect(preHolidayMinutes(480, 0, 480, false)).toBe(480);
  });

  it("scurtează 6 ianuarie, fiindcă 7 ianuarie e sărbătoare", () => {
    const days = composeDays(ctx({ days: enumerateMonth("2026-01") }));
    const jan6 = days.find((d) => d.date === "2026-01-06")!; // marți
    expect(jan6.isPreHolidayEve).toBe(true);
    expect(jan6.isPreHolidayReduced).toBe(true);
    expect(jan6.minutes).toBe(420);
    expect(jan6.source).toBe("pre_holiday");
    // 8 ianuarie e tot sărbătoare, deci ajunul ei (7 ianuarie) NU se scurtează: e nelucrător.
    expect(days.find((d) => d.date === "2026-01-07")!.symbol).toBe("Sn");
    expect(days.find((d) => d.date === "2026-01-08")!.symbol).toBe("Sn");
  });

  it("nu scurtează ziua celui cu program parțial", () => {
    const days = composeDays(
      ctx({ days: enumerateMonth("2026-01"), dailyMinutes: 240, reducedSchedule: true }),
    );
    const jan6 = days.find((d) => d.date === "2026-01-06")!;
    expect(jan6.isPreHolidayEve).toBe(true);
    expect(jan6.isPreHolidayReduced).toBe(false);
    expect(jan6.minutes).toBe(240);
  });

  it("nu scurtează nimic când ajunul cade în weekend", () => {
    // 2027: 8 martie e luni, deci ajunul e duminica 7 — zi de repaus, nimic de scurtat,
    // iar vinerea 5 rămâne zi întreagă.
    const days = composeDays(ctx({ days: enumerateMonth("2027-03"), holidays: holidayMap("MD", [2027, 2028]) }));
    expect(days.find((d) => d.date === "2027-03-07")!.symbol).toBe("R");
    expect(days.find((d) => d.date === "2027-03-05")!.minutes).toBe(480);
  });

  it("scurtează 31 decembrie, deși sărbătoarea e în anul următor", () => {
    const days = composeDays(ctx({ days: enumerateMonth("2026-12"), holidays: holidayMap("MD", [2026, 2027]) }));
    const dec31 = days.find((d) => d.date === "2026-12-31")!;
    expect(dec31.isPreHolidayEve).toBe(true);
    expect(dec31.minutes).toBe(420);
  });
});

describe("compunerea zilei", () => {
  it("completează implicit 8 ore în zilele lucrătoare", () => {
    const days = composeDays(ctx());
    const march3 = days.find((d) => d.date === "2026-03-03")!; // marți
    expect(march3.symbol).toBe("P");
    expect(days.filter((d) => d.symbol === "P" && d.minutes === 480).length).toBeGreaterThan(15);
    expect(minutesToHours(march3.minutes)).toBe(8);
  });

  it("pune R în weekend și Sn de sărbătoare", () => {
    const days = composeDays(ctx());
    expect(days.find((d) => d.date === "2026-03-08")!.symbol).toBe("Sn"); // duminică ȘI sărbătoare
    expect(days.find((d) => d.date === "2026-03-02")!.symbol).toBe("P"); // luni
    expect(days.find((d) => d.date === "2026-03-07")!.symbol).toBe("R"); // sâmbătă
    expect(days.find((d) => d.date === "2026-03-01")!.symbol).toBe("R"); // duminică
  });

  it("acoperă tot intervalul unui concediu dintr-o singură intrare", () => {
    const days = composeDays(
      ctx({ leaves: [{ id: "l1", symbol: "C", startDate: "2026-03-09", endDate: "2026-03-20" }] }),
    );
    const covered = days.filter((d) => d.symbol === "C");
    expect(covered).toHaveLength(12); // zile calendaristice, art. 113 CM RM
    expect(covered[0].date).toBe("2026-03-09");
    expect(covered.at(-1)!.date).toBe("2026-03-20");
    expect(covered[0].leaveId).toBe("l1");
    expect(covered[0].source).toBe("leave");
  });

  it("arată și un concediu care începe în luna precedentă", () => {
    const days = composeDays(
      ctx({ leaves: [{ id: "l2", symbol: "Cm", startDate: "2026-02-24", endDate: "2026-03-04" }] }),
    );
    expect(days.filter((d) => d.symbol === "Cm").map((d) => d.date)).toEqual([
      "2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04",
    ]);
  });

  it("lasă corecția manuală să bată și concediul, și calendarul", () => {
    const days = composeDays(
      ctx({
        leaves: [{ id: "l3", symbol: "C", startDate: "2026-03-09", endDate: "2026-03-13" }],
        entries: [
          { date: "2026-03-11", symbol: "P", minutes: 360, note: "am intrat o zi" },
          { date: "2026-03-14", symbol: "P", minutes: 300 }, // sâmbătă lucrată
        ],
      }),
    );
    const worked = days.find((d) => d.date === "2026-03-11")!;
    expect(worked.symbol).toBe("P");
    expect(worked.minutes).toBe(360);
    expect(worked.source).toBe("manual");
    const saturday = days.find((d) => d.date === "2026-03-14")!;
    expect(saturday.isWeekend).toBe(true);
    expect(saturday.minutes).toBe(300);
  });

  it("respectă o săptămână de lucru neobișnuită", () => {
    const days = composeDays(ctx({ workWeekdays: [1, 2, 3, 4, 5, 6] }));
    expect(days.find((d) => d.date === "2026-03-14")!.symbol).toBe("P"); // sâmbătă lucrătoare
    expect(days.find((d) => d.date === "2026-03-15")!.symbol).toBe("R"); // duminică liberă
  });

  it("tratează ziua proprie a organizației ca pe o sărbătoare", () => {
    const days = composeDays(
      ctx({ holidays: holidayMap("MD", [2026, 2027], [{ date: "2026-03-12", name: "Hramul localității" }]) }),
    );
    const hram = days.find((d) => d.date === "2026-03-12")!;
    expect(hram.symbol).toBe("Sn");
    expect(hram.holidayName).toBe("Hramul localității");
    // Ziua dinainte devine ajun, exact ca la o sărbătoare legală.
    expect(days.find((d) => d.date === "2026-03-11")!.minutes).toBe(420);
  });
});

describe("totalurile lunii", () => {
  it("numără pe coloanele formularului și adună doar orele lucrate", () => {
    const days = composeDays(
      ctx({ leaves: [{ id: "l4", symbol: "C", startDate: "2026-03-09", endDate: "2026-03-13" }] }),
    );
    const totals = monthTotals(days);
    expect(totals.counts.c).toBe(5);
    expect(totals.counts.sn).toBe(1); // 8 martie
    // Martie 2026 are 9 zile de weekend, dar 8 martie e duminică ȘI sărbătoare: o singură zi
    // liberă, numărată ca Sn. Legea nu compensează suprapunerile.
    expect(totals.counts.r).toBe(8);
    expect(totals.counts.zl).toBe(totals.workedDays);
    expect(totals.counts.zl + totals.counts.c + totals.counts.sn + totals.counts.r).toBe(31);
    expect(totals.workedMinutes).toBe(totals.workedDays * 480);
  });

  it("scade ora din ajun din totalul lunii", () => {
    const totals = monthTotals(composeDays(ctx({ days: enumerateMonth("2026-01") })));
    // Ianuarie 2026: o singură zi de ajun lucrătoare (6 ianuarie), deci exact o oră mai puțin.
    expect(totals.workedMinutes).toBe(totals.workedDays * 480 - 60);
    expect(totals.counts.sn).toBe(3); // 1, 7 și 8 ianuarie
  });

  it("nu adună ore pe zilele care nu sunt muncă", () => {
    const days = composeDays(ctx({ entries: [{ date: "2026-03-03", symbol: "Cm", minutes: 480 }] }));
    const day = days.find((d) => d.date === "2026-03-03")!;
    expect(day.minutes).toBe(0);
    expect(monthTotals(days).counts.cm).toBe(1);
  });
});

describe("jurisdicția", () => {
  it("MD are reducere de o oră în ajun, RO nu are", () => {
    expect(getJurisdiction("MD").preHolidayReductionMinutes).toBe(60);
    expect(getJurisdiction("MD").preHolidayLegalRef).toContain("102");
    expect(getJurisdiction("RO").preHolidayReductionMinutes).toBe(0);
    expect(getJurisdiction("RO").preHolidayLegalRef).toBe("");
  });

  it("păstrează aceleași CODURI stocate, cu afișare diferită per țară", () => {
    const md = getJurisdiction("MD").timesheetSymbols.map((s) => s.code);
    const ro = getJurisdiction("RO").timesheetSymbols.map((s) => s.code);
    expect(md).toEqual(ro);
    expect(getJurisdiction("MD").timesheetSymbols.find((s) => s.code === "C")!.display).toBe("C");
    expect(getJurisdiction("RO").timesheetSymbols.find((s) => s.code === "C")!.display).toBe("CO");
  });

  it("nu pune niciun temei legal pe formularul jurisdicției neadaptate", () => {
    const other = getJurisdiction("OTHER");
    expect(other.isAdapted).toBe(false);
    expect(other.timesheetForm.annexLines).toEqual([]);
    expect(other.timesheetForm.legalBasis).toBe("");
  });

  it("citează formularul tipizat moldovenesc", () => {
    const form = getJurisdiction("MD").timesheetForm;
    expect(form.annexLines.join(" ")).toContain("nr. 17 din 28 februarie 2020");
    expect(form.title).toContain("TABEL DE EVIDENȚĂ");
    expect(form.legend.length).toBe(5);
  });
});
