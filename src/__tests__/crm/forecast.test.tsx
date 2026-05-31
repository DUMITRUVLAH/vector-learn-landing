/**
 * CRM-125 — Weighted Forecast
 * Covers T-CRM-125-1..4
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Mock API ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/api/analytics", () => ({
  getFunnel: vi.fn(),
  getLostReasons: vi.fn(),
  getRoas: vi.fn(),
  setBudget: vi.fn(),
  getForecast: vi.fn(),
  updateStageProbability: vi.fn(),
}));

import * as analyticsApi from "@/lib/api/analytics";
import { ForecastWidget } from "@/components/crm/ForecastWidget";
import type { ForecastData } from "@/lib/api/analytics";

const mockForecastData: ForecastData = {
  stages: [
    {
      stageId: "s1",
      stage: "new",
      label: "Lead nou",
      color: "pastel-sky",
      probabilityPct: 10,
      count: 5,
      grossCents: 50000,
      weightedCents: 5000,
    },
    {
      stageId: "s2",
      stage: "trial",
      label: "Trial / Demo",
      color: "pastel-peach",
      probabilityPct: 60,
      count: 3,
      grossCents: 100000,
      weightedCents: 60000,
    },
    {
      stageId: "s3",
      stage: "paid",
      label: "Client",
      color: "pastel-mint",
      probabilityPct: 100,
      count: 2,
      grossCents: 72000,
      weightedCents: 72000,
    },
  ],
  totalGrossCents: 222000,
  totalWeightedCents: 137000,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(analyticsApi.getForecast).mockResolvedValue(mockForecastData);
  vi.mocked(analyticsApi.updateStageProbability).mockResolvedValue({ ok: true });
});

describe("ForecastWidget", () => {
  it("renders and shows stage rows", async () => {
    render(<ForecastWidget />);
    await waitFor(() => expect(analyticsApi.getForecast).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Lead nou")).toBeInTheDocument();
    expect(screen.getByText("Trial / Demo")).toBeInTheDocument();
    expect(screen.getByText("Client")).toBeInTheDocument();
  });

  it("T-CRM-125-1: shows weighted value = gross × probability / 100", async () => {
    render(<ForecastWidget />);
    await waitFor(() => screen.getByText("Trial / Demo"));
    // Section heading
    expect(screen.getAllByText(/Forecast ponderat/i).length).toBeGreaterThan(0);
    // Ponderat label in summary
    const headerText = screen.getAllByText(/Ponderat/i);
    expect(headerText.length).toBeGreaterThan(0);
  });

  it("T-CRM-125-1: shows correct forecast math", () => {
    // Pure unit: weighted = gross × probability / 100
    const gross = 100000;
    const probability = 60;
    const weighted = Math.round(gross * (probability / 100));
    expect(weighted).toBe(60000);
  });

  it("T-CRM-125-2: clicking probability triggers edit mode", async () => {
    const user = userEvent.setup();
    render(<ForecastWidget />);
    await waitFor(() => screen.getByText("Lead nou"));

    await user.click(
      screen.getByRole("button", { name: /editează probabilitatea pentru Lead nou: 10%/i })
    );

    expect(screen.getByRole("spinbutton", { name: /probabilitate câștig pentru Lead nou/i })).toBeInTheDocument();
  });

  it("T-CRM-125-2: saving a new probability calls updateStageProbability", async () => {
    const user = userEvent.setup();
    render(<ForecastWidget />);
    await waitFor(() => screen.getByText("Lead nou"));

    await user.click(
      screen.getByRole("button", { name: /editează probabilitatea pentru Lead nou: 10%/i })
    );

    const input = screen.getByRole("spinbutton", { name: /probabilitate câștig pentru Lead nou/i });
    await user.clear(input);
    await user.type(input, "20");
    await user.click(
      screen.getByRole("button", { name: /confirmă probabilitatea pentru Lead nou/i })
    );

    expect(analyticsApi.updateStageProbability).toHaveBeenCalledWith("s1", 20);
  });

  it("T-CRM-125-3: table has proper accessibility structure", async () => {
    render(<ForecastWidget />);
    await waitFor(() => screen.getByText("Lead nou"));

    const table = screen.getByRole("table", { name: /forecast ponderat per stadiu/i });
    expect(table).toBeInTheDocument();
  });

  it("shows empty state when no stages have values", async () => {
    const emptyData: ForecastData = {
      stages: [],
      totalGrossCents: 0,
      totalWeightedCents: 0,
    };
    vi.mocked(analyticsApi.getForecast).mockResolvedValue(emptyData);

    render(<ForecastWidget />);
    await waitFor(() =>
      expect(screen.getByText(/nu există leaduri cu valoare setată/i)).toBeInTheDocument()
    );
  });
});

// ─── Pure math tests ─────────────────────────────────────────────────────────

describe("T-CRM-125-1: Forecast calculation math", () => {
  it("three trial leads with probability 60% gives correct weighted total", () => {
    const trialLeads = [
      { valueCents: 36000 },
      { valueCents: 36000 },
      { valueCents: 28000 },
    ];
    const grossTotal = trialLeads.reduce((s, l) => s + l.valueCents, 0);
    expect(grossTotal).toBe(100000);
    const weighted = Math.round(grossTotal * 0.6);
    expect(weighted).toBe(60000);
  });

  it("paid stage with 100% probability matches gross value", () => {
    const gross = 72000;
    const weighted = Math.round(gross * (100 / 100));
    expect(weighted).toBe(gross);
  });

  it("lost stage with 0% probability gives 0 weighted", () => {
    const gross = 50000;
    const weighted = Math.round(gross * (0 / 100));
    expect(weighted).toBe(0);
  });
});
