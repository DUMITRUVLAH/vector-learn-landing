/**
 * CRM-149 — Tests for ActiveFilterPills
 * T-CRM-149-1 [blocant] Given source=facebook + searchQuery="ana", Then 2 pills shown with correct labels.
 * T-CRM-149-2 [blocant] Given click "×" on source pill, Then onClearSource called; other pills intact.
 * T-CRM-149-3 [normal]  Given no active filters, Then component returns null (nothing rendered).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActiveFilterPills, type ActiveFilterPillsProps } from "@/components/crm/ActiveFilterPills";

function makeProps(overrides: Partial<ActiveFilterPillsProps> = {}): ActiveFilterPillsProps {
  return {
    filters: {},
    sourceLabel: (k) => ({ facebook: "Facebook", google: "Google" }[k] ?? k),
    assignedLabel: (id) => `Agent(${id})`,
    onClearSource: vi.fn(),
    onClearAssigned: vi.fn(),
    onClearSearch: vi.fn(),
    onClearNoTask: vi.fn(),
    onClearOverdue: vi.fn(),
    ...overrides,
  };
}

describe("ActiveFilterPills (CRM-149)", () => {
  // T-CRM-149-1 [blocant]
  it("shows source + search pills with correct labels", () => {
    const props = makeProps({
      filters: {
        source: "facebook",
        searchQuery: "ana",
      },
    });
    render(<ActiveFilterPills {...props} />);

    // 2 pills must be present
    expect(screen.getByText(/Sursă: Facebook/i)).toBeInTheDocument();
    expect(screen.getByText(/Căutare: "ana"/i)).toBeInTheDocument();
  });

  // T-CRM-149-2 [blocant]
  it('clicking "×" on source pill calls onClearSource; other pills remain', () => {
    const onClearSource = vi.fn();
    const props = makeProps({
      filters: {
        source: "facebook",
        searchQuery: "ana",
      },
      onClearSource,
    });
    render(<ActiveFilterPills {...props} />);

    // Click the remove button on the source pill
    const removeBtn = screen.getByRole("button", {
      name: /Elimină filtrul "Sursă: Facebook"/i,
    });
    fireEvent.click(removeBtn);

    expect(onClearSource).toHaveBeenCalledOnce();
    // The search pill is still rendered
    expect(screen.getByText(/Căutare: "ana"/i)).toBeInTheDocument();
  });

  // T-CRM-149-3 [normal]
  it("renders nothing when no filter is active", () => {
    const props = makeProps({ filters: {} });
    const { container } = render(<ActiveFilterPills {...props} />);
    // Component should return null → nothing in DOM
    expect(container.firstChild).toBeNull();
  });

  it("renders all five pill types when all filters active", () => {
    const props = makeProps({
      filters: {
        source: "google",
        assignedTo: "user-1",
        searchQuery: "test",
        filterNoTask: true,
        filterOverdue: true,
      },
    });
    render(<ActiveFilterPills {...props} />);

    expect(screen.getByText(/Sursă: Google/i)).toBeInTheDocument();
    expect(screen.getByText(/Responsabil: Agent\(user-1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Căutare: "test"/i)).toBeInTheDocument();
    expect(screen.getByText("Fără task")).toBeInTheDocument();
    expect(screen.getByText("Restanțe")).toBeInTheDocument();
  });

  it("calls the correct clear handler for each pill type", () => {
    const onClearAssigned = vi.fn();
    const onClearNoTask = vi.fn();
    const onClearOverdue = vi.fn();
    const props = makeProps({
      filters: {
        assignedTo: "user-2",
        filterNoTask: true,
        filterOverdue: true,
      },
      onClearAssigned,
      onClearNoTask,
      onClearOverdue,
    });
    render(<ActiveFilterPills {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /Elimină filtrul "Responsabil/i }));
    expect(onClearAssigned).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /Elimină filtrul "Fără task"/i }));
    expect(onClearNoTask).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /Elimină filtrul "Restanțe"/i }));
    expect(onClearOverdue).toHaveBeenCalledOnce();
  });
});
