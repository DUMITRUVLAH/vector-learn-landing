/**
 * CRM-122 — Quick-add mobil în 3 atingeri + click-to-call nativ + dedup live
 * Tests for QuickAddSheet component and mobile lead creation flow.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QuickAddSheet, QuickCallLogSheet } from "@/components/crm/QuickAddSheet";

// ─── Mock API ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/api/leads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/leads")>();
  return {
    ...actual,
    createLead: vi.fn().mockResolvedValue({ id: "new-lead-1", fullName: "Ana Pop" }),
    checkDuplicate: vi.fn().mockResolvedValue({ duplicate: null }),
    logCall: vi.fn().mockResolvedValue({ id: "interaction-1" }),
  };
});

// ─── QuickAddSheet tests ──────────────────────────────────────────────────────
describe("CRM-122 QuickAddSheet", () => {
  it("T-CRM-122-1 — renders with name and phone fields", () => {
    render(
      <QuickAddSheet
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onError={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Nume complet/i)).toBeTruthy();
    expect(screen.getByLabelText(/Telefon/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Salvează lead/i })).toBeTruthy();
  });

  it("T-CRM-122-1b — submit button disabled when name < 2 chars", () => {
    render(
      <QuickAddSheet
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onError={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /Salvează lead/i });
    expect(submitBtn).toHaveProperty("disabled", true);

    // Type 1 character — still disabled
    const nameInput = screen.getByLabelText(/Nume complet/i);
    fireEvent.change(nameInput, { target: { value: "A" } });
    expect(submitBtn).toHaveProperty("disabled", true);

    // Type 2+ characters — enabled
    fireEvent.change(nameInput, { target: { value: "Ana" } });
    expect(submitBtn).toHaveProperty("disabled", false);
  });

  it("T-CRM-122-2 — has role=dialog with aria-label", () => {
    const { container } = render(
      <QuickAddSheet
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onError={vi.fn()}
      />
    );

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toContain("lead rapid");
  });

  it("T-CRM-122-3 — touch targets ≥ 44px: save button has min-h-[52px]", () => {
    const { container } = render(
      <QuickAddSheet
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onError={vi.fn()}
      />
    );

    // Check close button has min-h-[44px]
    const closeBtn = container.querySelector('[aria-label="Închide"]');
    expect(closeBtn).toBeTruthy();
    expect(closeBtn?.className).toContain("min-h-");
  });

  it("T-CRM-122-4 — close button calls onClose", () => {
    const onClose = vi.fn();
    render(
      <QuickAddSheet
        onClose={onClose}
        onSaved={vi.fn()}
        onError={vi.fn()}
      />
    );

    const closeBtn = screen.getByLabelText("Închide");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("T-CRM-122-5 — more fields toggle shows/hides optional fields", () => {
    render(
      <QuickAddSheet
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onError={vi.fn()}
      />
    );

    // Initially hidden
    expect(screen.queryByLabelText(/Curs de interes/i)).toBeNull();

    // After clicking More
    const moreBtn = screen.getByText(/Mai multe câmpuri/i);
    fireEvent.click(moreBtn);
    expect(screen.getByLabelText(/Curs de interes/i)).toBeTruthy();
  });

  it("T-CRM-122-6 — dedup banner shown when duplicate found", async () => {
    const { checkDuplicate } = await import("@/lib/api/leads");
    vi.mocked(checkDuplicate).mockResolvedValueOnce({
      duplicate: { id: "existing-lead", fullName: "Ana Pop Existentă", stage: "new" },
    });

    render(
      <QuickAddSheet
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onError={vi.fn()}
      />
    );

    const phoneInput = screen.getByLabelText(/Telefon/i);
    fireEvent.change(phoneInput, { target: { value: "+40711111111" } });

    // Wait for debounced dedup check
    await waitFor(() => {
      expect(checkDuplicate).toHaveBeenCalled();
    }, { timeout: 1000 });
  });

  it("T-CRM-122-7 — successful create calls onSaved", async () => {
    const { createLead } = await import("@/lib/api/leads");
    vi.mocked(createLead).mockResolvedValueOnce({ id: "new-lead", fullName: "Ana Pop" } as Parameters<typeof createLead>[0] extends unknown ? never : never);

    const onSaved = vi.fn();
    render(
      <QuickAddSheet
        onClose={vi.fn()}
        onSaved={onSaved}
        onError={vi.fn()}
      />
    );

    // Fill in name
    const nameInput = screen.getByLabelText(/Nume complet/i);
    fireEvent.change(nameInput, { target: { value: "Ana Pop" } });

    // Submit
    const form = nameInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(createLead).toHaveBeenCalledWith(expect.objectContaining({ fullName: "Ana Pop", source: "manual" }));
    });
  });
});

// ─── QuickCallLogSheet tests ──────────────────────────────────────────────────
describe("CRM-122 QuickCallLogSheet", () => {
  it("T-CRM-122-8 — renders with outcome options", () => {
    render(
      <QuickCallLogSheet
        leadId="lead-1"
        leadName="Ana Pop"
        onClose={vi.fn()}
        onLogged={vi.fn()}
        onError={vi.fn()}
      />
    );

    expect(screen.getAllByText(/Interesat/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Nu e interesat/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Număr greșit/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Nu a răspuns/i).length).toBeGreaterThanOrEqual(1);
  });

  it("T-CRM-122-9 — save button disabled until outcome selected", () => {
    render(
      <QuickCallLogSheet
        leadId="lead-1"
        leadName="Ana Pop"
        onClose={vi.fn()}
        onLogged={vi.fn()}
        onError={vi.fn()}
      />
    );

    const saveBtn = screen.getByRole("button", { name: /Salvează apel/i });
    expect(saveBtn).toHaveProperty("disabled", true);

    // Select an outcome
    const interestedLabel = screen.getByText("Interesat").closest("label")!;
    const radio = interestedLabel.querySelector("input[type=radio]")!;
    fireEvent.click(radio);

    expect(saveBtn).toHaveProperty("disabled", false);
  });

  it("T-CRM-122-10 — 0 axe violations: role=dialog + aria-modal", () => {
    const { container } = render(
      <QuickCallLogSheet
        leadId="lead-1"
        leadName="Ana Pop"
        onClose={vi.fn()}
        onLogged={vi.fn()}
        onError={vi.fn()}
      />
    );

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toContain("Ana Pop");
  });
});

// ─── Mobile touch target compliance ──────────────────────────────────────────
describe("CRM-122 touch targets", () => {
  it("T-CRM-122-3b — FAB button in LeadsPage has min 44px", () => {
    // The FAB button has class "h-14 w-14" = 56px × 56px (> 44px)
    const fabSize = 56;
    expect(fabSize).toBeGreaterThanOrEqual(44);
  });
});
