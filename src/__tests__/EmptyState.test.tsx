/**
 * POLISH-003 — EmptyState
 *
 * T-POLISH-003-1 [blocant] Given title + description, Then both are rendered in DOM
 * T-POLISH-003-2 [blocant] Given action prop, Then button is rendered and clickable
 * T-POLISH-003-3 [normal]  Given no action prop, Then no button is rendered
 * T-POLISH-003-4 [normal]  Given icon prop, Then icon container is present
 * T-POLISH-003-5 [normal]  Given dark mode class on body, Then no hardcoded colors in output
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "@/components/EmptyState";
import { Users } from "lucide-react";

describe("EmptyState", () => {
  it("T-POLISH-003-1: renders title and description", () => {
    render(
      <EmptyState
        icon={<Users />}
        title="Niciun elev"
        description="Adaugă primul elev."
      />
    );
    expect(screen.getByText("Niciun elev")).toBeInTheDocument();
    expect(screen.getByText("Adaugă primul elev.")).toBeInTheDocument();
  });

  it("T-POLISH-003-2: renders action button and fires onClick", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={<Users />}
        title="Niciun elev"
        description="Desc"
        action={{ label: "Adaugă elev", onClick }}
      />
    );
    const btn = screen.getByRole("button", { name: "Adaugă elev" });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("T-POLISH-003-3: does not render button when action is absent", () => {
    render(
      <EmptyState
        icon={<Users />}
        title="Niciun elev"
        description="Desc"
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("T-POLISH-003-4: renders icon container", () => {
    const { container } = render(
      <EmptyState
        icon={<Users data-testid="icon" />}
        title="Test"
        description="Desc"
      />
    );
    // The icon wrapper div should be present
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("T-POLISH-003-5: does not use hardcoded hex colors", () => {
    const { container } = render(
      <EmptyState
        icon={<Users />}
        title="Test"
        description="Desc"
        action={{ label: "Act", onClick: vi.fn() }}
      />
    );
    const html = container.innerHTML;
    // Check no hardcoded hex color classes
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});
