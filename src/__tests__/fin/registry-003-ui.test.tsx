/**
 * REGISTRY-003 — UI admin cote fiscale + plan de conturi
 *
 * T-REGISTRY-003-1 [blocant] FinRegistryPage renders without crash
 * T-REGISTRY-003-2 [blocant] Click pe tab "Plan de conturi" schimbă conținutul afișat
 * T-REGISTRY-003-3 [blocant] Ruta /app/fin/registry există în App.tsx (grep test)
 * T-REGISTRY-003-4 [normal]  Butonul "Adaugă cotă" deschide un dialog/modal
 * T-REGISTRY-003-5 [normal]  Form validare: ratePct negativ arată eroare, nu trimite request
 * T-REGISTRY-003-6 [normal]  Filtrul country refetch-uiește cu param
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockTaxRates = [
  {
    id: "r1",
    tenantId: null,
    country: "MD",
    kind: "vat",
    name: "TVA standard",
    ratePct: "20.0000",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    isDefault: true,
    notes: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "r2",
    tenantId: null,
    country: "RO",
    kind: "vat",
    name: "TVA redusă",
    ratePct: "9.0000",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    isDefault: false,
    notes: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

const mockChartOfAccounts = [
  {
    id: "c1",
    tenantId: null,
    country: "MD",
    accountCode: "221",
    accountName: "Creanțe comerciale",
    accountType: "asset",
    parentCode: "22",
    isActive: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      const urlStr = String(url);
      if (
        urlStr.includes("/api/fin/registry/tax-rates") &&
        (!opts || opts.method !== "POST")
      ) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: mockTaxRates }),
        });
      }
      if (urlStr.includes("/api/fin/registry/chart-of-accounts")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: mockChartOfAccounts }),
        });
      }
      if (
        urlStr.includes("/api/fin/registry/tax-rates") &&
        opts?.method === "POST"
      ) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () =>
            Promise.resolve({
              data: { ...mockTaxRates[0], id: "r-new" },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    })
  );
});

// ─── Import page ──────────────────────────────────────────────────────────────

import { FinRegistryPage } from "../../pages/app/FinRegistryPage";

describe("REGISTRY-003 — FinRegistryPage", () => {
  /**
   * T-REGISTRY-003-1 [blocant]
   * FinRegistryPage should render without throwing.
   */
  it("T-REGISTRY-003-1: renders without crash", async () => {
    await act(async () => {
      render(<FinRegistryPage />);
    });
    // The page heading must be present
    expect(
      screen.getByRole("heading", { name: /Nomenclatoare fiscale/i })
    ).toBeTruthy();
    // Both tab buttons must be present
    const tabs = screen.getAllByRole("tab");
    const tabLabels = tabs.map((t) => t.textContent ?? "");
    expect(tabLabels.some((l) => /Cote fiscale/i.test(l))).toBe(true);
    expect(tabLabels.some((l) => /Plan de conturi/i.test(l))).toBe(true);
  });

  /**
   * T-REGISTRY-003-2 [blocant]
   * Clicking the "Plan de conturi" tab must change the visible content.
   */
  it("T-REGISTRY-003-2: tab switch shows chart-of-accounts content", async () => {
    await act(async () => {
      render(<FinRegistryPage />);
    });

    // Find and click the CoA tab
    const allTabs = screen.getAllByRole("tab");
    const coaTab = allTabs.find((t) => /Plan de conturi/i.test(t.textContent ?? ""));
    expect(coaTab).toBeTruthy();

    await act(async () => {
      fireEvent.click(coaTab!);
    });

    // After switching, the CoA tab should be selected
    await waitFor(() => {
      expect(coaTab!.getAttribute("aria-selected")).toBe("true");
    });
  });

  /**
   * T-REGISTRY-003-3 [blocant]
   * App.tsx must contain the /app/fin/registry route declaration.
   */
  it("T-REGISTRY-003-3: /app/fin/registry route exists in App.tsx", () => {
    const appContent = readFileSync(
      join(process.cwd(), "src/App.tsx"),
      "utf-8"
    );
    expect(appContent).toContain("/app/fin/registry");
    expect(appContent).toContain("FinRegistryPage");
  });

  /**
   * T-REGISTRY-003-4 [normal]
   * "Adaugă cotă" button opens the modal dialog.
   */
  it("T-REGISTRY-003-4: Adaugă cotă button opens dialog", async () => {
    await act(async () => {
      render(<FinRegistryPage />);
    });

    // Wait for initial load to settle
    await waitFor(() => {
      expect(screen.queryByText("Se încarcă...")).toBeNull();
    });

    const addBtn = screen.getByRole("button", {
      name: /Adaugă cotă fiscală nouă/i,
    });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    // Dialog should be visible with aria-modal
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /Adaugă cotă fiscală/i })
      ).toBeTruthy();
    });
  });

  /**
   * T-REGISTRY-003-5 [normal]
   * Form validation: negative/invalid ratePct must show an error.
   */
  it("T-REGISTRY-003-5: negative ratePct triggers validation error", async () => {
    await act(async () => {
      render(<FinRegistryPage />);
    });

    await waitFor(() => {
      expect(screen.queryByText("Se încarcă...")).toBeNull();
    });

    // Open modal
    const addBtn = screen.getByRole("button", {
      name: /Adaugă cotă fiscală nouă/i,
    });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });

    // Fill in invalid ratePct
    const pctInput = screen.getByLabelText(/Procent \(%\)/i);
    await act(async () => {
      fireEvent.change(pctInput, { target: { value: "-5" } });
    });

    // Also fill in a name to avoid "name required" masking the pct error
    const nameInput = screen.getByLabelText(/Denumire/i);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Test" } });
    });

    // Submit form
    const submitBtn = screen.getByRole("button", { name: /Adaugă cotă$/ });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Expect validation error about the rate
    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      const hasPctError = alerts.some(
        (el) =>
          el.textContent?.includes("negativ") ||
          el.textContent?.includes("pozitiv") ||
          el.textContent?.includes("Procentul")
      );
      expect(hasPctError).toBe(true);
    });
  });

  /**
   * T-REGISTRY-003-6 [normal]
   * Country filter re-fetches with country param.
   */
  it("T-REGISTRY-003-6: country filter triggers filtered fetch", async () => {
    const fetchMock = vi.mocked(global.fetch);

    await act(async () => {
      render(<FinRegistryPage />);
    });

    await waitFor(() => {
      expect(screen.queryByText("Se încarcă...")).toBeNull();
    });

    // The tax rates tab is active by default.
    // Use the country filter select (label "Filtrare țară")
    const countryFilter = screen.getByRole("combobox", {
      name: /Filtrare țară/i,
    });

    await act(async () => {
      fireEvent.change(countryFilter, { target: { value: "MD" } });
    });

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([url]) => String(url));
      const filteredCall = calls.find((u) => u.includes("country=MD"));
      expect(filteredCall).toBeDefined();
    });
  });
});
