/**
 * VM5-16 — traseul cererii și a câta rundă e.
 *
 * Cerința: „Flow-ul per PAR ex.: respinsă, revizuite, aprobat." Un PAR respins, revizuit și aprobat
 * arată azi pe ecran exact ca unul aprobat din prima. Diferența contează — la audit, întâi de toate.
 */
import { describe, it, expect } from "vitest";
import { buildFlowSteps, revisionLabel, revisionRound } from "../flowBand";

const ev = (event: string, day: number) => ({ event, created_at: `2026-09-${String(day).padStart(2, "0")}T10:00:00Z` });

describe("buildFlowSteps()", () => {
  it("scoate etapele în ordine cronologică", () => {
    const steps = buildFlowSteps([ev("approved", 5), ev("created", 1), ev("submitted", 2)]);
    expect(steps.map((s) => s.label)).toEqual(["Creată", "Depusă", "Aprobată"]);
  });

  it("păstrează povestea completă: depusă → respinsă → revizuită → depusă → aprobată", () => {
    const steps = buildFlowSteps([
      ev("created", 1), ev("submitted", 2), ev("rejected", 3),
      ev("reopened", 4), ev("submitted", 5), ev("approved", 6),
    ]);
    expect(steps.map((s) => s.label)).toEqual([
      "Creată", "Depusă", "Respinsă", "Revizuită", "Depusă", "Aprobată",
    ]);
  });

  it("lasă afară zgomotul jurnalului — editări, analize de documente, vizualizări", () => {
    const steps = buildFlowSteps([
      ev("created", 1), ev("edited", 1), ev("document_reconciliation_warning", 1), ev("submitted", 2),
    ]);
    expect(steps.map((s) => s.label)).toEqual(["Creată", "Depusă"]);
  });

  it("marchează tonul: respingerea și anularea plății nu arată ca o aprobare", () => {
    const steps = buildFlowSteps([ev("approved", 1), ev("rejected", 2), ev("changes_requested", 3)]);
    expect(steps.map((s) => s.tone)).toEqual(["done", "bad", "warn"]);
  });

  it("un jurnal gol nu produce etape", () => {
    expect(buildFlowSteps([])).toEqual([]);
  });
});

describe("revisionRound() / revisionLabel()", () => {
  it("prima încercare nu poartă etichetă", () => {
    const events = [ev("created", 1), ev("submitted", 2), ev("approved", 3)];
    expect(revisionRound(events)).toBe(1);
    expect(revisionLabel(events)).toBeNull();
  });

  it("după o respingere reluată, e runda a doua", () => {
    const events = [ev("submitted", 1), ev("rejected", 2), ev("reopened", 3), ev("submitted", 4)];
    expect(revisionRound(events)).toBe(2);
    expect(revisionLabel(events)).toBe("revizuită (v2)");
  });

  it("retragerea pentru corectură și întoarcerea de la finanțe numără la fel", () => {
    expect(revisionRound([ev("withdrawn", 1)])).toBe(2);
    expect(revisionRound([ev("finance_returned", 1)])).toBe(2);
    expect(revisionRound([ev("withdrawn", 1), ev("finance_returned", 3)])).toBe(3);
  });
});
