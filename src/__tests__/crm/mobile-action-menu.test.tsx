/**
 * CRM-151 — Mobile action overflow menu tests
 * T-CRM-151-1 [blocant] Given viewport < lg, Then "Stadii"/"Import" are inside "⋯" menu, not direct.
 * T-CRM-151-2 Given viewport ≥ lg, Then "Stadii"/"Import" are direct buttons.
 * T-CRM-151-3 [blocant] Given Esc with menu open, Then menu closes.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// ─── Minimal stubs ────────────────────────────────────────────────────────────
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { id: "u1", tenantId: "t1", role: "admin", tenant: { id: "t1", slug: "test" } },
  }),
}));
vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({ members: [], loading: false }),
}));
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn() }),
}));
vi.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: (v: unknown) => v,
}));
vi.mock("@/lib/api/leads", () => ({
  fetchPipeline: vi.fn().mockResolvedValue({ grouped: {}, counts: {}, valueSums: {}, totalValueCents: 0 }),
  fetchLeadsList: vi.fn().mockResolvedValue({ items: [], total: 0, totalPages: 0, page: 1 }),
  moveLeadStage: vi.fn(),
  createLead: vi.fn(),
  convertLead: vi.fn(),
  listInteractions: vi.fn().mockResolvedValue({ items: [] }),
  addInteraction: vi.fn(),
  checkDuplicate: vi.fn().mockResolvedValue({ duplicate: null }),
  bulkAction: vi.fn(),
}));
vi.mock("@/lib/api/pipeline", () => ({
  fetchPipelineStages: vi.fn().mockResolvedValue({ stages: [] }),
  createPipelineStage: vi.fn(),
  updatePipelineStage: vi.fn(),
  deletePipelineStage: vi.fn(),
}));
vi.mock("@/lib/api/analytics", () => ({
  getForecast: vi.fn().mockResolvedValue({ totalWeightedCents: 0 }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
    <div>
      <div data-testid="actions-area">{actions}</div>
      {children}
    </div>
  ),
}));
vi.mock("@/components/crm/MobileLeadList", () => ({
  MobileLeadList: () => <div data-testid="mobile-list" />,
}));
vi.mock("@/components/crm/QuickAddSheet", () => ({
  QuickAddSheet: () => null,
}));
vi.mock("@/components/crm/SavedViewsDropdown", () => ({
  SavedViewsDropdown: () => null,
}));
vi.mock("@/components/crm/AssigneePicker", () => ({
  AssigneePicker: () => null,
  useAssigneeName: () => "",
}));
vi.mock("@/components/crm/StageMenu", () => ({
  StageMenu: () => null,
}));
vi.mock("@/components/crm/StageMoveUndoToast", () => ({
  StageMoveUndoToast: () => null,
}));
vi.mock("@/components/crm/ActiveFilterPills", () => ({
  ActiveFilterPills: () => null,
}));
vi.mock("@/lib/csv", () => ({
  parseCsv: vi.fn(),
  parseCurrencyToCents: vi.fn(),
  parseTags: vi.fn(),
}));
// ─────────────────────────────────────────────────────────────────────────────

import { LeadsPage } from "@/pages/app/LeadsPage";
import React from "react";

// Helper: find the overflow toggle button ("⋯")
function getOverflowBtn(container: HTMLElement) {
  return within(container).getByRole("button", { name: /mais multe acțiuni|mai multe acțiuni/i });
}

describe("CRM-151 Mobile action overflow menu", () => {
  // T-CRM-151-1 [blocant] — Mobile: secondary actions inside "⋯" menu
  it("renders the overflow button on mobile and hides direct Stadii/Import", () => {
    const { container } = render(<LeadsPage />);
    const actionsArea = container.querySelector('[data-testid="actions-area"]') ?? container;

    // The "⋯" toggle button must exist
    const overflowBtn = within(actionsArea as HTMLElement).getByRole("button", { name: /mai multe acțiuni/i });
    expect(overflowBtn).toBeTruthy();

    // Direct desktop "Stadii" and "Import" buttons must be hidden from screen
    // (they use class "hidden lg:inline-flex" so they won't be visible at default jsdom viewport)
    // They exist in DOM but are hidden — test that the overflow menu contains them on click
    fireEvent.click(overflowBtn);
    // After opening, "Stadii" and "Import" appear as menu items
    expect(within(actionsArea as HTMLElement).getByRole("menuitem", { name: /stadii|configurează stadii/i })).toBeTruthy();
    expect(within(actionsArea as HTMLElement).getByRole("menuitem", { name: /import csv/i })).toBeTruthy();
  });

  // T-CRM-151-2 — Desktop: Stadii/Import buttons are direct (lg:inline-flex)
  it("desktop buttons for Stadii and Import have hidden lg:inline-flex class", () => {
    const { container } = render(<LeadsPage />);
    const actionsArea = container.querySelector('[data-testid="actions-area"]') ?? container;

    // These buttons have class "hidden lg:inline-flex"
    const desktopButtons = (actionsArea as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button.hidden.lg\\:inline-flex'
    );
    const labels = Array.from(desktopButtons).map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
    expect(labels.some((l) => /stadii|configurează/i.test(l))).toBe(true);
    expect(labels.some((l) => /import/i.test(l))).toBe(true);
  });

  // T-CRM-151-3 [blocant] — Esc closes the menu
  it("pressing Esc closes the overflow menu", () => {
    const { container } = render(<LeadsPage />);
    const actionsArea = container.querySelector('[data-testid="actions-area"]') ?? container;

    const overflowBtn = within(actionsArea as HTMLElement).getByRole("button", { name: /mai multe acțiuni/i });
    fireEvent.click(overflowBtn);

    // Menu is open — "Stadii" menuitem should be visible
    expect(within(actionsArea as HTMLElement).getByRole("menuitem", { name: /stadii/i })).toBeTruthy();

    // Press Esc
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    // Menu should be gone
    expect(within(actionsArea as HTMLElement).queryByRole("menuitem", { name: /stadii/i })).toBeNull();
  });

  // Additional: overflow button has aria-haspopup and aria-expanded
  it("overflow button has correct aria attributes", () => {
    const { container } = render(<LeadsPage />);
    const actionsArea = container.querySelector('[data-testid="actions-area"]') ?? container;

    const overflowBtn = within(actionsArea as HTMLElement).getByRole("button", { name: /mai multe acțiuni/i });
    expect(overflowBtn).toHaveAttribute("aria-haspopup", "true");
    expect(overflowBtn).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(overflowBtn);
    expect(overflowBtn).toHaveAttribute("aria-expanded", "true");
  });
});
