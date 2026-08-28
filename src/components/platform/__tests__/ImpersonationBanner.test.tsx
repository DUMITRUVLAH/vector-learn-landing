/**
 * PLATFORM-403 — banda de impersonare.
 * Regula testată: pe o sesiune normală nu apare NIMIC, iar pe una împrumutată nu se poate
 * rata cine ești și cum ieși.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockStatus = vi.fn();
const mockStop = vi.fn();

vi.mock("@/lib/api/impersonation", () => ({
  getImpersonationStatus: () => mockStatus(),
  stopImpersonation: () => mockStop(),
  IMPERSONATION_REFUSALS: {},
}));

import { ImpersonationBanner } from "../ImpersonationBanner";

describe("ImpersonationBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom nu implementează reload(); îl înlocuim ca butonul să poată fi apăsat în test.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: vi.fn(), hash: "" },
    });
  });

  it("[blocant] sesiune normală → nu randează nimic", async () => {
    mockStatus.mockResolvedValue({ active: false });
    const { container } = render(<ImpersonationBanner />);
    await waitFor(() => expect(mockStatus).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("[blocant] sesiune de impersonare → spune al cui e contul și iese la un click", async () => {
    mockStatus.mockResolvedValue({
      active: true,
      actor: { email: "vlah.business@gmail.com", name: "Dumitru" },
      target: { id: "u1", email: "violeta@atic.md", name: "Violeta Bordeniuc", role: "manager" },
      workspace: { id: "t1", name: "ATIC", appKind: "business" },
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    mockStop.mockResolvedValue({ ok: true, restored: true, redirect: "/business/platform" });

    render(<ImpersonationBanner />);

    const btn = await screen.findByLabelText("Ieși din contul testat și revino la contul tău");
    expect(screen.getByText("Violeta Bordeniuc")).toBeDefined();
    expect(screen.getByText("ATIC")).toBeDefined();

    fireEvent.click(btn);
    await waitFor(() => expect(mockStop).toHaveBeenCalledTimes(1));
    expect(window.location.hash).toBe("/business/platform");
    expect(window.location.reload).toHaveBeenCalled();
  });
});
