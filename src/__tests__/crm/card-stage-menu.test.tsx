/**
 * CRM-138 — Meniu "mută în stadiu" pe cardul kanban (desktop)
 * T-CRM-138-1: card randat → există buton cu aria-label "mută/schimbă stadiu"
 * T-CRM-138-2: meniu deschis → nu conține stadiul curent al lead-ului
 * T-CRM-138-3: selectare stadiu non-lost → onMove apelat cu stadiul corect
 * T-CRM-138-4: selectare stadiu lost → onMoveLost apelat (nu onMove)
 * T-CRM-138-5: Esc apăsat → meniul se închide
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StageMenu } from "@/components/crm/StageMenu";
import type { PipelineStage } from "@/lib/api/pipeline";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STAGES: PipelineStage[] = [
  { id: "s1", key: "new", label: "Nou", orderIndex: 0, isLost: false, isWon: false, isDefault: true, color: "#000", tenantId: "t1", createdAt: "", updatedAt: "" },
  { id: "s2", key: "contacted", label: "Contactat", orderIndex: 1, isLost: false, isWon: false, isDefault: false, color: "#000", tenantId: "t1", createdAt: "", updatedAt: "" },
  { id: "s3", key: "paid", label: "Plătit", orderIndex: 2, isLost: false, isWon: true, isDefault: false, color: "#000", tenantId: "t1", createdAt: "", updatedAt: "" },
  { id: "s4", key: "lost", label: "Pierdut", orderIndex: 3, isLost: true, isWon: false, isDefault: false, color: "#000", tenantId: "t1", createdAt: "", updatedAt: "" },
];

function renderMenu(currentStageKey: string, onMove = vi.fn(), onMoveLost = vi.fn()) {
  return render(
    <StageMenu
      currentStageKey={currentStageKey}
      stages={STAGES}
      onMove={onMove}
      onMoveLost={onMoveLost}
    />
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CRM-138 — StageMenu", () => {
  beforeEach(() => vi.clearAllMocks());

  // T-CRM-138-1 [blocant]: buton cu aria-label "mută/schimbă stadiu" există
  it("T-CRM-138-1: renders a button with aria-label muta", () => {
    renderMenu("new");
    const btn = screen.getByRole("button", { name: /mută/i });
    expect(btn).toBeTruthy();
  });

  // T-CRM-138-2 [blocant]: meniu deschis → nu conține stadiul curent
  it("T-CRM-138-2: menu does not contain the current stage", async () => {
    renderMenu("contacted");
    const trigger = screen.getByRole("button", { name: /mută/i });
    fireEvent.click(trigger);
    await waitFor(() => screen.getByRole("menu"));
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).not.toContain("Contactat");
    expect(items).toContain("Nou");
    expect(items).toContain("Plătit");
    expect(items).toContain("Pierdut");
  });

  // T-CRM-138-3 [blocant]: selectare non-lost → onMove cu stadiul corect
  it("T-CRM-138-3: clicking a non-lost stage calls onMove with its key", async () => {
    const onMove = vi.fn();
    const onMoveLost = vi.fn();
    renderMenu("new", onMove, onMoveLost);
    fireEvent.click(screen.getByRole("button", { name: /mută/i }));
    await waitFor(() => screen.getByRole("menu"));
    const paidItem = screen.getByRole("menuitem", { name: "Plătit" });
    fireEvent.click(paidItem);
    expect(onMove).toHaveBeenCalledWith("paid");
    expect(onMoveLost).not.toHaveBeenCalled();
  });

  // T-CRM-138-4 [blocant]: selectare lost → onMoveLost apelat (nu onMove)
  it("T-CRM-138-4: clicking a lost stage calls onMoveLost, not onMove", async () => {
    const onMove = vi.fn();
    const onMoveLost = vi.fn();
    renderMenu("new", onMove, onMoveLost);
    fireEvent.click(screen.getByRole("button", { name: /mută/i }));
    await waitFor(() => screen.getByRole("menu"));
    const lostItem = screen.getByRole("menuitem", { name: "Pierdut" });
    fireEvent.click(lostItem);
    expect(onMoveLost).toHaveBeenCalledWith("lost");
    expect(onMove).not.toHaveBeenCalled();
  });

  // T-CRM-138-5: Esc → meniul se închide
  it("T-CRM-138-5: pressing Escape closes the menu", async () => {
    renderMenu("new");
    fireEvent.click(screen.getByRole("button", { name: /mută/i }));
    await waitFor(() => screen.getByRole("menu"));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });
});
