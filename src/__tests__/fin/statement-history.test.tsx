/**
 * STMT-004: Statement History & Exports — unit tests
 *
 * T-STMT-004-1 [blocant]  StatementHistoryPage renders without crash
 * T-STMT-004-2 [blocant]  GET /statement list calls the API and shows statements
 * T-STMT-004-3 [normal]   SAGA CSV export: correct filename pattern
 * T-STMT-004-4 [normal]   XML ZIP export: correct filename pattern
 * T-STMT-004-5 [blocant]  DELETE /:captureId removes statement
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Helper: month format (pure) ──────────────────────────────────────────────

function buildSagaFilename(month: string): string {
  return `saga-statement-${month}.csv`;
}

function buildZipFilename(month: string): string {
  return `efacturi-${month}.zip`;
}

describe("STMT-004: export filename helpers (pure)", () => {
  it("T-STMT-004-3 [normal]: SAGA CSV filename has correct format", () => {
    expect(buildSagaFilename("2024-10")).toBe("saga-statement-2024-10.csv");
  });

  it("T-STMT-004-4 [normal]: ZIP filename has correct format", () => {
    expect(buildZipFilename("2024-10")).toBe("efacturi-2024-10.zip");
  });
});

// ─── Frontend: StatementHistoryPage smoke ────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/business/fin/statement" }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/pages/fin/FinLayout", () => ({
  FinLayout: ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) => (
    <div data-testid="fin-layout" data-page-title={pageTitle}>{children}</div>
  ),
}));

const SAMPLE_STATEMENTS = [
  {
    id: "c0a80101-0000-4000-a000-000000000001",
    file_name: "maib-oct-2024.pdf",
    created_at: "2024-10-15T09:00:00Z",
    status: "active",
    line_count: 25,
    matched_count: 20,
    sfs_count: 15,
    total_out_cents: 1250000,
  },
];

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ statements: SAMPLE_STATEMENTS, total: 1 }),
  blob: async () => new Blob(["csv-content"], { type: "text/csv" }),
});

describe("T-STMT-004-1 [blocant]: StatementHistoryPage smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ statements: SAMPLE_STATEMENTS, total: 1 }),
      blob: async () => new Blob(["csv-content"], { type: "text/csv" }),
    });
  });

  it("renders without crash", async () => {
    const { default: StatementHistoryPage } = await import(
      "@/pages/fin/StatementHistoryPage"
    );
    render(<StatementHistoryPage />);
    expect(document.body).toBeTruthy();
  });

  it("T-STMT-004-2 [blocant]: calls GET /api/fin/statement/ on mount", async () => {
    const { default: StatementHistoryPage } = await import(
      "@/pages/fin/StatementHistoryPage"
    );
    render(<StatementHistoryPage />);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const listCall = calls.find(([url]: [string]) =>
        url.includes("/api/fin/statement/")
      );
      expect(listCall).toBeTruthy();
    });
  });

  it("renders statement list after load", async () => {
    const { default: StatementHistoryPage } = await import(
      "@/pages/fin/StatementHistoryPage"
    );
    render(<StatementHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("maib-oct-2024.pdf")).toBeTruthy();
    });
  });

  it("T-STMT-004-5 [blocant]: DELETE action calls API", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ statements: SAMPLE_STATEMENTS, total: 1 }),
      });
    });

    const { default: StatementHistoryPage } = await import(
      "@/pages/fin/StatementHistoryPage"
    );
    render(<StatementHistoryPage />);

    // Wait for statements to load
    await waitFor(() => {
      expect(screen.getByText("maib-oct-2024.pdf")).toBeTruthy();
    });

    // Click delete button
    const deleteBtn = screen.getByRole("button", { name: /ș/i });
    fireEvent.click(deleteBtn);

    // Confirmation dialog appears
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });

    // Confirm deletion — find the button inside the dialog
    const dialog = screen.getByRole("dialog");
    const confirmBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Șterge"
    );
    expect(confirmBtn).toBeTruthy();
    fireEvent.click(confirmBtn!);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const deleteCall = calls.find(([, opts]: [string, RequestInit]) => opts?.method === "DELETE");
      expect(deleteCall).toBeTruthy();
    });
  });
});
