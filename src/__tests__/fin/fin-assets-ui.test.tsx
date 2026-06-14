/**
 * @vitest-environment jsdom
 *
 * ASSET-003: UI tests — AssetsPage + finAssets API client
 *
 * T-ASSET-003-1 [blocant]: AssetsPage renders without crash
 * T-ASSET-003-2 [blocant]: listAssets() with mocked fetch returns empty array
 * T-ASSET-003-3 [blocant]: createAsset() with mocked fetch returns asset with id
 * T-ASSET-003-4 [normal]: filter status appended as query param
 * T-ASSET-003-5 [normal]: scrapAsset calls correct endpoint
 * T-ASSET-003-6 [normal]: MDL formatting for 1_200_000 cents
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── Mock useSession ──────────────────────────────────────────────────────────
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: "u1", tenantId: "t1" } } }),
}));

// ─── Mock useRouter ───────────────────────────────────────────────────────────
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/fin/assets", navigate: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ─── Mock AppShell ────────────────────────────────────────────────────────────
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({
    children,
    pageTitle,
    actions,
  }: {
    children: React.ReactNode;
    pageTitle: string;
    actions?: React.ReactNode;
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      {actions}
      {children}
    </div>
  ),
}));

// ─── Fetch mock ───────────────────────────────────────────────────────────────
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock;
});

// ─── T-ASSET-003-1: AssetsPage renders without crash ─────────────────────────
describe("T-ASSET-003-1 [blocant]", () => {
  it("AssetsPage renders without crash and shows heading", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ assets: [] }),
    });

    const { AssetsPage } = await import("@/pages/app/AssetsPage");
    render(<AssetsPage />);

    await waitFor(() => {
      expect(screen.getByText("Active Fixe")).toBeInTheDocument();
    });
  });
});

// ─── T-ASSET-003-2: listAssets returns empty array ───────────────────────────
describe("T-ASSET-003-2 [blocant]", () => {
  it("listAssets() with mocked 200 { assets: [] } returns empty array", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ assets: [] }),
    });

    const { listAssets } = await import("@/lib/api/finAssets");
    const result = await listAssets();
    expect(result.assets).toEqual([]);
    expect(Array.isArray(result.assets)).toBe(true);
  });
});

// ─── T-ASSET-003-3: createAsset returns asset with id ────────────────────────
describe("T-ASSET-003-3 [blocant]", () => {
  it("createAsset() returns asset from server with correct id", async () => {
    const mockAsset = {
      id: "asset-uuid-001",
      tenantId: "tenant-001",
      name: "Laptop Dell",
      acquisitionCostCents: 1_200_000,
      residualValueCents: 0,
      usefulLifeMonths: 36,
      depreciationMethod: "linear",
      status: "active",
      acquisitionDate: "2024-01-15",
      createdAt: "2024-01-15T00:00:00Z",
      updatedAt: "2024-01-15T00:00:00Z",
      description: null,
      category: "IT",
      notes: null,
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ asset: mockAsset }),
    });

    const { createAsset } = await import("@/lib/api/finAssets");
    const result = await createAsset({
      name: "Laptop Dell",
      acquisitionDate: "2024-01-15",
      acquisitionCostCents: 1_200_000,
      usefulLifeMonths: 36,
    });

    expect(result.asset.id).toBe("asset-uuid-001");
    expect(result.asset.name).toBe("Laptop Dell");
    expect(result.asset.acquisitionCostCents).toBe(1_200_000);
  });
});

// ─── T-ASSET-003-4 [normal]: filter appended as query param ──────────────────
describe("T-ASSET-003-4 [normal]", () => {
  it("listAssets({ status: 'active' }) appends ?status=active to URL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ assets: [] }),
    });

    const { listAssets } = await import("@/lib/api/finAssets");
    await listAssets({ status: "active" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("?status=active"),
      expect.any(Object)
    );
  });
});

// ─── T-ASSET-003-5 [normal]: scrapAsset calls PATCH /:id ─────────────────────
describe("T-ASSET-003-5 [normal]", () => {
  it("scrapAsset(id) calls PATCH /api/fin/assets/:id with status=scrapped", async () => {
    const mockAsset = {
      id: "asset-uuid-001",
      status: "scrapped",
      name: "Old Projector",
      acquisitionCostCents: 500_000,
      residualValueCents: 0,
      usefulLifeMonths: 60,
      depreciationMethod: "linear",
      acquisitionDate: "2020-01-01",
      tenantId: "t1",
      createdAt: "2020-01-01T00:00:00Z",
      updatedAt: "2026-06-14T00:00:00Z",
      description: null,
      category: null,
      notes: null,
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ asset: mockAsset }),
    });

    const { scrapAsset } = await import("@/lib/api/finAssets");
    const result = await scrapAsset("asset-uuid-001");

    expect(result.asset.status).toBe("scrapped");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("asset-uuid-001"),
      expect.objectContaining({ method: "PATCH" })
    );
  });
});

// ─── T-ASSET-003-6 [normal]: MDL formatting ──────────────────────────────────
describe("T-ASSET-003-6 [normal]", () => {
  it("formats 1_200_000 cents as MDL correctly", () => {
    const cents = 1_200_000;
    const formatted = new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: "MDL",
      maximumFractionDigits: 0,
    }).format(cents / 100);

    // Should be 12.000 MDL (Romanian locale uses . as thousands separator)
    expect(formatted).toContain("12");
    expect(formatted).toContain("MDL");
    expect(formatted).toContain("000");
  });
});
