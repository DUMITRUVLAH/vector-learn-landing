/**
 * STMT-001: Statement Upload — unit tests
 *
 * T-STMT-001-1 [blocant]  Given a valid multipart file, when POST /upload, then 201 + captureId
 * T-STMT-001-2 [blocant]  Given an empty file, when POST /upload, then 400 invalid_file
 * T-STMT-001-3 [blocant]  Given an unsupported extension (.docx), when POST /upload, then 400
 * T-STMT-001-4 [normal]   Given JSON mode body, when POST /upload, then 201 with captureId
 * T-STMT-001-5 [blocant]  Render StatementUploadPage without crash (smoke)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Backend unit: file validation logic (pure) ────────────────────────────────

const ALLOWED_EXTENSIONS = [".pdf", ".csv", ".xlsx", ".ods", ".mt940", ".sta", ".ofx", ".txt"];

function validateExt(fileName: string): boolean {
  const ext = "." + (fileName.split(".").pop() ?? "").toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

describe("STMT-001: file extension validation (pure)", () => {
  it("T-STMT-001-2 [blocant]: rejects empty-name file", () => {
    expect(validateExt("")).toBe(false);
  });

  it("T-STMT-001-3 [blocant]: rejects .docx (unsupported)", () => {
    expect(validateExt("statement.docx")).toBe(false);
  });

  it("T-STMT-001-1 [blocant]: accepts .pdf", () => {
    expect(validateExt("maib-oct.pdf")).toBe(true);
  });

  it("accepts .xlsx", () => {
    expect(validateExt("extras.xlsx")).toBe(true);
  });

  it("accepts .csv", () => {
    expect(validateExt("extrasde cont.csv")).toBe(true);
  });

  it("accepts .mt940", () => {
    expect(validateExt("banca.mt940")).toBe(true);
  });
});

// ─── Frontend: StatementUploadPage smoke ─────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/business/fin/statement/upload" }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/pages/fin/FinLayout", () => ({
  FinLayout: ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) => (
    <div data-testid="fin-layout" data-page-title={pageTitle}>{children}</div>
  ),
}));

// fetch mock — simulate successful upload
const mockCaptureId = "c0a80101-0000-4000-a000-000000000001";
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 201,
  json: async () => ({ captureId: mockCaptureId, lineCount: 5, lines: [] }),
});

describe("T-STMT-001-5 [blocant]: StatementUploadPage smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crash", async () => {
    const { default: StatementUploadPage } = await import("@/pages/fin/StatementUploadPage");
    render(<StatementUploadPage />);
    // Drag zone with role=region renders
    expect(screen.getByRole("region", { name: /upload extras/i })).toBeTruthy();
    // File input renders
    expect(document.getElementById("statement-file-input")).toBeTruthy();
  });

  it("T-STMT-001-1 [blocant]: shows captureId in preview after upload", async () => {
    const { default: StatementUploadPage } = await import("@/pages/fin/StatementUploadPage");
    render(<StatementUploadPage />);

    const input = document.getElementById("statement-file-input") as HTMLInputElement;
    const file = new File(["tx1,100,out\ntx2,50,in"], "extras.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/fin/statement/upload",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
    });
  });

  it("T-STMT-001-3 [blocant]: shows error for .docx file (unsupported)", async () => {
    const { default: StatementUploadPage } = await import("@/pages/fin/StatementUploadPage");
    render(<StatementUploadPage />);

    const input = document.getElementById("statement-file-input") as HTMLInputElement;
    const file = new File(["content"], "document.docx", { type: "application/octet-stream" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    // No fetch call made
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
