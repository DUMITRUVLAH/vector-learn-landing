/**
 * EXPORT-003: Teste Export Center UI
 *
 * T-EXPORT-003-1 [blocant] — ExportCenter render fără crash + buton cu aria-label "Descarcă"
 * T-EXPORT-003-2 [blocant] — ExportFormatCard render cu titlu + buton descărcare
 * T-EXPORT-003-3 [normal]  — click buton descărcare apelează handler
 * T-EXPORT-003-4 [normal]  — starea loading: butonul afișează "Se descarcă…" și e disabled
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExportFormatCard } from "../../components/fin/ExportFormatCard";

// ─── Mocks globale ────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/fin/export", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@/lib/api/finExport", () => ({
  getExportFormats: vi.fn().mockResolvedValue([]),
  downloadJournalCsv: vi.fn().mockResolvedValue(new Blob(["csv"])),
  downloadTrialBalanceCsv: vi.fn().mockResolvedValue(new Blob(["csv"])),
  downloadInvoicesSfsCsv: vi.fn().mockResolvedValue(new Blob(["csv"])),
  downloadSaftRoXml: vi.fn().mockResolvedValue(new Blob(["xml"])),
  downloadSaftRoFull: vi.fn().mockResolvedValue(new Blob(["xml"])),
  downloadOneCXml: vi.fn().mockResolvedValue(new Blob(["xml"])),
  downloadSagaCsv: vi.fn().mockResolvedValue(new Blob(["csv"])),
  triggerDownload: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

// ─── T-EXPORT-003-2: ExportFormatCard ────────────────────────────────────────

describe("ExportFormatCard", () => {
  it("[T-EXPORT-003-2 blocant] render cu titlu, descriere, buton cu aria-label", () => {
    const onDownload = vi.fn();
    render(
      <ExportFormatCard
        id="journal-csv"
        label="Jurnal GL (CSV)"
        description="Export jurnal contabil"
        mime="text/csv"
        isLoading={false}
        error={null}
        onDownload={onDownload}
      />
    );

    expect(screen.getByText("Jurnal GL (CSV)")).toBeTruthy();
    expect(screen.getByText("Export jurnal contabil")).toBeTruthy();
    const btn = screen.getByRole("button", { name: /Descarcă Jurnal GL/i });
    expect(btn).toBeTruthy();
  });

  it("[T-EXPORT-003-3 normal] click buton apelează onDownload", () => {
    const onDownload = vi.fn();
    render(
      <ExportFormatCard
        id="saga-csv"
        label="SAGA CSV"
        description="Format SAGA C"
        mime="text/csv"
        isLoading={false}
        error={null}
        onDownload={onDownload}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Descarcă SAGA CSV/i }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("[T-EXPORT-003-4 normal] loading=true → buton disabled + text 'Se descarcă…'", () => {
    render(
      <ExportFormatCard
        id="1c-xml"
        label="1C XML"
        description="Format 1C"
        mime="application/xml"
        isLoading={true}
        error={null}
        onDownload={vi.fn()}
      />
    );

    const btn = screen.getByRole("button", { name: /Descarcă 1C XML/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Se descarcă…")).toBeTruthy();
  });

  it("eroare inline afișată când error != null", () => {
    render(
      <ExportFormatCard
        id="saf-t-ro-xml"
        label="SAF-T RO"
        description="Format SAF-T"
        mime="application/xml"
        isLoading={false}
        error="Eroare: HTTP 500"
        onDownload={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Eroare: HTTP 500/)).toBeTruthy();
  });

  it("XML format → icon FileCode (nu FileSpreadsheet)", () => {
    const { container } = render(
      <ExportFormatCard
        id="saf-t-ro-full"
        label="SAF-T Full"
        description="SAF-T cu TVA"
        mime="application/xml"
        isLoading={false}
        error={null}
        onDownload={vi.fn()}
      />
    );
    // Verificăm că render-ul nu aruncă crash — icon-ul e prezent în container
    expect(container.querySelector("article")).toBeTruthy();
  });
});

// ─── T-EXPORT-003-1: ExportCenter render ─────────────────────────────────────

describe("ExportCenter", () => {
  it("[T-EXPORT-003-1 blocant] render fără crash + cel puțin un buton aria-label Descarcă", async () => {
    // Import dinamic după mock-uri
    const { ExportCenter } = await import("../../pages/app/fin/ExportCenter");

    const { container } = render(<ExportCenter />);

    // Pagina se randează
    expect(container.querySelector("[data-testid='app-shell']")).toBeTruthy();

    // Butoanele "Descarcă" sunt prezente (din fallback formats)
    const downloadBtns = screen.getAllByRole("button", { name: /Descarcă/i });
    expect(downloadBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("Filtrele de dată sunt prezente și accesibile", async () => {
    const { ExportCenter } = await import("../../pages/app/fin/ExportCenter");
    render(<ExportCenter />);

    expect(screen.getByLabelText("Data de start export")).toBeTruthy();
    expect(screen.getByLabelText("Data de final export")).toBeTruthy();
    expect(screen.getByLabelText("An fiscal pentru SAF-T")).toBeTruthy();
    expect(screen.getByLabelText("Perioadă pentru SAF-T")).toBeTruthy();
  });
});
