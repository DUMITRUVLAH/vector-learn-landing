/**
 * @vitest-environment node
 *
 * CRM-G02 — analizele de vânzări care lipseau din rapoarte. Funcții pure: se testează fără bază.
 */
import { describe, it, expect } from "vitest";
import type { ReportStage, StageChange } from "../reports";
import {
  dealOutcomes,
  previousRange,
  sourceBreakdown,
  openDealAging,
  stageVelocity,
  ownerOutcomes,
  dealTitle,
  type InsightLead,
} from "../salesInsights";

const stages: ReportStage[] = [
  { key: "new", label: "Lead nou", orderIndex: 0, isWon: false, isLost: false },
  { key: "demo", label: "Demo", orderIndex: 1, isWon: false, isLost: false },
  { key: "castigat", label: "Client", orderIndex: 2, isWon: true, isLost: false },
  { key: "pierdut", label: "Pierdut", orderIndex: 3, isWon: false, isLost: true },
];

const SEPT = { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" };

function lead(id: string, over: Partial<InsightLead> = {}): InsightLead {
  return { id, stage: "new", assignedTo: "ana", valueCents: 0, createdAt: "2026-09-02T10:00:00.000Z", ...over };
}

describe("previousRange", () => {
  it("[blocant] compară cu perioada de ACEEAȘI lungime, imediat înainte", () => {
    expect(previousRange(SEPT)).toEqual({ from: "2026-08-02T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" });
  });
  it("„tot timpul” n-are perioadă precedentă", () => {
    expect(previousRange({ from: null, to: null })).toBeNull();
  });
});

describe("dealOutcomes", () => {
  const leads = [
    lead("a", { stage: "castigat", valueCents: 30_000_00 }),
    lead("b", { stage: "castigat", valueCents: 10_000_00 }),
    lead("c", { stage: "pierdut", valueCents: 5_000_00 }),
    lead("d", { stage: "demo", valueCents: 99_000_00 }),
  ];
  const changes: StageChange[] = [
    { leadId: "a", from: "demo", to: "castigat", occurredAt: "2026-09-10T10:00:00.000Z" },
    { leadId: "b", from: "demo", to: "castigat", occurredAt: "2026-09-12T10:00:00.000Z" },
    { leadId: "c", from: "demo", to: "pierdut", occurredAt: "2026-09-14T10:00:00.000Z" },
    // Câștigat în august: nu e al lui septembrie.
    { leadId: "d", from: "new", to: "castigat", occurredAt: "2026-08-20T10:00:00.000Z" },
  ];

  it("[blocant] rata de câștig = câștigate / DECISE; deschisele nu intră la numitor", () => {
    const out = dealOutcomes(leads, changes, stages, SEPT);
    expect(out.wonCount).toBe(2);
    expect(out.lostCount).toBe(1);
    expect(out.winRatePct).toBe(67);
    expect(out.avgDealCents).toBe(20_000_00);
    expect(out.wonValueCents).toBe(40_000_00);
  });

  it("[blocant] fără nicio afacere decisă, rata e null — nu un 0% care acuză degeaba", () => {
    const out = dealOutcomes([lead("x")], [], stages, SEPT);
    expect(out.winRatePct).toBeNull();
    expect(out.avgDealCents).toBeNull();
  });

  it("un agent vede doar afacerile lui", () => {
    const mixed = [...leads.slice(0, 2), lead("z", { stage: "castigat", assignedTo: "ion", valueCents: 1_00 })];
    const out = dealOutcomes(
      mixed,
      [...changes, { leadId: "z", from: "new", to: "castigat", occurredAt: "2026-09-15T00:00:00.000Z" }],
      stages,
      SEPT,
      "ion"
    );
    expect(out.wonCount).toBe(1);
    expect(out.wonValueCents).toBe(1_00);
  });
});

describe("sourceBreakdown", () => {
  it("[blocant] urmărește leadurile INTRATE în perioadă, pe sursă, cu ce s-a ales de ele", () => {
    const rows = sourceBreakdown(
      [
        lead("1", { source: "facebook_ad", stage: "pierdut" }),
        lead("2", { source: "facebook_ad" }),
        lead("3", { source: "referral", stage: "castigat", valueCents: 50_00 }),
        lead("4", { source: "referral", createdAt: "2026-07-01T00:00:00.000Z" }), // în afara perioadei
      ],
      stages,
      SEPT
    );
    const referral = rows.find((r) => r.source === "referral");
    const facebook = rows.find((r) => r.source === "facebook_ad");
    expect(referral).toMatchObject({ leads: 1, won: 1, winRatePct: 100, wonValueCents: 50_00 });
    expect(facebook).toMatchObject({ leads: 2, lost: 1, open: 1, winRatePct: 0 });
    // Sursa care aduce bani stă prima.
    expect(rows[0].source).toBe("referral");
  });
});

describe("openDealAging", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");

  it("[blocant] vechimea se măsoară de la ULTIMA atingere, nu de la crearea leadului", () => {
    const old = lead("vechi", { createdAt: "2026-05-01T00:00:00.000Z", valueCents: 10_00 });
    const activity = new Map([["vechi", "2026-09-24T09:00:00.000Z"]]);
    const out = openDealAging([old], stages, activity, now);
    expect(out.buckets[0]).toMatchObject({ key: "fresh", count: 1 });
    expect(out.staleCount).toBe(0);
  });

  it("[blocant] afacerile închise nu intră; cele uitate apar, cele mai scumpe întâi", () => {
    const out = openDealAging(
      [
        lead("mic", { createdAt: "2026-08-01T00:00:00.000Z", valueCents: 1_000_00 }),
        lead("mare", { createdAt: "2026-08-20T00:00:00.000Z", valueCents: 48_000_00, company: "Alfa SRL" }),
        lead("gata", { stage: "castigat", createdAt: "2026-01-01T00:00:00.000Z" }),
      ],
      stages,
      new Map(),
      now
    );
    expect(out.staleCount).toBe(2);
    expect(out.stale.map((d) => d.id)).toEqual(["mare", "mic"]);
    expect(out.stale[0].title).toBe("Alfa SRL");
    expect(out.buckets.reduce((n, b) => n + b.count, 0)).toBe(2);
  });
});

