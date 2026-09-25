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
vi.mock("@/lib/api/crmReports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/crmReports")>();
  return { ...actual, getCrmReports: (...a: unknown[]) => getCrmReports(...a) };
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
  };
}

describe("Tabelele arată cifre, nu „undefined”", () => {
  it("[blocant] pâlnia, produsele și pierderile citesc câmpurile REALE ale serverului", async () => {
    getCrmReports.mockResolvedValue(makeReports());

    render(<CrmReportsPage />);
    await screen.findByRole("table", { name: "Pâlnia pe etape" });

    // Pâlnia: `conversionPct` pe etapa deschisă; etapa câștigată nu „trece mai departe".
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("etapa finală")).toBeInTheDocument();
    // Timpul petrecut în etapă vine din `velocity`.
    expect(screen.getByText("3,5")).toBeInTheDocument();
    // Produs: `product` + `valueCents`, nu `productName`/`wonValueCents`.
    expect(screen.getByText("Panouri 10kW")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
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
      "Pâlnia",
      "Surse",
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

    const table = await screen.findByRole("table", { name: "Rezultate pe sursă" });
    expect(table).toHaveTextContent("Recomandare");
    expect(table).toHaveTextContent("67%");
  });
});
