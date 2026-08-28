/**
 * FX-001: pagina „Curs valutar" — cursul zilei, convertorul și avertismentul de curs vechi.
 *
 * Ce blochează testele: convertorul trebuie să CALCULEZE (nu doar să se randeze), inclusiv
 * cross-rate-ul dintre două valute străine, care trece prin leu; iar cursul aplicat pentru o zi
 * fără publicare trebuie să spună explicit din ce zi provine — altfel omul citește un număr
 * vechi crezând că e de azi.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParExchange } from "../ParExchange";
import * as fxApi from "@/lib/api/parFx";
import type { FxRate } from "@/lib/api/parFx";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/exchange", navigate: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/business/BusinessShell", () => ({
  BusinessShell: ({ children, pageTitle }: { children: React.ReactNode; pageTitle?: React.ReactNode }) => (
    <div data-testid="business-shell">
      {pageTitle ? <h1>{pageTitle}</h1> : null}
      {children}
    </div>
  ),
}));

// recharts măsoară containerul, iar jsdom raportează 0×0 — graficul nu e subiectul acestor teste.
vi.mock("recharts", () => {
  const Noop = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Noop,
    LineChart: Noop,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
  };
});

const rate = (code: string, name: string, mdl: number, nominal = 1): FxRate => ({
  code,
  name,
  nominal,
  value: mdl * nominal,
  mdl_per_unit: mdl,
  previous_mdl_per_unit: mdl - 0.1,
  change: 0.1,
  change_pct: 0.5,
  pinned: ["EUR", "USD", "RON"].includes(code),
});

const RATES = [rate("EUR", "Euro", 20.1), rate("USD", "Dolar S.U.A.", 17.28), rate("RON", "Leu romanesc", 3.83)];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(fxApi, "getFxSeries").mockResolvedValue({
    codes: ["EUR", "USD"],
    from: "2026-07-30",
    to: "2026-08-28",
    step_days: 1,
    partial: false,
    points: [],
  });
  vi.spyOn(fxApi, "getFxRates").mockResolvedValue({
    requested_date: "2026-08-28",
    effective_date: "2026-08-28",
    is_stale: false,
    base: "MDL",
    source: "BNM",
    source_url: "https://www.bnm.md/ro/official_exchange_rates",
    rates: RATES,
  });
});

describe("ParExchange", () => {
  it("afișează cursul zilei pentru EUR și USD", async () => {
    render(<ParExchange />);
    await waitFor(() => expect(screen.getAllByText("EUR").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/20,1000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/17,2800/).length).toBeGreaterThan(0);
  });

  it("pune steagul lângă fiecare valută", async () => {
    render(<ParExchange />);
    await waitFor(() => expect(screen.getAllByText("EUR").length).toBeGreaterThan(0));
    // Steagul e decorativ, dar prezența lui e ce a cerut owner-ul — deci o verificăm.
    expect(screen.getAllByText("🇪🇺").length).toBeGreaterThan(0);
    expect(screen.getAllByText("🇺🇸").length).toBeGreaterThan(0);
    expect(screen.getAllByText("🇷🇴").length).toBeGreaterThan(0);
  });

  it("calculează conversia implicită EUR → MDL", async () => {
    render(<ParExchange />);
    // 100 EUR × 20,10 = 2.010,00 MDL
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2.010,00 MDL"));
  });

  it("recalculează la schimbarea sumei", async () => {
    const user = userEvent.setup();
    render(<ParExchange />);
    await waitFor(() => expect(screen.getByLabelText("Sumă")).toBeInTheDocument());
    const amount = screen.getByLabelText("Sumă");
    await user.clear(amount);
    await user.type(amount, "50");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1.005,00 MDL"));
  });

  it("face cross-rate între două valute străine (EUR → USD, prin leu)", async () => {
    const user = userEvent.setup();
    render(<ParExchange />);
    await waitFor(() => expect(screen.getByLabelText("În")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("În"), "USD");
    // 100 × (20,10 / 17,28) = 116,32 USD
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("116,32 USD"));
  });

  it("inversează valutele din buton", async () => {
    const user = userEvent.setup();
    render(<ParExchange />);
    await waitFor(() => expect(screen.getByLabelText("Din")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Inversează valutele" }));
    expect(screen.getByLabelText("Din")).toHaveValue("MDL");
    expect(screen.getByLabelText("În")).toHaveValue("EUR");
  });

  it("cere de la server perioada aleasă din chips", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(fxApi, "getFxSeries").mockResolvedValue({
      codes: ["EUR", "USD"],
      from: "2023-08-29",
      to: "2026-08-28",
      step_days: 9,
      partial: false,
      points: [],
    });
    render(<ParExchange />);
    await waitFor(() => expect(screen.getByRole("button", { name: "3 ani" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "3 ani" }));

    await waitFor(() => {
      const last = spy.mock.calls[spy.mock.calls.length - 1];
      const range = last?.[1] as { from?: string; to?: string } | undefined;
      expect(range?.from).toBeDefined();
      // ~3 ani în urmă, nu 30 de zile.
      const spanDays = (Date.parse(range!.to!) - Date.parse(range!.from!)) / 86_400_000;
      expect(spanDays).toBeGreaterThan(1000);
    });
  });

  it("permite un interval propriu, cu două date", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(fxApi, "getFxSeries");
    render(<ParExchange />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Interval" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Interval" }));

    // `<input type="date">` nu se completează prin tastare în jsdom — se schimbă valoarea direct.
    fireEvent.change(screen.getByLabelText("De la"), { target: { value: "2024-01-15" } });

    await waitFor(() => {
      const last = spy.mock.calls[spy.mock.calls.length - 1];
      expect((last?.[1] as { from?: string })?.from).toBe("2024-01-15");
    });
  });

  it("explică eșantionarea când perioada e lungă", async () => {
    vi.spyOn(fxApi, "getFxSeries").mockResolvedValue({
      codes: ["EUR", "USD"],
      from: "2023-08-29",
      to: "2026-08-28",
      step_days: 9,
      partial: false,
      points: [{ date: "2026-08-28", rates: { EUR: 20.1, USD: 17.28 } }],
    });
    render(<ParExchange />);
    await waitFor(() => expect(screen.getByText(/un punct la 9 zile/i)).toBeInTheDocument());
  });

  it("spune din ce zi provine cursul când ziua cerută n-are publicare", async () => {
    vi.spyOn(fxApi, "getFxRates").mockResolvedValue({
      requested_date: "2026-08-30",
      effective_date: "2026-08-28",
      is_stale: true,
      base: "MDL",
      source: "BNM",
      source_url: "https://www.bnm.md/ro/official_exchange_rates",
      rates: RATES,
    });
    render(<ParExchange />);
    const banner = await screen.findByText(/nu a publicat un curs nou/i);
    // Ambele zile sunt numite: cea cerută și cea al cărei curs se aplică de fapt.
    expect(banner.textContent).toContain("30 august 2026");
    expect(banner.textContent).toContain("28 august 2026");
  });

  it("arată o eroare lizibilă când BNM nu răspunde", async () => {
    vi.spyOn(fxApi, "getFxRates").mockRejectedValue(new Error("503"));
    render(<ParExchange />);
    await waitFor(() => expect(screen.getByText(/Nu am putut prelua cursul de la BNM/i)).toBeInTheDocument());
  });
});

describe("pctDisplay", () => {
  it("nu arată „−0,00%” pentru o mișcare invizibilă la două zecimale", () => {
    // GBP a scăzut cu 0,0008 lei = -0,004%. La precizia afișată nu s-a mișcat.
    const p = fxApi.pctDisplay(-0.0034);
    expect(p.text).toBe("0,00%");
    expect(p.dir).toBe(0);
  });

  it("păstrează semnul pentru o mișcare reală", () => {
    expect(fxApi.pctDisplay(0.09).text).toBe("+0,09%");
    expect(fxApi.pctDisplay(0.09).dir).toBe(1);
    expect(fxApi.pctDisplay(-0.4).dir).toBe(-1);
  });

  it("fără zi precedentă nu inventează o variație", () => {
    expect(fxApi.pctDisplay(null).text).toBe("—");
  });
});
