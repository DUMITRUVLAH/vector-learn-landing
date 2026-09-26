/**
 * @vitest-environment node
 *
 * CRM-G09 — raportul pe segment și constatările automate. Funcții pure: se testează fără bază.
 *
 * Cazul care contează cel mai mult: pragul de eșantion. „Sursa X convertește 100%" dintr-un
 * singur lead ar trimite bugetul de marketing în locul greșit — testele blochează asta.
 */
import { describe, it, expect } from "vitest";
import type { ReportStage } from "../reports";
import {
  buildInsights,
  segmentBreakdown,
  segmentDimensions,
  segmentSpread,
  MAX_SEGMENT_VALUES,
  type InsightInput,
  type SegmentLead,
} from "../reportSegments";

const stages: ReportStage[] = [
  { key: "new", label: "Lead nou", orderIndex: 0, isWon: false, isLost: false },
  { key: "won", label: "Câștigat", orderIndex: 1, isWon: true, isLost: false },
  { key: "lost", label: "Pierdut", orderIndex: 2, isWon: false, isLost: true },
];

const range = { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" };
let n = 0;
function lead(stage: string, values: Record<string, string | null>, valueCents = 1000, createdAt = "2026-09-10T10:00:00.000Z"): SegmentLead {
  return { id: `l${++n}`, stage, assignedTo: null, valueCents, createdAt, values };
}
function many(count: number, stage: string, values: Record<string, string | null>): SegmentLead[] {
  return Array.from({ length: count }, () => lead(stage, values));
}

const emptyInput: InsightInput = {
  leaderboard: [],
  dimensions: [],
  funnel: [],
  aging: null,
  lostReasons: [],
  sales: { currentCents: 0, previousCents: null },
};

describe("segmentBreakdown", () => {
  it("[blocant] numără cohorta perioadei: conversie = câștigate / leaduri, rata = câștigate / închise", () => {
    const leads = [
      ...many(2, "won", { source: "referral" }),
      ...many(1, "lost", { source: "referral" }),
      ...many(1, "new", { source: "referral" }),
      lead("won", { source: "referral" }, 5000, "2026-08-10T10:00:00.000Z"), // în afara perioadei
    ];
    const [row] = segmentBreakdown(leads, stages, range, "source");
    expect(row).toMatchObject({ value: "referral", leads: 4, won: 2, lost: 1, open: 1, conversionPct: 50, winRatePct: 67 });
  });

  it("[normal] necompletatul stă la coadă, nu în mijlocul clasamentului", () => {
    const rows = segmentBreakdown([...many(5, "won", { region: null }), ...many(1, "new", { region: "Nord" })], stages, range, "region");
    expect(rows.map((r) => r.value)).toEqual(["Nord", ""]);
  });
});

describe("segmentDimensions", () => {
  it("[blocant] ascunde dimensiunile fără valori și câmpurile text libere (nume, adrese)", () => {
    const leads = [
      ...many(3, "won", { source: "referral", industry: null }),
      ...Array.from({ length: MAX_SEGMENT_VALUES + 1 }, (_, i) => lead("new", { source: "manual", cf_nume: `Om ${i}` })),
    ];
    const dims = segmentDimensions(leads, stages, range, [
      { key: "source", label: "Sursă", kind: "builtin" },
      { key: "industry", label: "Industrie", kind: "builtin" },
      { key: "cf_nume", label: "Nume", kind: "custom" },
    ]);
    expect(dims.map((d) => d.key)).toEqual(["source"]);
  });
});

describe("segmentSpread", () => {
  it("[blocant] nu clasează valori sub pragul de eșantion", () => {
    const rows = segmentBreakdown(
      [...many(1, "won", { source: "instagram" }), ...many(4, "new", { source: "manual" }), ...many(3, "won", { source: "referral" })],
      stages,
      range,
      "source"
    );
    // Instagram are 100% dintr-un singur lead — nu are voie să fie „cea mai bună".
    expect(segmentSpread(rows)).toMatchObject({ best: { value: "referral", conversionPct: 100 }, worst: { value: "manual", conversionPct: 0 } });
  });

  it("[blocant] fără diferență sau cu o singură valoare eligibilă nu inventează un clasament", () => {
    const equal = segmentBreakdown([...many(3, "won", { source: "a" }), ...many(3, "won", { source: "b" })], stages, range, "source");
    expect(segmentSpread(equal)).toBeNull();
    const single = segmentBreakdown([...many(5, "won", { source: "a" }), ...many(2, "new", { source: "b" })], stages, range, "source");
    expect(segmentSpread(single)).toBeNull();
  });
});

describe("buildInsights", () => {
  it("[blocant] cel mai bun vânzător, cu cota lui din vânzările echipei", () => {
    const out = buildInsights({
      ...emptyInput,
      leaderboard: [
        { ownerKey: "ana", wonCount: 3, wonValueCents: 75_000, lostCount: 1, winRatePct: 75 },
        { ownerKey: "ion", wonCount: 2, wonValueCents: 25_000, lostCount: 0, winRatePct: 100 },
        { ownerKey: "dir", wonCount: 0, wonValueCents: 0, lostCount: 0, winRatePct: null },
      ],
    });
    expect(out.find((i) => i.kind === "topSeller")).toMatchObject({ ownerKey: "ana", sharePct: 75, sellers: 2 });
    // Ion are 100%, dar din 2 afaceri închise — sub prag, deci nu e „cel mai bun la închis".
    expect(out.find((i) => i.kind === "bestWinRate")).toBeUndefined();
  });

  it("[blocant] un singur vânzător nu e „cel mai bun vânzător”", () => {
    const out = buildInsights({ ...emptyInput, leaderboard: [{ ownerKey: "ana", wonCount: 3, wonValueCents: 1, lostCount: 0, winRatePct: 100 }] });
    expect(out.some((i) => i.kind === "topSeller")).toBe(false);
  });

  it("[blocant] cea mai bună și cea mai slabă valoare pentru FIECARE dimensiune — sursă, oraș, industrie", () => {
    const leads = [
      ...many(4, "won", { source: "referral", cf_oras: "Chișinău", industry: "IT" }),
      ...many(4, "lost", { source: "facebook_ad", cf_oras: "Bălți", industry: "Agricultură" }),
    ];
    const dims = segmentDimensions(leads, stages, range, [
      { key: "source", label: "Sursă", kind: "builtin" },
      { key: "industry", label: "Industrie", kind: "builtin" },
      { key: "cf_oras", label: "Oraș", kind: "custom" },
    ]);
    const spreads = buildInsights({ ...emptyInput, dimensions: dims }).filter((i) => i.kind === "segmentSpread");
    expect(spreads.map((s) => s.kind === "segmentSpread" && [s.dimension, s.best.value, s.worst.value])).toEqual([
      ["source", "referral", "facebook_ad"],
      ["industry", "IT", "Agricultură"],
      ["cf_oras", "Chișinău", "Bălți"],
    ]);
  });

  it("[normal] trendul vânzărilor, etapa unde se pierd afacerile, stagnarea și motivul dominant", () => {
    const out = buildInsights({
      ...emptyInput,
      sales: { currentCents: 120_000, previousCents: 100_000 },
      funnel: [
        { key: "new", label: "Lead nou", isWon: false, isLost: false, reached: 10, dropped: 2, dropRatePct: 20 },
        { key: "offer", label: "Ofertă", isWon: false, isLost: false, reached: 8, dropped: 6, dropRatePct: 75 },
        { key: "won", label: "Câștigat", isWon: true, isLost: false, reached: 2, dropped: 0, dropRatePct: 0 },
      ],
      aging: { staleCount: 3, staleValueCents: 9_000 },
      lostReasons: [{ reason: "Preț", count: 4, pct: 50 }],
    });
    expect(out.find((i) => i.kind === "salesTrend")).toMatchObject({ changePct: 20, tone: "positive" });
    expect(out.find((i) => i.kind === "funnelLeak")).toMatchObject({ stageKey: "offer", dropRatePct: 75 });
    expect(out.find((i) => i.kind === "stale")).toMatchObject({ count: 3, valueCents: 9_000 });
    expect(out.find((i) => i.kind === "topLostReason")).toMatchObject({ reason: "Preț" });
  });

  it("[normal] fără date nu produce nimic", () => {
    expect(buildInsights(emptyInput)).toEqual([]);
  });
});
