/**
 * @vitest-environment node
 *
 * CC-4 — pâlnia ca pâlnie: bani pe etapă, cădere pe etapă.
 *
 * Calculul ăsta e cel mai ușor de făcut să MINTĂ dintre toate rapoartele, fiindcă arată bine
 * orice ar returna: un desen de pâlnie cu procente pare credibil chiar când numărătoarea e
 * greșită. De aceea testele de mai jos fixează exact deciziile care se pot strica în tăcere:
 *
 *  1. lead-urile IMPORTATE, fără nicio tranziție, trebuie să intre în pâlnie — altfel pe o bază
 *     de outreach (unde 90% din leaduri vin din Excel) pâlnia ar fi aproape goală;
 *  2. etapele „pierdut" NU sunt o verigă a lanțului — puse la coadă, ar arăta 0% cădere peste tot
 *     și 100% la final;
 *  3. etapa câștigată e ultima verigă: ce a ajuns acolo a ajuns, deci căderea ei e 0, nu 100%;
 *  4. banii pe etapă sunt banii care stau ACUM acolo, iar cei ponderați folosesc probabilitatea
 *     LEAD-ului când o are, nu doar pe a etapei.
 */
import { describe, it, expect } from "vitest";
import { funnelBreakdown, funnelByOwner, type FunnelLead, type FunnelStage, type StageChange } from "../lib/crm/reports";

const STAGES: FunnelStage[] = [
  { key: "suspect", label: "Suspect", orderIndex: 0, isWon: false, isLost: false, probabilityPct: 10 },
  { key: "prospect", label: "Prospect", orderIndex: 1, isWon: false, isLost: false, probabilityPct: 30 },
  { key: "negociere", label: "Negociere", orderIndex: 2, isWon: false, isLost: false, probabilityPct: 60 },
  { key: "comanda", label: "Comandă", orderIndex: 3, isWon: true, isLost: false, probabilityPct: 100 },
  { key: "pierdut", label: "Pierdut", orderIndex: 4, isWon: false, isLost: true, probabilityPct: 0 },
];

function lead(id: string, stage: string, valueCents = 100_00, extra: Partial<FunnelLead> = {}): FunnelLead {
  return {
    id,
    stage,
    assignedTo: null,
    valueCents,
    createdAt: "2026-09-01T10:00:00.000Z",
    lostReason: null,
    interestCourse: null,
    ...extra,
  };
}

const row = (rows: ReturnType<typeof funnelBreakdown>, key: string) => rows.find((r) => r.key === key)!;

describe("Pâlnia — câți au ajuns până unde", () => {
  it("[blocant] lead-urile importate, FĂRĂ nicio tranziție, intră în pâlnie după poziția curentă", () => {
    // Patru leaduri intrate direct în etape diferite, ca la un import în bloc.
    const rows = funnelBreakdown(
      [lead("a", "suspect"), lead("b", "prospect"), lead("c", "negociere"), lead("d", "comanda")],
      STAGES,
      []
    );

    // Cine e în „Negociere" a trecut prin Suspect și Prospect — asta ESTE o pâlnie.
    expect(row(rows, "suspect").reached).toBe(4);
    expect(row(rows, "prospect").reached).toBe(3);
    expect(row(rows, "negociere").reached).toBe(2);
    expect(row(rows, "comanda").reached).toBe(1);
  });

  it("[blocant] tranzițiile reale contează chiar dacă lead-ul a regresat între timp", () => {
    // A ajuns la Negociere, apoi a fost tras înapoi la Prospect. A ATINS Negocierea.
    const changes: StageChange[] = [
      { leadId: "a", from: "suspect", to: "negociere" },
      { leadId: "a", from: "negociere", to: "prospect" },
    ];
    const rows = funnelBreakdown([lead("a", "prospect")], STAGES, changes);
    expect(row(rows, "negociere").reached).toBe(1);
  });

  it("[blocant] etapa „pierdut” nu e o verigă: nu apare în lanț, ci la coadă", () => {
    const rows = funnelBreakdown([lead("a", "suspect"), lead("b", "pierdut")], STAGES, []);

    const keys = rows.map((r) => r.key);
    expect(keys).toEqual(["suspect", "prospect", "negociere", "comanda", "pierdut"]);
    // Leadul pierdut NU umflă „au ajuns la Suspect" — nu știm de unde a căzut dacă n-are tranziții.
    expect(row(rows, "suspect").reached).toBe(1);
    expect(row(rows, "pierdut").currentCount).toBe(1);
  });

  it("[blocant] un lead pierdut CU tranziții se numără la etapa până la care a ajuns", () => {
    const changes: StageChange[] = [
      { leadId: "b", from: "suspect", to: "negociere" },
      { leadId: "b", from: "negociere", to: "pierdut" },
    ];
    const rows = funnelBreakdown([lead("a", "prospect"), lead("b", "pierdut")], STAGES, changes);

    expect(row(rows, "negociere").reached).toBe(1);
    // Și se vede că s-a oprit acolo: n-a avansat la Comandă.
    expect(row(rows, "negociere").dropRatePct).toBe(100);
  });
});

