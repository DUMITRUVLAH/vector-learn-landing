/**
 * ParBackdatedBadge — owner, 2026-08-29: „dacă pune cu dată anterioară… atenționezi și finanțe
 * și aprobator, tot să vadă că e cu data din trecut".
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParBackdatedBadge } from "../ParBackdatedBadge";

describe("ParBackdatedBadge", () => {
  it("nu randează nimic pentru o cerere datată în ziua depunerii", () => {
    const { container } = render(
      <ParBackdatedBadge dateOfRequest="2026-08-29T00:00:00.000Z" submittedAt="2026-08-29T09:00:00.000Z" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("[blocant] arată decalajul în zile pentru o cerere datată în urmă", () => {
    render(
      <ParBackdatedBadge dateOfRequest="2026-08-19T00:00:00.000Z" submittedAt="2026-08-29T09:00:00.000Z" />
    );
    expect(screen.getByText("Dată retroactivă · 10 zile")).toBeInTheDocument();
  });
});
