/**
 * ParUrgentBadge — owner request 2026-08-28 (urgency flag on PAR requests).
 *
 * Tests:
 *   - renders nothing when not urgent (caller gates with `r.isUrgent &&`, but the component's
 *     own contract must still be verified: an unmounted badge means it's simply not rendered
 *     by the caller — this test covers what happens if a caller forgets and passes `reason: null`)
 *   - renders the "Urgent" label + icon when a reason is given
 *   - the title attribute carries the formal reason label + formatted due date
 *   - "other" reason shows the free-text note instead of the generic label
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParUrgentBadge } from "../ParUrgentBadge";

describe("ParUrgentBadge", () => {
  it("renders nothing when reason is null (not urgent)", () => {
    const { container } = render(<ParUrgentBadge reason={null} />);
    expect(container.textContent).toBe("");
  });

  it("renders the 'Urgent' label for a known reason code", () => {
    render(<ParUrgentBadge reason="contract_deadline" dueDate="2026-09-01T00:00:00.000Z" />);
    expect(screen.getByText("Urgent")).toBeTruthy();
  });

  it("title carries the formal reason label + formatted due date", () => {
    render(<ParUrgentBadge reason="penalty_risk" dueDate="2026-09-01T00:00:00.000Z" />);
    const badge = screen.getByText("Urgent").closest("span");
    expect(badge?.getAttribute("title")).toContain("Risc de penalizări");
    expect(badge?.getAttribute("title")).toContain("Termen limită plată");
    expect(badge?.getAttribute("title")).toContain("01.09.2026");
  });

  it("shows the free-text note for reason 'other' instead of a generic label", () => {
    render(<ParUrgentBadge reason="other" reasonNote="Solicitare urgentă a donatorului X" dueDate="2026-09-01T00:00:00.000Z" />);
    const badge = screen.getByText("Urgent").closest("span");
    expect(badge?.getAttribute("title")).toContain("Solicitare urgentă a donatorului X");
  });
});
