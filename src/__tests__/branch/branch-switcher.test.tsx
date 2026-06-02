/**
 * BRANCH-702 — Branch switcher UI + global branch filter
 * Tests:
 * T-BRANCH-702-1: [blocant] BranchSwitcher renders with "Toate filialele" option
 * T-BRANCH-702-2: [blocant] Selecting a branch calls setActiveBranch with branch id
 * T-BRANCH-702-3: [blocant] Selecting "Toate" calls setActiveBranch with "all"
 * T-BRANCH-702-4: [blocant] BranchContext persists in localStorage
 * T-BRANCH-702-5: [normal]  BranchSwitcher uses semantic CSS tokens (no hardcoded hex)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { BranchProvider, useBranch } from "@/contexts/BranchContext";

// ─── Mock listBranches ─────────────────────────────────────────────────────────

vi.mock("@/lib/api/branches", () => ({
  listBranches: vi.fn(async () => ({
    items: [
      {
        id: "branch-cluj-uuid",
        tenantId: "t1",
        name: "Cluj",
        address: null,
        managerUserId: null,
        status: "active",
        createdAt: "2026-05-30T00:00:00Z",
        updatedAt: "2026-05-30T00:00:00Z",
      },
      {
        id: "branch-iasi-uuid",
        tenantId: "t1",
        name: "Iași",
        address: null,
        managerUserId: null,
        status: "active",
        createdAt: "2026-05-30T00:00:00Z",
        updatedAt: "2026-05-30T00:00:00Z",
      },
    ],
  })),
}));

// Import AFTER mocking
import { BranchSwitcher } from "@/components/app/BranchSwitcher";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function renderWithProvider(ui: React.ReactElement) {
  return render(<BranchProvider>{ui}</BranchProvider>);
}

// ─── localStorage mock ─────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("BRANCH-702 — BranchSwitcher UI", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("T-BRANCH-702-1: renders with Toate filialele default text", async () => {
    renderWithProvider(<BranchSwitcher />);
    // Wait for branches to load
    await waitFor(() => {
      const btn = screen.getByRole("button");
      expect(btn).toBeTruthy();
    });
    // Should show "Toate filialele" by default
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("Toate filialele");
  });

  it("T-BRANCH-702-2: selecting a branch calls setActiveBranch with branch id", async () => {
    renderWithProvider(<BranchSwitcher />);
    // Open the dropdown
    await waitFor(() => screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    // Wait for listbox to appear
    await waitFor(() => screen.getByRole("listbox"));
    // Click on "Cluj" option
    const clujOption = screen.getByText("Cluj");
    fireEvent.click(clujOption);
    // Dropdown should close, button text should update
    await waitFor(() => {
      const btn = screen.getByRole("button");
      expect(btn.textContent).toContain("Cluj");
    });
  });

  it("T-BRANCH-702-3: clicking Toate resets to all", async () => {
    // Start with a branch selected
    localStorageMock.setItem("vl_active_branch", "branch-cluj-uuid");
    renderWithProvider(<BranchSwitcher />);
    await waitFor(() => screen.getByRole("button"));
    // Open dropdown
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => screen.getByRole("listbox"));
    // Click "Toate filialele"
    fireEvent.click(screen.getByText("Toate filialele"));
    // Button should show "Toate filialele"
    await waitFor(() => {
      const btn = screen.getByRole("button");
      expect(btn.textContent).toContain("Toate filialele");
    });
  });
});

describe("BRANCH-702 — BranchContext localStorage persistence", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("T-BRANCH-702-4: BranchContext saves activeBranch in localStorage", () => {
    // Test the context directly via a consumer component
    function Consumer() {
      const { activeBranch, setActiveBranch } = useBranch();
      return (
        <div>
          <span data-testid="value">{activeBranch}</span>
          <button onClick={() => setActiveBranch("branch-test-id")}>Set</button>
        </div>
      );
    }

    render(
      <BranchProvider>
        <Consumer />
      </BranchProvider>
    );

    expect(screen.getByTestId("value").textContent).toBe("all");

    fireEvent.click(screen.getByText("Set"));

    expect(screen.getByTestId("value").textContent).toBe("branch-test-id");
    // Verify localStorage was updated
    expect(localStorageMock.getItem("vl_active_branch")).toBe("branch-test-id");
  });

  it("T-BRANCH-702-5: BranchSwitcher uses semantic classes, not hardcoded colors", () => {
    // Read the source as a string to check for hex codes
    const switcher = BranchSwitcher.toString();
    // Should NOT contain raw hex codes like #1a2b3c
    expect(switcher).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});

describe("BRANCH-702 — students API branch_id param", () => {
  it("T-BRANCH-702-6: listStudents API type accepts branch_id param", () => {
    // Type-level check: ListStudentsParams has branch_id field
    type ListStudentsParams = import("@/lib/api/students").ListStudentsParams;
    const params: ListStudentsParams = { branch_id: "some-uuid" };
    expect(typeof params.branch_id).toBe("string");
    expect(params.branch_id).toBe("some-uuid");
  });
});
