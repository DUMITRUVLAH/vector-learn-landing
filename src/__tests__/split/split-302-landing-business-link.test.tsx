/**
 * SPLIT-302 — Landing / conține link discret spre Business Suite
 *
 * T-SPLIT-302-1 [blocant] Footer conține link "Business Suite" cu href spre /business
 * T-SPLIT-302-2 [normal]  Link-ul are href corect (#/business sau /business)
 * T-SPLIT-302-3 [normal]  Link-ul e discret (nu e btn CTA principal)
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock Lucide icons to avoid import issues
vi.mock("lucide-react", () => ({
  Twitter: () => null,
  Linkedin: () => null,
  Facebook: () => null,
  Youtube: () => null,
  Instagram: () => null,
}));

import { Footer } from "@/components/Footer";

describe("SPLIT-302: Landing page — Business Suite link discret în footer", () => {
  it("T-SPLIT-302-1 [blocant] footer conține link cu text 'Business Suite'", () => {
    const { container } = render(<Footer />);

    const allLinks = Array.from(container.querySelectorAll("a"));
    const businessSuiteLink = allLinks.find((el) =>
      el.textContent?.includes("Business Suite")
    );

    expect(businessSuiteLink).toBeDefined();
  });

  it("T-SPLIT-302-2 [normal] link-ul Business Suite are href spre /business", () => {
    const { container } = render(<Footer />);

    const allLinks = Array.from(container.querySelectorAll("a"));
    const businessSuiteLink = allLinks.find((el) =>
      el.textContent?.includes("Business Suite")
    );

    expect(businessSuiteLink).toBeDefined();
    const href = businessSuiteLink!.getAttribute("href") ?? "";
    expect(href.includes("/business")).toBe(true);
  });

  it("T-SPLIT-302-3 [normal] link-ul Business Suite nu este un buton CTA proeminent (fără class btn-primary)", () => {
    const { container } = render(<Footer />);

    const allLinks = Array.from(container.querySelectorAll("a"));
    const businessSuiteLink = allLinks.find((el) =>
      el.textContent?.includes("Business Suite")
    );

    expect(businessSuiteLink).toBeDefined();
    // Should NOT have btn-primary class (it's discreet, not a CTA)
    const classes = businessSuiteLink!.getAttribute("class") ?? "";
    expect(classes.includes("btn-primary")).toBe(false);
    // Should be small/text — not a large promotional button
    expect(classes.includes("py-4") || classes.includes("py-3")).toBe(false);
  });
});