describe("Rata de cădere", () => {
  it("[blocant] căderea e câți s-au oprit aici, în procente din câți au ajuns", () => {
    // 10 la Suspect, dintre care 4 ajung la Prospect → 60% cădere la Suspect.
    const leads = [
      ...Array.from({ length: 6 }, (_, i) => lead(`s${i}`, "suspect")),
      ...Array.from({ length: 4 }, (_, i) => lead(`p${i}`, "prospect")),
    ];
    const rows = funnelBreakdown(leads, STAGES, []);

    expect(row(rows, "suspect").reached).toBe(10);
    expect(row(rows, "suspect").advanced).toBe(4);
    expect(row(rows, "suspect").dropped).toBe(6);
    expect(row(rows, "suspect").dropRatePct).toBe(60);
    expect(row(rows, "suspect").conversionPct).toBe(40);
  });

  it("[blocant] etapa CÂȘTIGATĂ are căderea 0 — ce a ajuns acolo a ajuns", () => {
    const rows = funnelBreakdown([lead("a", "comanda")], STAGES, []);
    expect(row(rows, "comanda").dropRatePct).toBe(0);
    expect(row(rows, "comanda").conversionPct).toBe(100);
  });

  it("o etapă fără niciun lead nu produce împărțire la zero", () => {
    const rows = funnelBreakdown([], STAGES, []);
    for (const r of rows.filter((x) => !x.isLost)) {
      expect(r.dropRatePct).toBe(0);
      expect(Number.isFinite(r.dropRatePct)).toBe(true);
    }
  });
});

describe("Banii pe etapă", () => {
  it("[blocant] valoarea unei etape e suma oportunităților care stau ACUM în ea", () => {
    const rows = funnelBreakdown(
      [lead("a", "negociere", 50_000_00), lead("b", "negociere", 30_000_00), lead("c", "suspect", 10_000_00)],
      STAGES,
      []
    );
    expect(row(rows, "negociere").currentValueCents).toBe(80_000_00);
    expect(row(rows, "suspect").currentValueCents).toBe(10_000_00);
  });

  it("[blocant] valoarea ponderată folosește probabilitatea LEAD-ului când o are, nu doar pe a etapei", () => {
    // Două afaceri în aceeași etapă nu au aceeași șansă — de aceea leadul poate avea a lui.
    const rows = funnelBreakdown(
      [
        lead("a", "negociere", 100_000_00), // fără probabilitate proprie → 60% de la etapă
        lead("b", "negociere", 100_000_00, { probabilityPct: 90 }),
      ],
      STAGES,
      []
    );
    expect(row(rows, "negociere").weightedValueCents).toBe(60_000_00 + 90_000_00);
  });
});

describe("Pâlnia pe agent", () => {
  it("[blocant] arată DOAR leadurile agentului, cu tranzițiile lor", () => {
    const leads = [
      lead("a", "negociere", 10_000_00, { assignedTo: "ana" }),
      lead("b", "suspect", 20_000_00, { assignedTo: "bo" }),
      lead("c", "prospect", 30_000_00, { assignedTo: "ana" }),
    ];
    const rows = funnelByOwner(leads, STAGES, [], "ana");

    expect(row(rows, "suspect").reached).toBe(2);
    expect(row(rows, "negociere").reached).toBe(1);
    expect(row(rows, "suspect").currentCount).toBe(0); // niciunul AL ANEI nu stă în Suspect
    expect(rows.reduce((s, r) => s + r.currentValueCents, 0)).toBe(40_000_00);
  });
});
