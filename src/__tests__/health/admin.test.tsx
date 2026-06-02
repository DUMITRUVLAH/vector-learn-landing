/**
 * HEALTH-001 — Tests for AdminPage component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: vi.fn(() => ({
    data: {
      tenant: { id: "tenant-1", name: "Lingua School", plan: "growth" },
      user: { id: "user-1", name: "Dumitru Vlah", email: "dumitru@vectorlearn.ro", role: "admin" },
    },
    status: "authenticated",
  })),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: vi.fn(() => ({ path: "/app/admin", navigate: vi.fn() })),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    React.createElement("a", { href: to }, children),
}));

// Mock AppShell to simplify test rendering
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) =>
    React.createElement("div", { "data-testid": "app-shell", "data-title": pageTitle }, children),
}));

const mockTenants = [
  {
    id: "t1", name: "Lingua School", slug: "demo-lingua", plan: "growth",
    createdAt: "2025-09-01T00:00:00Z",
    stats: { users: 4, students: 50, lessons: 280 },
  },
  {
    id: "t2", name: "Piano Academy", slug: "piano-academy", plan: "starter",
    createdAt: "2025-11-01T00:00:00Z",
    stats: { users: 2, students: 12, lessons: 45 },
  },
];

const mockHealth = {
  dbOk: true,
  migrationCount: 35,
  tenantCount: 2,
  lastMigration: "0035_set803_branding",
};

function makeFetchResponse(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 403,
    json: () => Promise.resolve(data),
  } as Response);
}

import { AdminPage } from "@/pages/app/AdminPage";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("HEALTH-001 — AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-HEALTH-001-4 renders tenant table with correct columns", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u.includes("tenants")) return makeFetchResponse(mockTenants) as unknown as ReturnType<typeof fetch>;
      return makeFetchResponse(mockHealth) as unknown as ReturnType<typeof fetch>;
    });

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Lingua School")).toBeInTheDocument();
    });

    // Check column headers
    expect(screen.getByText("Tenant")).toBeInTheDocument();
    expect(screen.getByText("Elevi")).toBeInTheDocument();
    expect(screen.getByText("Utilizatori")).toBeInTheDocument();
    expect(screen.getByText("Lecții")).toBeInTheDocument();
  });

  it("T-HEALTH-001-4 renders tenant data correctly", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u.includes("tenants")) return makeFetchResponse(mockTenants) as unknown as ReturnType<typeof fetch>;
      if (u.includes("health")) return makeFetchResponse(mockHealth) as unknown as ReturnType<typeof fetch>;
      return makeFetchResponse({}) as unknown as ReturnType<typeof fetch>;
    });

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Lingua School")).toBeInTheDocument();
    }, { timeout: 3000 });

    // Both tenants visible
    expect(screen.getByText("Lingua School")).toBeInTheDocument();
    // Stats visible (50 students from Lingua School)
    expect(screen.getAllByText("50").length).toBeGreaterThanOrEqual(1);
  });

  it("T-HEALTH-001 shows DB health info", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u.includes("tenants")) return makeFetchResponse(mockTenants) as unknown as ReturnType<typeof fetch>;
      if (u.includes("health")) return makeFetchResponse(mockHealth) as unknown as ReturnType<typeof fetch>;
      return makeFetchResponse({}) as unknown as ReturnType<typeof fetch>;
    });

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeInTheDocument();
    }, { timeout: 3000 });

    // Migration count appears somewhere on the page (as "35")
    const page = document.body.textContent ?? "";
    expect(page).toContain("35");
    expect(page).toContain("0035_set803_branding");
  });

  it("T-HEALTH-001 shows error message on 403", async () => {
    vi.spyOn(global, "fetch").mockImplementation(() =>
      makeFetchResponse({}, false) as unknown as ReturnType<typeof fetch>
    );

    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText(/acces interzis/i)).toBeInTheDocument();
    });
  });

  it("T-HEALTH-001 renders page title", async () => {
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u.includes("tenants")) return makeFetchResponse(mockTenants) as unknown as ReturnType<typeof fetch>;
      return makeFetchResponse(mockHealth) as unknown as ReturnType<typeof fetch>;
    });

    render(<AdminPage />);

    await waitFor(() => {
      const shell = screen.getByTestId("app-shell");
      expect(shell.getAttribute("data-title")).toBe("Admin");
    });
  });
});
