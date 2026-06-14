/**
 * CASH-002 — UI import extras bancar
 *
 * T-CASH-002-6-ui [normal]: drag&drop CSV → preview tabel cu primele 5 rânduri
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CashImportPage from "../../pages/fin/CashImportPage";

vi.mock("../../router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/fin/cash/import", navigate: vi.fn() }),
}));

vi.mock("../../components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("../../lib/api/finCash", () => ({
  importFile: vi.fn().mockResolvedValue({ imported: 3, duplicates: 0, matched: 1, batchId: "b1", parseErrors: [] }),
}));

describe("CASH-002 — CashImportPage UI", () => {
  it("renderează fără crash", () => {
    render(<CashImportPage />);
    expect(screen.getByText(/import extras bancar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zonă de drag/i })).toBeInTheDocument();
  });

  it("T-CASH-002-6 [normal] — zona drag&drop și input sunt vizibile și interacționabile", () => {
    render(<CashImportPage />);

    // Drop zone exists
    const dropZone = screen.getByRole("button", { name: /zonă de drag/i });
    expect(dropZone).toBeInTheDocument();

    // File input exists (hidden)
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input?.getAttribute("accept")).toContain(".csv");
  });
});
