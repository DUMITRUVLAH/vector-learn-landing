/**
 * NAV-05 — ecranul de start FinDesk.
 *
 * Bugul de produs: 13 din 15 carduri apăreau gri, „În curând", deși modulele existau. Testele fixează
 * că ecranul arată ce e urgent, cifrele reale și toate modulele active, pe grupe — și că regula de
 * urgență (depășit întâi, apoi ce vine în 14 zile) nu derivă.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { FinObligation } from "@/lib/api/finCalendar";

vi.mock("@/router/HashRouter", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ path: "/business/fin/", navigate: vi.fn() }),
}));
// Shell-ul are testele lui; aici contează conținutul paginii.
vi.mock("../FinLayout", () => ({
  FinLayout: ({ children, pageTitle, actions }: { children: React.ReactNode; pageTitle?: string; actions?: React.ReactNode }) => (
    <main>
      <h1>{pageTitle}</h1>
      {actions}
      {children}
    </main>
  ),
}));
vi.mock("@/hooks/useEnabledModules", () => ({
  useEnabledModules: () => ({ enabled: ["findesk", "crm"], isEnabled: (k: string) => ["findesk", "crm"].includes(k), status: "resolved" }),
}));

const getFinMe = vi.fn();
const getFinAging = vi.fn();
const getFinMetrics = vi.fn();
const listCalendar = vi.fn();
vi.mock("@/lib/api/fin", () => ({ getFinMe: () => getFinMe() }));
vi.mock("@/lib/api/finInsight", () => ({ getFinAging: () => getFinAging(), getFinMetrics: () => getFinMetrics() }));
vi.mock("@/lib/api/finCalendar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/finCalendar")>();
  return { ...actual, listCalendar: () => listCalendar() };
});

import { FinHome } from "../FinHome";
import { buildTodos } from "@/lib/fin/finTodos";

function obligation(over: Partial<FinObligation>): FinObligation {
  return {
    id: "o1",
    tenantId: "t1",
    obligationType: "tva_md",
    description: null,
    periodYear: 2026,
    periodMonth: 8,
    dueDate: "2026-09-25",
    amountCents: 150_000,
    currency: "MDL",
    status: "pending",
    paidAt: null,
    declarationId: null,
    notes: null,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

const NO_AGING = { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0, total: 0 };

describe("buildTodos — regula de urgență", () => {
  it("[blocant] ce e depășit vine înaintea termenelor care urmează; ce e plătit nu apare", () => {
    const todos = buildTodos({
      today: "2026-09-26",
      aging: NO_AGING,
      obligations: [
        obligation({ id: "soon", dueDate: "2026-10-05", obligationType: "cnam" }),
        obligation({ id: "late", dueDate: "2026-09-25" }),
        obligation({ id: "paid", dueDate: "2026-09-20", status: "paid" }),
        obligation({ id: "far", dueDate: "2026-12-25" }),
      ],
    });
    expect(todos.map((t) => t.key)).toEqual(["late-late", "soon-soon"]);
    expect(todos[0].tone).toBe("danger");
    expect(todos[0].title).toContain("termen depășit");
  });

  it("[blocant] facturile restante de peste 30 de zile sunt urgente", () => {
    const [todo] = buildTodos({
      today: "2026-09-26",
      obligations: [],
      aging: { "0_30": 100_00, "31_60": 500_00, "61_90": 0, "90_plus": 0, total: 600_00 },
    });
    expect(todo.tone).toBe("danger");
    expect(todo.href).toBe("/business/fin/invoices");
  });

  it("[normal] nimic restant, nimic aproape → listă goală", () => {
    expect(buildTodos({ today: "2026-09-26", obligations: [], aging: NO_AGING })).toEqual([]);
  });
});

describe("FinHome — ecranul de start", () => {
  beforeEach(() => {
    getFinMe.mockResolvedValue({ member: { role: "owner" }, profile: { legalName: "Vector SRL" } });
    getFinAging.mockResolvedValue({ aging: { "0_30": 0, "31_60": 250_000, "61_90": 0, "90_plus": 0, total: 250_000 } });
    getFinMetrics.mockResolvedValue({ metrics: [{ period: "2026-09", revenue: 1_000_000, receivable: 300_000, profit: 400_000 }] });
    listCalendar.mockResolvedValue({ obligations: [], locked_periods: [] });
  });

  it("[blocant] niciun modul nu mai e marcat „În curând”", async () => {
    render(<FinHome />);
    expect(await screen.findByRole("heading", { name: "Vector SRL" })).toBeInTheDocument();
    expect(screen.queryByText(/în curând/i)).not.toBeInTheDocument();
  });

  it("[blocant] modulele apar pe grupele meniului, cu grupa fiscală cerută de owner", async () => {
    render(<FinHome />);
    const map = await screen.findByRole("region", { name: "Module FinDesk" });
    expect(within(map).getByText("Fiscal & conformitate")).toBeInTheDocument();
    for (const label of ["Facturi", "TVA & declarații", "Salarizare", "Calendar fiscal", "Reconciliere & TVA import"]) {
      // Numele linkului = eticheta + descrierea, deci ancorăm la început („Facturi" ≠ „Invoice Reporting — facturi primite").
      expect(within(map).getByRole("link", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })).toBeInTheDocument();
    }
    // CRM e pornit: contractele stau acolo, nu aici.
    expect(within(map).queryByRole("link", { name: /^Contracte/ })).not.toBeInTheDocument();
  });

  it("[blocant] restanța reală ajunge în „De făcut acum” și în cifre", async () => {
    render(<FinHome />);
    expect(await screen.findByText(/Facturi restante: L 2 500/)).toBeInTheDocument();
    expect(screen.getByText(/peste 30 de zile/, { selector: "span" })).toBeInTheDocument();
  });

  it("[blocant] „Factură nouă” deschide direct formularul de factură", async () => {
    render(<FinHome />);
    const cta = await screen.findAllByRole("link", { name: /Factură nouă|Emite o factură/ });
    expect(cta.every((a) => a.getAttribute("href") === "#/business/fin/invoices?nou=1")).toBe(true);
  });

  it("[normal] firmă neconfigurată → banner de configurare, nu cifre goale fără explicație", async () => {
    getFinMe.mockResolvedValue({ member: { role: "owner" }, profile: null });
    render(<FinHome />);
    expect(await screen.findByText(/Configurează firma ca să emiți prima factură/)).toBeInTheDocument();
  });

  it("[normal] profitul negativ are un singur semn minus", async () => {
    getFinMetrics.mockResolvedValue({ metrics: [{ period: "2026-09", revenue: 0, receivable: 0, profit: -50_000 }] });
    render(<FinHome />);
    expect(await screen.findByText("Profit: -L 500")).toBeInTheDocument();
  });

  it("[normal] un API picat nu dărâmă restul ecranului", async () => {
    getFinAging.mockRejectedValue(new Error("500"));
    render(<FinHome />);
    expect(await screen.findByRole("region", { name: "Module FinDesk" })).toBeInTheDocument();
    expect(await screen.findByText("Venit luna aceasta")).toBeInTheDocument();
  });
});
