/**
 * POLISH-003: Unit tests for EmptyState component
 * Tests: T-POLISH-003-1, T-POLISH-003-2, T-POLISH-003-4, T-POLISH-003-5
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "@/components/EmptyState";
import { Users } from "lucide-react";

describe("EmptyState", () => {
  // T-POLISH-003-1: title and description render in DOM
  it("T-POLISH-003-1: renders title and description text", () => {
    render(
      <EmptyState
        icon={<Users className="h-6 w-6 text-muted-foreground" />}
        title="Niciun element"
        description="Nu există elemente în această listă."
      />
    );
    expect(screen.getByText("Niciun element")).toBeDefined();
    expect(screen.getByText("Nu există elemente în această listă.")).toBeDefined();
  });

  // T-POLISH-003-2: action button renders and is clickable
  it("T-POLISH-003-2: renders action button and fires onClick", () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        icon={<Users className="h-6 w-6 text-muted-foreground" />}
        title="Nicio factură"
        description="Creați prima factură."
        action={{ label: "Creează factură", onClick: onAction }}
      />
    );
    const btn = screen.getByRole("button", { name: "Creează factură" });
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(onAction).toHaveBeenCalledOnce();
  });

  // T-POLISH-003-4: no hardcoded hex inline color (dark mode compat)
  it("T-POLISH-003-4: uses semantic token classes, no inline hex colors", () => {
    const { container } = render(
      <EmptyState
        icon={<Users className="h-6 w-6 text-muted-foreground" />}
        title="Test title"
        description="Test desc"
      />
    );
    expect(container.querySelector(".bg-muted")).not.toBeNull();
    expect(container.innerHTML.includes("color: #")).toBe(false);
    expect(container.innerHTML.includes("background: #")).toBe(false);
  });

  // T-POLISH-003-5: action button NOT rendered when action prop is omitted
  it("T-POLISH-003-5: does not render button when action prop is absent", () => {
    render(
      <EmptyState
        icon={<Users className="h-6 w-6 text-muted-foreground" />}
        title="Gol"
        description="Nimic de afișat."
      />
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  // Additional: has role=status for screen readers
  it("has role=status for accessibility", () => {
    render(
      <EmptyState
        icon={<Users className="h-6 w-6 text-muted-foreground" />}
        title="Stare goală"
        description="Descriere."
      />
    );
    expect(screen.getByRole("status")).toBeDefined();
  });
});
