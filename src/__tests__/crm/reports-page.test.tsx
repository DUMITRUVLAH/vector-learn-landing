/**
 * CRM — ecranul de rapoarte.
 *
 * Trei lucruri care erau rupte și pe care testele nu le prindeau, fiindcă TypeScript verifică
 * tipul DECLARAT, nu ce vine pe fir: tabelele citeau câmpuri inexistente (`entered`, `ratePct`,
 * `productName`, `wonValueCents`) și afișau „undefined%" în producție.
 *
 * Plus cele două cerințe din caietul de sarcini care lipseau: perioada aleasă de utilizator
 * (57) și exportul PDF (58).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmReportsResponse } from "@/lib/api/crmReports";

beforeEach(() => {
  vi.clearAllMocks();
  getCrmReportLayout.mockResolvedValue({ layout: null });
});

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: { user: { id: "u1", name: "Admin", role: "owner" }, tenant: { name: "Ecosolar", slug: "eco", appKind: "business" } },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/rapoarte", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
}));

// Graficele nu se randează în jsdom (recharts are nevoie de dimensiuni reale) — le înlocuim cu
// marcaje, ca testul să verifice CE date primesc, nu cum arată.
vi.mock("@/components/crm/ReportsCharts", () => ({
  TrendChart: ({ points, label }: { points: unknown[]; label: string }) => (
    <div data-testid="timeline">
      {label}: {points.length} puncte
    </div>
  ),
  WonLostChart: ({ points }: { points: unknown[] }) => <div data-testid="won-lost">{points.length}</div>,
}));

const downloadCrmReportPdf = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/crmReportPdf", () => ({
  downloadCrmReportPdf: (...a: unknown[]) => downloadCrmReportPdf(...a),
}));

const getCrmReports = vi.fn();
const getCrmReportLayout = vi.fn().mockResolvedValue({ layout: null });
const saveCrmReportLayout = vi.fn().mockImplementation(async (layout: unknown) => ({ layout, saved: true }));
vi.mock("@/lib/api/crmReports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/crmReports")>();
  return {
    ...actual,
    getCrmReports: (...a: unknown[]) => getCrmReports(...a),
    getCrmReportLayout: (...a: unknown[]) => getCrmReportLayout(...a),
    saveCrmReportLayout: (...a: unknown[]) => saveCrmReportLayout(...a),
  };
});

const { CrmReportsPage } = await import("@/pages/business/crm/CrmReportsPage");

function makeReports(): CrmReportsResponse {
  return {
    range: { from: null, to: null },
    owner: null,
    stages: [],
    owners: [{ id: "u1", name: "Ana Ionescu" }],
    kpis: {
      leadsAllocated: 12,
      callsMade: 30,
      successfulContacts: 18,
      meetings: 4,
      offersSent: 7,
      contractsSigned: 3,
      salesValueCents: 1_250_00,
      tasksDone: 9,
      tasksOverdue: 2,
    },
    conversion: [
      { fromKey: "contacted", fromLabel: "Contactat", toKey: "oferta", toLabel: "Ofertă transmisă", reached: 10, advanced: 7, conversionPct: 70 },
    ],
    cycleDays: 12.4,
    perOwner: [
      {
        ownerKey: "u1",
        ownerName: "Ana Ionescu",
        leadsAllocated: 12,
        callsMade: 30,
        successfulContacts: 18,
        meetings: 4,
        offersSent: 7,
        contractsSigned: 3,
        salesValueCents: 1_250_00,
        tasksDone: 9,
        tasksOverdue: 2,
      },
    ],
    perProduct: [{ product: "Panouri 10kW", total: 8, won: 3, lost: 2, valueCents: 900_00, winRatePct: 60 }],
    lostReasons: [{ reason: "Preț prea mare", count: 4, valueCents: 400_00, pct: 57 }],
    taskCompliance: { done: 9, overdue: 2, openNotYetDue: 3, totalPct: 64 },
    timeline: [
      { bucket: "2026-09-01", leadsCreated: 5, offersSent: 2, contractsSigned: 1, salesValueCents: 500_00 },
      { bucket: "2026-09-02", leadsCreated: 7, offersSent: 5, contractsSigned: 2, salesValueCents: 750_00 },
    ],
    bucketSize: "day",
    pipelineId: "p1",
    pipelines: [
      { id: "p1", name: "Vânzări", isDefault: true },
      { id: "p2", name: "Cursuri", isDefault: false },
    ],
    outcomes: { newLeads: 12, wonCount: 3, wonValueCents: 1_250_00, lostCount: 1, lostValueCents: 90_00, winRatePct: 75, avgDealCents: 41_667 },
    previous: {
      range: { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" },
      kpis: {
        leadsAllocated: 10, callsMade: 20, successfulContacts: 10, meetings: 2, offersSent: 3,
        contractsSigned: 2, salesValueCents: 1_000_00, tasksDone: 4, tasksOverdue: 1,
      },
      outcomes: { newLeads: 10, wonCount: 2, wonValueCents: 1_000_00, lostCount: 2, lostValueCents: 50_00, winRatePct: 50, avgDealCents: 50_000 },
      cycleDays: 10,
    },
    funnel: [
      { key: "new", label: "Lead nou", color: null, isWon: false, isLost: false, currentCount: 4, currentValueCents: 100_00, weightedValueCents: 10_00, reached: 10, advanced: 7, dropped: 3, dropRatePct: 30, conversionPct: 70 },
      { key: "client", label: "Client", color: null, isWon: true, isLost: false, currentCount: 3, currentValueCents: 1_250_00, weightedValueCents: 1_250_00, reached: 7, advanced: 7, dropped: 0, dropRatePct: 0, conversionPct: 100 },
    ],
    velocity: [{ key: "new", avgDays: 3.5, samples: 4 }],
    sources: [{ source: "referral", leads: 5, won: 2, lost: 1, open: 2, wonValueCents: 800_00, winRatePct: 67 }],
    aging: {
      buckets: [{ key: "fresh", label: "0–7 zile", count: 2, valueCents: 50_00 }],
      stale: [{ id: "lead-9", title: "Alfa Logistic SRL", stage: "new", valueCents: 480_00, daysIdle: 21, assignedTo: "u1" }],
      staleCount: 1,
    },
    leaderboard: [{ ownerKey: "u1", wonCount: 3, wonValueCents: 1_250_00, lostCount: 1, winRatePct: 75, avgDealCents: 41_667, openCount: 4, openValueCents: 100_00 }],
    dimensions: [
      {
        key: "source",
        label: "Sursă",
        kind: "builtin",
        rows: [
          { value: "referral", leads: 5, won: 2, lost: 1, open: 2, wonValueCents: 800_00, conversionPct: 40, winRatePct: 67 },
          { value: "facebook_ad", leads: 4, won: 0, lost: 2, open: 2, wonValueCents: 0, conversionPct: 0, winRatePct: 0 },
        ],
      },
      {
        key: "product",
        label: "Produs",
        kind: "builtin",
        rows: [{ value: "Panouri 10kW", leads: 8, won: 3, lost: 2, open: 3, wonValueCents: 900_00, conversionPct: 38, winRatePct: 60 }],
      },
      {
        key: "cf_oras",
        label: "Oraș",
        kind: "custom",
        rows: [
          { value: "Chișinău", leads: 6, won: 3, lost: 1, open: 2, wonValueCents: 1_000_00, conversionPct: 50, winRatePct: 75 },
          { value: "Bălți", leads: 3, won: 0, lost: 2, open: 1, wonValueCents: 0, conversionPct: 0, winRatePct: 0 },
        ],
      },
    ],
    insights: [
      { kind: "topSeller", tone: "positive", ownerKey: "u1", wonValueCents: 1_250_00, wonCount: 3, sharePct: 80, sellers: 2 },
      {
        kind: "segmentSpread",
        tone: "neutral",
        dimension: "source",
        dimensionLabel: "Sursă",
        dimensionKind: "builtin",
        best: { value: "referral", conversionPct: 40, leads: 5, won: 2, wonValueCents: 800_00 },
        worst: { value: "facebook_ad", conversionPct: 0, leads: 4, won: 0, wonValueCents: 0 },
      },
      {
        kind: "segmentSpread",
        tone: "neutral",
        dimension: "cf_oras",
        dimensionLabel: "Oraș",
        dimensionKind: "custom",
        best: { value: "Chișinău", conversionPct: 50, leads: 6, won: 3, wonValueCents: 1_000_00 },
        worst: { value: "Bălți", conversionPct: 0, leads: 3, won: 0, wonValueCents: 0 },
      },
    ],
  };
}

describe("Tabelele arată cifre, nu „undefined”", () => {
  it("[blocant] pâlnia, produsele și pierderile citesc câmpurile REALE ale serverului", async () => {
    getCrmReports.mockResolvedValue(makeReports());

    render(<CrmReportsPage />);
    // Pâlnia e desenată implicit; tabelul cu zilele în etapă e la un click.
    fireEvent.click(await screen.findByRole("button", { name: "Tabel" }));
    await screen.findByRole("table", { name: "Pâlnia pe etape" });

    // Pâlnia: `conversionPct` pe etapa deschisă; etapa câștigată nu „trece mai departe".
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("etapa finală")).toBeInTheDocument();
    // Timpul petrecut în etapă vine din `velocity`.
    expect(screen.getByText("3,5")).toBeInTheDocument();
    // Pierderi: numărul și procentul.
    expect(screen.getByText("4 · 57%")).toBeInTheDocument();

    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
    expect(screen.queryByText("undefined%")).not.toBeInTheDocument();
  });

  it("[blocant] evoluția perioadei ajunge la grafic", async () => {
    getCrmReports.mockResolvedValue(makeReports());

    render(<CrmReportsPage />);

    expect(await screen.findByTestId("timeline")).toHaveTextContent("Vânzări: 2 puncte");
  });
});

describe("Cerința 57 — perioada aleasă de utilizator", () => {
  it("[blocant] „Interval ales” cere serverului exact zilele alese, cu ultima zi inclusă", async () => {
    getCrmReports.mockResolvedValue(makeReports());

    render(<CrmReportsPage />);
    await screen.findByTestId("timeline");

    fireEvent.change(screen.getByLabelText("Perioadă"), { target: { value: "custom" } });
    fireEvent.change(await screen.findByLabelText("De la"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Până la"), { target: { value: "2026-09-30" } });

    await waitFor(() => {
      const last = getCrmReports.mock.calls.at(-1)?.[0] as { from: string; to: string };
      expect(new Date(last.from).getDate()).toBe(1);
      // Intervalul e [from, to): 30 septembrie se include mutând limita la 1 octombrie.
      expect(new Date(last.to).getDate()).toBe(1);
      expect(new Date(last.to).getMonth()).toBe(9); // octombrie
    });
  });
});

describe("Cerința 58 — export Excel și PDF", () => {
  it("[blocant] PDF-ul primește cifrele de pe ecran, cu perioada și agentul în antet", async () => {
    getCrmReports.mockResolvedValue(makeReports());

    render(<CrmReportsPage />);
    await screen.findByTestId("timeline");

    fireEvent.click(screen.getByRole("button", { name: /Export PDF/i }));

    await waitFor(() => expect(downloadCrmReportPdf).toHaveBeenCalled());
    const [input] = downloadCrmReportPdf.mock.calls[0] as [
      { orgName: string; periodLabel: string; ownerLabel: string; kpis: { label: string; value: string }[]; tables: { title: string }[] },
    ];
    expect(input.orgName).toBe("Ecosolar");
    expect(input.ownerLabel).toBe("toată echipa · pâlnia Vânzări");
    expect(input.periodLabel).toBe("luna aceasta");
    expect(input.kpis.find((k) => k.label === "Contracte semnate")?.value).toBe("3");
    expect(input.kpis.find((k) => k.label === "Rata de câștig")?.value).toBe("75%");
    expect(input.tables.map((t) => t.title)).toEqual([
      "Ce spun cifrele",
      "Pâlnia",
      "Conversie pe sursă",
      "Echipa",
      "De ce pierdem",
      "Afaceri în stagnare",
      "Pe produs",
    ]);
  });

  it("[normal] butonul de Excel rămâne acolo — cerința cere ambele formate", async () => {
    getCrmReports.mockResolvedValue(makeReports());

    render(<CrmReportsPage />);

    expect(await screen.findByRole("button", { name: /Export Excel/i })).toBeInTheDocument();
  });
});

describe("CRM-G02 — raportul unui CRM de vânzări", () => {
  it("[blocant] plăcuțele arată variația față de perioada precedentă", async () => {
    getCrmReports.mockResolvedValue(makeReports());
    render(<CrmReportsPage />);

    const winRate = await screen.findByRole("tab", { name: /Rata de câștig/ });
    // 75% acum față de 50% înainte: +25 puncte procentuale, crește.
    expect(winRate).toHaveTextContent("75%");
    expect(winRate).toHaveTextContent("crește cu");
    expect(winRate).toHaveTextContent("25 pp");
    // Vânzări 1.250 față de 1.000: +25%.
    expect(screen.getByRole("tab", { name: /Vânzări/ })).toHaveTextContent("25%");
  });

  it("[blocant] click pe o plăcuță schimbă metrica din grafic", async () => {
    getCrmReports.mockResolvedValue(makeReports());
    render(<CrmReportsPage />);

    fireEvent.click(await screen.findByRole("tab", { name: /Leaduri noi/ }));
    expect(screen.getByTestId("timeline")).toHaveTextContent("Leaduri noi");
    expect(screen.getByRole("tab", { name: /Leaduri noi/ })).toHaveAttribute("aria-selected", "true");
  });

  it("[blocant] o afacere în stagnare duce direct la fișa ei", async () => {
    getCrmReports.mockResolvedValue(makeReports());
    render(<CrmReportsPage />);

    const link = await screen.findByRole("link", { name: "Alfa Logistic SRL" });
    expect(link).toHaveAttribute("href", "#/business/crm/pipeline?lead=lead-9");
  });

  it("[blocant] alegerea pâlniei reface cererea pe pâlnia aleasă", async () => {
    getCrmReports.mockResolvedValue(makeReports());
    render(<CrmReportsPage />);

    fireEvent.change(await screen.findByLabelText("Pâlnia"), { target: { value: "p2" } });
    await waitFor(() => {
      const last = getCrmReports.mock.calls.at(-1)?.[0] as { pipelineId?: string | null };
      expect(last.pipelineId).toBe("p2");
    });
  });

  it("[normal] sursele se afișează cu numele lor, nu cu cheia din bază", async () => {
    getCrmReports.mockResolvedValue(makeReports());
    render(<CrmReportsPage />);

    const table = await screen.findByRole("table", { name: "Conversie pe sursă" });
    expect(table).toHaveTextContent("Recomandare");
    expect(table).toHaveTextContent("67%");
  });
});

describe("CRM-G09 — pâlnia desenată, insighturi, personalizare", () => {
  it("[blocant] pâlnia se desenează implicit, cu etapele citibile de cititorul de ecran", async () => {
    getCrmReports.mockResolvedValue(makeReports());
    render(<CrmReportsPage />);

    const list = await screen.findByRole("list", { name: "Pâlnia Vânzări" });
    expect(list).toHaveTextContent("Lead nou: 10 au ajuns aici");
    expect(screen.queryByRole("table", { name: "Pâlnia pe etape" })).not.toBeInTheDocument();
  });

  it("[blocant] constatările numesc agentul și cea mai bună / cea mai slabă sursă, cu etichete omenești", async () => {
    getCrmReports.mockResolvedValue(makeReports());
    render(<CrmReportsPage />);

    const list = await screen.findByRole("list", { name: "Constatări" });
    expect(list).toHaveTextContent("Ana Ionescu a vândut cel mai mult");
    expect(list).toHaveTextContent("80% din vânzările echipei");
    expect(list).toHaveTextContent("Sursă: cea mai bună conversie o are Recomandare — 40% din 5 leaduri");
    expect(list).toHaveTextContent("Cea mai slabă: Facebook");
    expect(list).toHaveTextContent("Oraș: cea mai bună conversie o are Chișinău");
    expect(list).not.toHaveTextContent("facebook_ad");
  });

  it("[blocant] „Vezi pe oraș” comută raportul pe segment și salvează alegerea", async () => {
    getCrmReports.mockResolvedValue(makeReports());
    render(<CrmReportsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Vezi pe oraș" }));
    const table = await screen.findByRole("table", { name: "Conversie pe oraș" });
    expect(table).toHaveTextContent("Chișinău");
    expect(table).toHaveTextContent("cea mai bună");
    expect(table).toHaveTextContent("cea mai slabă");
    await waitFor(() => expect(saveCrmReportLayout).toHaveBeenCalled(), { timeout: 2000 });
    expect(saveCrmReportLayout.mock.calls.at(-1)?.[0]).toMatchObject({ segmentDimension: "cf_oras" });
  });

  it("[blocant] o secțiune ascunsă dispare și aranjamentul se salvează pe server", async () => {
    getCrmReports.mockResolvedValue(makeReports());
    render(<CrmReportsPage />);

    await screen.findByRole("table", { name: "Motivele pierderii" });
    fireEvent.click(screen.getByRole("button", { name: /Personalizează/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "De ce pierdem" }));

    expect(screen.queryByRole("table", { name: "Motivele pierderii" })).not.toBeInTheDocument();
    await waitFor(() => expect(saveCrmReportLayout).toHaveBeenCalled(), { timeout: 2000 });
    expect(saveCrmReportLayout.mock.calls.at(-1)?.[0]).toMatchObject({ hidden: ["lostReasons"] });
  });

  it("[blocant] aranjamentul salvat se aplică la deschidere: ordinea și plăcuțele ascunse", async () => {
    getCrmReportLayout.mockResolvedValue({
      layout: {
        // Serverul salvează mereu ordinea completă (vezi `serializeLayout`).
        order: ["team", "insights", "metrics", "wonLost", "funnel", "segments", "aging", "lostReasons", "activity", "calls"],
        hidden: [],
        hiddenMetrics: ["sales"],
      },
    });
    getCrmReports.mockResolvedValue(makeReports());
    const { container } = render(<CrmReportsPage />);

    await waitFor(() => {
      const ids = [...container.querySelectorAll("[id^='sectiune-']")].map((el) => el.id);
      expect(ids.slice(0, 2)).toEqual(["sectiune-team", "sectiune-insights"]);
    });
    expect(screen.queryByRole("tab", { name: /Vânzări/ })).not.toBeInTheDocument();
    // Graficul trece pe prima plăcuță vizibilă, nu rămâne pe una ascunsă.
    expect(screen.getByTestId("timeline")).toHaveTextContent("Afaceri câștigate");
  });

  it("[normal] mutarea unei secțiuni în sus schimbă ordinea pe ecran", async () => {
    getCrmReports.mockResolvedValue(makeReports());
    const { container } = render(<CrmReportsPage />);

    await screen.findByRole("list", { name: "Constatări" });
    fireEvent.click(screen.getByRole("button", { name: /Personalizează/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mută „Indicatori și evoluție\" mai sus" }));

    const ids = [...container.querySelectorAll("[id^='sectiune-']")].map((el) => el.id);
    expect(ids.slice(0, 2)).toEqual(["sectiune-metrics", "sectiune-insights"]);
  });
});
