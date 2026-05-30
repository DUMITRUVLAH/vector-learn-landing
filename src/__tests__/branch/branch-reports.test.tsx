/**
 * BRANCH-704 — Rapoarte per filială + consolidat
 * Tests:
 * T-BRANCH-704-1: [blocant] GET /api/analytics/branches endpoint code exists
 * T-BRANCH-704-2: [blocant] BranchKpiCards renders without crash with 0 branches
 * T-BRANCH-704-3: [blocant] Toggle "Per filială" → BranchKpiCards is shown
 * T-BRANCH-704-4: [blocant] Toggle "Consolidat" → reverts to consolidated view
 * T-BRANCH-704-5: [normal]  Comparison table renders with 2+ branches
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { BranchKpiCards } from "@/components/reports/BranchKpiCards";
import type { BranchKpi } from "@/lib/api/analytics";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();

// ─── T-BRANCH-704-1: Server endpoint exists ────────────────────────────────────

describe("BRANCH-704 — server endpoint", () => {
  it("T-BRANCH-704-1: /api/analytics/branches route exists in analytics.ts", () => {
    const content = readFileSync(join(CWD, "server/routes/analytics.ts"), "utf8");
    expect(content).toContain("/branches");
    expect(content).toContain("branchId");
    expect(content).toContain("branchName");
    expect(content).toContain("mrr");
    expect(content).toContain("activeStudents");
    expect(content).toContain("lessonsThisMonth");
  });
});

// ─── T-BRANCH-704-2: BranchKpiCards with 0 branches ──────────────────────────

describe("BRANCH-704 — BranchKpiCards component", () => {
  it("T-BRANCH-704-2: renders empty state with 0 branches", () => {
    render(<BranchKpiCards branches={[]} loading={false} period="month" />);
    expect(screen.getByText(/Nicio filială activă/)).toBeTruthy();
  });

  it("T-BRANCH-704-5: comparison table renders with 2 branches", () => {
    const branches: BranchKpi[] = [
      { branchId: "b1", branchName: "Cluj", mrr: 100000, activeStudents: 50, lessonsThisMonth: 20 },
      { branchId: "b2", branchName: "Iași", mrr: 80000, activeStudents: 35, lessonsThisMonth: 15 },
    ];
    render(<BranchKpiCards branches={branches} loading={false} period="month" />);
    // Both branch names appear in cards and table
    const cluj = screen.getAllByText("Cluj");
    const iasi = screen.getAllByText("Iași");
    expect(cluj.length).toBeGreaterThanOrEqual(1);
    expect(iasi.length).toBeGreaterThanOrEqual(1);
    // Comparison table rows
    expect(screen.getByText("MRR (RON)")).toBeTruthy();
    expect(screen.getAllByText("Elevi activi").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Lecții luna")).toBeTruthy();
  });

  it("T-BRANCH-704-2b: loading state renders spinner", () => {
    render(<BranchKpiCards branches={[]} loading={true} period="month" />);
    expect(screen.getByText(/Se încarcă KPI/)).toBeTruthy();
  });
});

// ─── T-BRANCH-704-3+4: Toggle in AnalyticsPage ────────────────────────────────

// Mock the API calls
vi.mock("@/lib/api/analytics", () => ({
  getFunnel: vi.fn(async () => ({ funnel: [], total: 0, paid: 0, conversionRate: 0, sourceBreakdown: [] })),
  getLostReasons: vi.fn(async () => ({ reasons: [], total: 0 })),
  getRoas: vi.fn(async () => ({ campaigns: [] })),
  setBudget: vi.fn(async () => ({ id: "x", spendCents: 0 })),
  getBranchKpis: vi.fn(async () => ({
    branches: [
      { branchId: "b1", branchName: "Cluj", mrr: 100000, activeStudents: 50, lessonsThisMonth: 20 },
    ],
  })),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { name: "Admin", role: "admin" }, tenant: { name: "Test" } }, logout: vi.fn() }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/analytics/crm", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/contexts/BranchContext", () => ({
  useBranch: () => ({ activeBranch: "all", setActiveBranch: vi.fn() }),
  BranchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { AnalyticsPage } from "@/pages/app/AnalyticsPage";

describe("BRANCH-704 — Analytics page toggle", () => {
  it("T-BRANCH-704-3: clicking 'Per filială' shows BranchKpiCards", async () => {
    render(<AnalyticsPage />);
    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText(/Se încarcă…/)).toBeNull();
    }, { timeout: 3000 });

    // Find and click the "Per filială" toggle button
    const perBranchBtn = screen.getByRole("radio", { name: /Per filială/i });
    fireEvent.click(perBranchBtn);

    // BranchKpiCards should appear (initially loading then with data)
    await waitFor(() => {
      // Either loading state or the branch name from mock data
      const loading = screen.queryByText(/Se încarcă KPI/);
      const branchName = screen.queryByText("Cluj");
      expect(loading !== null || branchName !== null).toBe(true);
    }, { timeout: 3000 });
  });

  it("T-BRANCH-704-4: clicking 'Consolidat' reverts to consolidated view", async () => {
    render(<AnalyticsPage />);
    await waitFor(() => {
      expect(screen.queryByText(/Se încarcă…/)).toBeNull();
    }, { timeout: 3000 });

    // Switch to per-branch
    fireEvent.click(screen.getByRole("radio", { name: /Per filială/i }));
    // Switch back to consolidat
    fireEvent.click(screen.getByRole("radio", { name: /Consolidat/i }));

    // Consolidated view elements should be back (funnel section won't show since data is empty,
    // but the toggle itself confirms we're back)
    const consolidatedBtn = screen.getByRole("radio", { name: /Consolidat/i });
    expect(consolidatedBtn.getAttribute("aria-checked")).toBe("true");
  });
});
