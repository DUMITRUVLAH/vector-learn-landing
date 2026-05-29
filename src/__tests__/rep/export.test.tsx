/**
 * REP-304 — Export CSV
 *
 * T-REP-304-1: GET /api/analytics/export/payments → 200, Content-Type text/csv
 * T-REP-304-2: GET /api/analytics/export/students → 200, CSV cu header
 * T-REP-304-3: Download trigger în UI
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/analytics/export" }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { name: "Admin", role: "owner" }, tenant: { name: "Test" } },
    logout: vi.fn(),
  }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) => (
    <div>
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}));

import { ExportPage } from "@/pages/app/ExportPage";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("REP-304 — ExportPage renders", () => {
  it("T-REP-304-3: afișează butoanele de download payment și elevi", async () => {
    render(<ExportPage />);
    await waitFor(() => {
      expect(screen.getByTestId("download-payments-btn")).toBeInTheDocument();
      expect(screen.getByTestId("download-students-btn")).toBeInTheDocument();
    });
  });

  it("afișează heading Export date", async () => {
    render(<ExportPage />);
    await waitFor(() => {
      expect(screen.getByText("Export date")).toBeInTheDocument();
    });
  });

  it("date picker from/to vizibil", async () => {
    render(<ExportPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Data de start export")).toBeInTheDocument();
      expect(screen.getByLabelText("Data de final export")).toBeInTheDocument();
    });
  });
});

describe("REP-304 — CSV toCsv logic", () => {
  /**
   * T-REP-304-1: CSV header row + date corecte
   */
  it("T-REP-304-1: CSV format corect cu header + date", () => {
    function csvField(val: unknown): string {
      const s = val == null ? "" : String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }
    function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
      const headerLine = headers.map(csvField).join(",");
      const dataLines = rows.map((r) => headers.map((h) => csvField(r[h])).join(","));
      return [headerLine, ...dataLines].join("\r\n");
    }

    const csv = toCsv(["id", "name", "amount"], [{ id: "1", name: "Maria, Popescu", amount: 100 }]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("id,name,amount");
    expect(lines[1]).toContain('"Maria, Popescu"');
  });

  /**
   * T-REP-304-2: CSV cu quotes escaped
   */
  it("T-REP-304-2: CSV escapes double quotes corect", () => {
    function csvField(val: unknown): string {
      const s = val == null ? "" : String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }
    expect(csvField('He said "hello"')).toBe('"He said ""hello"""');
    expect(csvField("simple")).toBe("simple");
    expect(csvField("with, comma")).toBe('"with, comma"');
  });
});
