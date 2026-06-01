/**
 * CX-702 — Cohort board page tests
 *
 * T-CX-702-1 [blocant]: 3 cohorts (1 active, 1 upcoming, 1 past) → each tab shows count 1
 * T-CX-702-2 [blocant]: click on a cohort → header reflects selected course/edition
 * T-CX-702-3 [normal]:  upcoming cohort → widget shows "Începe în Nd", percent 0
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CohortTabs } from "../../components/modules/cx/CohortTabs";
import { CohortProgress } from "../../components/modules/cx/CohortProgress";
import type { Cohort } from "../../lib/api/cohorts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCohort(
  overrides: Partial<Cohort> & { id: string; category: "active" | "upcoming" | "past" }
): Cohort {
  return {
    tenantId: "tenant-1",
    courseId: "course-1",
    label: "Test Cohort",
    startDate: "2026-06-01",
    totalHours: 32,
    hoursPerSession: 2,
    scheduleDays: ["Tuesday", "Thursday"],
    isOnline: false,
    manualEndDate: null,
    mentorCostCents: 0,
    roomCostCents: 0,
    driveFolderUrl: null,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    endDate: "2026-08-01",
    progress: {
      progressPercent: 0,
      daysRemaining: 61,
      daysUntilStart: 0,
      isCompleted: false,
      isUpcoming: false,
      isActive: true,
    },
    ...overrides,
  };
}

const ACTIVE_COHORT = makeCohort({
  id: "c-active",
  label: "Ediția Iunie 2026",
  category: "active",
  progress: {
    progressPercent: 25,
    daysRemaining: 45,
    daysUntilStart: 0,
    isCompleted: false,
    isUpcoming: false,
    isActive: true,
  },
});

const UPCOMING_COHORT = makeCohort({
  id: "c-upcoming",
  label: "Ediția August 2026",
  category: "upcoming",
  startDate: "2026-08-01",
  progress: {
    progressPercent: 0,
    daysRemaining: 90,
    daysUntilStart: 61,
    isCompleted: false,
    isUpcoming: true,
    isActive: false,
  },
});

const PAST_COHORT = makeCohort({
  id: "c-past",
  label: "Ediția Ianuarie 2026",
  category: "past",
  startDate: "2026-01-01",
  progress: {
    progressPercent: 100,
    daysRemaining: -60,
    daysUntilStart: 0,
    isCompleted: true,
    isUpcoming: false,
    isActive: false,
  },
});

const ALL_COHORTS = [ACTIVE_COHORT, UPCOMING_COHORT, PAST_COHORT];

// ─── T-CX-702-1 — Tab counts ─────────────────────────────────────────────────

describe("CohortTabs", () => {
  it("T-CX-702-1 [blocant]: each tab shows correct count (1 active, 1 upcoming, 1 past)", () => {
    const onTabChange = vi.fn();
    const onCohortSelect = vi.fn();

    render(
      <CohortTabs
        cohorts={ALL_COHORTS}
        activeTab="active"
        onTabChange={onTabChange}
        selectedCohortId={ACTIVE_COHORT.id}
        onCohortSelect={onCohortSelect}
      />
    );

    // Each tab label should have a count of 1
    // The tab buttons have the tab role
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);

    // Active tab has "1" badge
    expect(tabs[0].textContent).toContain("Active");
    expect(tabs[0].textContent).toContain("1");

    // Upcoming tab has "1" badge
    expect(tabs[1].textContent).toContain("Viitoare");
    expect(tabs[1].textContent).toContain("1");

    // Past tab has "1" badge
    expect(tabs[2].textContent).toContain("Trecute");
    expect(tabs[2].textContent).toContain("1");
  });

  // T-CX-702-2 [blocant]: click cohort → onCohortSelect fires with correct ID
  it("T-CX-702-2 [blocant]: click cohort button → onCohortSelect called with cohort ID", () => {
    const onTabChange = vi.fn();
    const onCohortSelect = vi.fn();

    render(
      <CohortTabs
        cohorts={ALL_COHORTS}
        activeTab="active"
        onTabChange={onTabChange}
        selectedCohortId={null}
        onCohortSelect={onCohortSelect}
      />
    );

    // The active tab panel shows the active cohort button
    const cohortBtn = screen.getByText("Ediția Iunie 2026");
    fireEvent.click(cohortBtn);

    expect(onCohortSelect).toHaveBeenCalledWith(ACTIVE_COHORT.id);
  });

  it("T-CX-702-2b: tab change fires onTabChange with correct key", () => {
    const onTabChange = vi.fn();
    const onCohortSelect = vi.fn();

    render(
      <CohortTabs
        cohorts={ALL_COHORTS}
        activeTab="active"
        onTabChange={onTabChange}
        selectedCohortId={null}
        onCohortSelect={onCohortSelect}
      />
    );

    const upcomingTab = screen.getByRole("tab", { name: /Viitoare/ });
    fireEvent.click(upcomingTab);

    expect(onTabChange).toHaveBeenCalledWith("upcoming");
  });

  it("empty tab shows empty state message", () => {
    const noCohorts: Cohort[] = [];

    render(
      <CohortTabs
        cohorts={noCohorts}
        activeTab="active"
        onTabChange={vi.fn()}
        selectedCohortId={null}
        onCohortSelect={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toBeDefined();
  });
});

// ─── T-CX-702-3 — Progress widget states ─────────────────────────────────────

describe("CohortProgress", () => {
  it("T-CX-702-3 [normal]: upcoming → shows 'Începe în Nd', percent 0", () => {
    render(
      <CohortProgress
        progress={{
          progressPercent: 0,
          daysRemaining: 61,
          daysUntilStart: 61,
          isCompleted: false,
          isUpcoming: true,
          isActive: false,
        }}
      />
    );

    expect(screen.getByText(/Începe în/)).toBeDefined();
    expect(screen.getByText("0%")).toBeDefined();
  });

  it("completed cohort shows 'Finalizat' and 100%", () => {
    render(
      <CohortProgress
        progress={{
          progressPercent: 100,
          daysRemaining: -30,
          daysUntilStart: 0,
          isCompleted: true,
          isUpcoming: false,
          isActive: false,
        }}
      />
    );

    expect(screen.getByText("Finalizat")).toBeDefined();
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("active cohort shows days remaining", () => {
    render(
      <CohortProgress
        progress={{
          progressPercent: 50,
          daysRemaining: 30,
          daysUntilStart: 0,
          isCompleted: false,
          isUpcoming: false,
          isActive: true,
        }}
      />
    );

    expect(screen.getByText(/30z rămase/)).toBeDefined();
  });
});
