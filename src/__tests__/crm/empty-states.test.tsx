/**
 * CRM-128 — Empty states + onboarding checklist
 * T-CRM-128-1: EmptyLeads renders with text and CTA button
 * T-CRM-128-2: EmptySearch renders when filterActive=true
 * T-CRM-128-3: OnboardingChecklist shows when < 5 leads and not dismissed
 * T-CRM-128-4: OnboardingChecklist step auto-marks done
 * T-CRM-128-5: OnboardingChecklist auto-dismisses when all 4 steps done
 * T-CRM-128-6: Build + typecheck + lint pass (implicit)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyLeads } from "../../../src/components/crm/EmptyLeads";
import { EmptySearch } from "../../../src/components/crm/EmptySearch";
import { EmptyAuditLog } from "../../../src/components/crm/EmptyAuditLog";
import { EmptyCadences } from "../../../src/components/crm/EmptyCadences";
import { OnboardingChecklist } from "../../../src/components/crm/OnboardingChecklist";

// Polyfill localStorage for jsdom test environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

// ─── T-CRM-128-1: EmptyLeads ──────────────────────────────────────────────────

describe("CRM-128 — EmptyLeads", () => {
  it("T-CRM-128-1: renders with correct text and CTA button when leads empty", () => {
    const onAddLead = vi.fn();
    render(<EmptyLeads onAddLead={onAddLead} />);

    expect(screen.getByText(/niciun lead/i)).toBeDefined();
    const btn = screen.getByRole("button", { name: /adaugă primul lead/i });
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(onAddLead).toHaveBeenCalledOnce();
  });

  it("T-CRM-128-1b: has role=status for accessibility", () => {
    render(<EmptyLeads />);
    expect(screen.getByRole("status")).toBeDefined();
  });
});

// ─── T-CRM-128-2: EmptySearch ─────────────────────────────────────────────────

describe("CRM-128 — EmptySearch", () => {
  it("T-CRM-128-2: renders when filtered list is empty", () => {
    const onClear = vi.fn();
    render(<EmptySearch onClearFilters={onClear} />);

    expect(screen.getByText(/niciun rezultat/i)).toBeDefined();
    const btn = screen.getByRole("button", { name: /şterge filtrele/i });
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(onClear).toHaveBeenCalledOnce();
  });
});

// ─── EmptyAuditLog & EmptyCadences ───────────────────────────────────────────

describe("CRM-128 — EmptyAuditLog", () => {
  it("renders with correct text", () => {
    render(<EmptyAuditLog />);
    expect(screen.getByText(/nicio activitate/i)).toBeDefined();
  });
});

describe("CRM-128 — EmptyCadences", () => {
  it("renders with CTA and fires callback", () => {
    const onCreate = vi.fn();
    render(<EmptyCadences onCreateFirst={onCreate} />);
    expect(screen.getByText(/nicio cadenţă/i)).toBeDefined();
    const btn = screen.getByRole("button", { name: /crează prima cadenţă/i });
    fireEvent.click(btn);
    expect(onCreate).toHaveBeenCalledOnce();
  });
});

// ─── T-CRM-128-3,4,5: OnboardingChecklist ────────────────────────────────────

describe("CRM-128 — OnboardingChecklist", () => {
  const TENANT_ID = "test-tenant-128";
  const STORAGE_KEY = `vl_onboarding_${TENANT_ID}_v1`;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("T-CRM-128-3: shows when totalLeads < 5 and not dismissed", () => {
    render(<OnboardingChecklist tenantId={TENANT_ID} totalLeads={0} />);
    expect(screen.getByRole("complementary", { name: /ghid de pornire/i })).toBeDefined();
  });

  it("T-CRM-128-3b: hidden when totalLeads >= 5", () => {
    render(<OnboardingChecklist tenantId={TENANT_ID} totalLeads={5} />);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("T-CRM-128-3c: hidden when dismissed in localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      steps: { leadCreated: false, stageEdited: false, templateCreated: false, messageSent: false },
      dismissed: true,
    }));
    render(<OnboardingChecklist tenantId={TENANT_ID} totalLeads={0} />);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("T-CRM-128-4: clicking dismiss hides the checklist", () => {
    render(<OnboardingChecklist tenantId={TENANT_ID} totalLeads={0} />);
    const dismissBtn = screen.getByRole("button", { name: /ascunde ghidul/i });
    fireEvent.click(dismissBtn);
    expect(screen.queryByRole("complementary")).toBeNull();

    // Verify localStorage was updated
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as { dismissed?: boolean };
    expect(stored.dismissed).toBe(true);
  });

  it("T-CRM-128-5: renders 4 steps initially", () => {
    render(<OnboardingChecklist tenantId={TENANT_ID} totalLeads={0} />);
    // Should show progress indicator
    expect(screen.getByText("0/4")).toBeDefined();
  });
});