describe("stageVelocity", () => {
  it("[blocant] media se face din trecerile ÎNCHEIATE; prima etapă începe la creare", () => {
    const leads = [lead("a", { createdAt: "2026-09-01T00:00:00.000Z" })];
    const changes: StageChange[] = [
      { leadId: "a", from: "new", to: "demo", occurredAt: "2026-09-03T00:00:00.000Z" },
      { leadId: "a", from: "demo", to: "castigat", occurredAt: "2026-09-08T00:00:00.000Z" },
    ];
    const rows = stageVelocity(leads, changes, stages);
    expect(rows.find((r) => r.key === "new")).toMatchObject({ avgDays: 2, samples: 1 });
    expect(rows.find((r) => r.key === "demo")).toMatchObject({ avgDays: 5, samples: 1 });
    // Încă în „câștigat" — nu e o trecere încheiată.
    expect(rows.find((r) => r.key === "castigat")).toMatchObject({ avgDays: null, samples: 0 });
  });
});

describe("ownerOutcomes", () => {
  it("fiecare agent: câștigat, pierdut, rată și ce are încă deschis", () => {
    const leads = [
      lead("a", { stage: "castigat", valueCents: 10_00 }),
      lead("b", { stage: "demo", valueCents: 7_00 }),
      lead("c", { stage: "demo", assignedTo: "ion", valueCents: 3_00 }),
    ];
    const changes: StageChange[] = [{ leadId: "a", from: "demo", to: "castigat", occurredAt: "2026-09-05T00:00:00.000Z" }];
    const [ana, ion] = ownerOutcomes(leads, changes, stages, SEPT, [{ id: "ana" }, { id: "ion" }]);
    expect(ana).toMatchObject({ wonCount: 1, wonValueCents: 10_00, winRatePct: 100, openCount: 1, openValueCents: 7_00 });
    expect(ion).toMatchObject({ wonCount: 0, winRatePct: null, openCount: 1 });
  });
});

describe("dealTitle", () => {
  it("firma, apoi omul, apoi ce s-a vândut", () => {
    expect(dealTitle({ company: "Medlife SRL", fullName: "Tatiana", dealName: "Training" })).toBe("Medlife SRL");
    expect(dealTitle({ company: " ", fullName: "Tatiana", dealName: "Training" })).toBe("Tatiana");
    expect(dealTitle({})).toBe("Fără nume");
  });
});
