/**
 * ONBOARD-001 — Tests for OnboardingBanner component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: vi.fn(() => ({
    data: { tenant: { id: "tenant-123" }, user: { name: "Andreea", role: "admin" } },
    status: "authenticated",
  })),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, "localStorage", { value: localStorageMock, writable: true });

function makeFetchResponse(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  } as Response);
}

// ─── Import after mocks ──────────────────────────────────────────────────────

import { OnboardingBanner } from "@/components/app/OnboardingBanner";

// ─── Test data ───────────────────────────────────────────────────────────────

const allNotDoneStatus = {
  completed: false,
  steps: [
    { id: "add_teacher", label: "Adaugă un profesor", href: "#/app/teachers", done: false },
    { id: "add_student", label: "Adaugă primul elev", href: "#/app/students", done: false },
    { id: "schedule_lesson", label: "Programează prima lecție", href: "#/app/schedule", done: false },
    { id: "invite_team", label: "Invită colegii", href: "#/app/settings/team", done: false },
  ],
};

const twoOfFourDoneStatus = {
  completed: false,
  steps: [
    { id: "add_teacher", label: "Adaugă un profesor", href: "#/app/teachers", done: true },
    { id: "add_student", label: "Adaugă primul elev", href: "#/app/students", done: true },
    { id: "schedule_lesson", label: "Programează prima lecție", href: "#/app/schedule", done: false },
    { id: "invite_team", label: "Invită colegii", href: "#/app/settings/team", done: false },
  ],
};

const allDoneStatus = {
  completed: true,
  steps: [
    { id: "add_teacher", label: "Adaugă un profesor", href: "#/app/teachers", done: true },
    { id: "add_student", label: "Adaugă primul elev", href: "#/app/students", done: true },
    { id: "schedule_lesson", label: "Programează prima lecție", href: "#/app/schedule", done: true },
    { id: "invite_team", label: "Invită colegii", href: "#/app/settings/team", done: true },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ONBOARD-001 — OnboardingBanner", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("T-ONBOARD-001-3 renders step labels when 0/4 done", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      makeFetchResponse(allNotDoneStatus) as unknown as ReturnType<typeof fetch>
    );

    render(<OnboardingBanner />);

    await waitFor(() => {
      expect(screen.getByText("Adaugă un profesor")).toBeInTheDocument();
    });
    expect(screen.getByText("Adaugă primul elev")).toBeInTheDocument();
    expect(screen.getByText("Programează prima lecție")).toBeInTheDocument();
    expect(screen.getByText("Invită colegii")).toBeInTheDocument();
  });

  it("T-ONBOARD-001-3 renders 2/4 pași completați progress", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      makeFetchResponse(twoOfFourDoneStatus) as unknown as ReturnType<typeof fetch>
    );

    render(<OnboardingBanner />);

    // Check for the progress text (might be split as "2" + " / " + "4")
    await waitFor(() => {
      expect(screen.getByText(/pași completați/i)).toBeInTheDocument();
    });
    // Check "2 / 4" is present
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("2");
    expect(banner.textContent).toContain("4");
  });

  it("T-ONBOARD-001-4 dismiss button hides the banner", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      makeFetchResponse(allNotDoneStatus) as unknown as ReturnType<typeof fetch>
    );

    render(<OnboardingBanner />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    const dismissBtn = screen.getByRole("button", { name: /ignoră/i });
    fireEvent.click(dismissBtn);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("T-ONBOARD-001-4 dismiss stores key in localStorage", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      makeFetchResponse(allNotDoneStatus) as unknown as ReturnType<typeof fetch>
    );

    render(<OnboardingBanner />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    const dismissBtn = screen.getByRole("button", { name: /ignoră/i });
    fireEvent.click(dismissBtn);

    expect(localStorageMock.getItem("onboarding_dismissed_tenant-123")).toBe("1");
  });

  it("T-ONBOARD-001 banner does NOT render when completed=true", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      makeFetchResponse(allDoneStatus) as unknown as ReturnType<typeof fetch>
    );

    render(<OnboardingBanner />);

    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("T-ONBOARD-001 banner does NOT render when already dismissed", () => {
    // Pre-set localStorage before render
    localStorageMock.setItem("onboarding_dismissed_tenant-123", "1");

    // No fetch mock needed - dismissed check happens synchronously
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      makeFetchResponse(allNotDoneStatus) as unknown as ReturnType<typeof fetch>
    );

    render(<OnboardingBanner />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("T-ONBOARD-001 progress bar exists with correct width", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      makeFetchResponse(twoOfFourDoneStatus) as unknown as ReturnType<typeof fetch>
    );

    render(<OnboardingBanner />);

    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    const progressBar = screen.getByRole("progressbar");
    expect(progressBar.getAttribute("aria-valuenow")).toBe("50");
  });
});
