/**
 * INVOICE-REPORTING — bulk invoice upload on the Invoice Reporting page
 *
 * The accountant can add up to 50 invoices right on the statement view, then
 * they auto-match against the transactions. Tests cover:
 *   1. Renders the dropzone with the file input.
 *   2. Rejects unacceptable files (wrong type / too big), keeps acceptable ones.
 *   3. Uploads queued files via uploadInvoiceBatch (batched) and fires onUploaded(n).
 *   4. Enforces the 50-file cap.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import {
  InvoiceBulkUpload,
  MAX_INVOICE_FILES,
} from "@/components/fin/InvoiceBulkUpload";
import {
  signCaptureUploads,
  putToSignedUrl,
  finalizeCaptures,
  type BatchItemResult,
} from "@/lib/api/finCaptures";
import { ApiError } from "@/lib/api";

vi.mock("@/lib/api/finCaptures", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/finCaptures")>();
  return {
    ...actual,
    signCaptureUploads: vi.fn(),
    putToSignedUrl: vi.fn(),
    finalizeCaptures: vi.fn(),
  };
});

const mockSign = vi.mocked(signCaptureUploads);
const mockPut = vi.mocked(putToSignedUrl);
const mockFinalize = vi.mocked(finalizeCaptures);

/** Default finalize mock: every uploaded object succeeds. Capture id = fileName (unique). */
function finalizeOk(items: Array<{ fileName: string }>): { results: BatchItemResult[]; count: number; okCount: number } {
  const results: BatchItemResult[] = items.map((it) => ({ ok: true, capture: { id: it.fileName, fileName: it.fileName } as never, lineCount: 0 }));
  return { results, count: results.length, okCount: results.length };
}
/** onUploaded mock: by default report that every uploaded invoice matched a transaction. */
const onUploadedAllMatched = () => vi.fn(async (ids: string[]) => ids);

function pdf(name: string, bytes = 1000): File {
  const f = new File(["x"], name, { type: "application/pdf" });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

function fileInput(): HTMLInputElement {
  // The dropzone's <input type="file"> is sr-only with multiple.
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error("file input not found");
  return input;
}

function selectFiles(files: File[]) {
  fireEvent.change(fileInput(), { target: { files } });
}

describe("InvoiceBulkUpload", () => {
  beforeEach(() => {
    mockSign.mockReset();
    mockPut.mockReset();
    mockFinalize.mockReset();
    // sign → one signed URL per file; PUT → ok; finalize → all ok.
    mockSign.mockImplementation(async (files) =>
      files.map((f, i) => ({ fileName: f.fileName, path: `t1/${i}-${f.fileName}`, signedUrl: `https://supa/${i}` })),
    );
    mockPut.mockResolvedValue(undefined);
    mockFinalize.mockImplementation(async (items) => finalizeOk(items));
  });

  it("renders the dropzone with a multiple file input", () => {
    render(<InvoiceBulkUpload onUploaded={vi.fn()} />);
    expect(screen.getByText(/Adaugă facturi de verificat/i)).toBeInTheDocument();
    expect(fileInput().multiple).toBe(true);
  });

  it("rejects an unacceptable file type and keeps an acceptable one", () => {
    render(<InvoiceBulkUpload onUploaded={vi.fn()} />);
    const bad = new File(["x"], "notes.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    selectFiles([pdf("factura-1.pdf"), bad]);

    const list = screen.getByLabelText("Facturi selectate");
    expect(within(list).getByText("factura-1.pdf")).toBeInTheDocument();
    expect(within(list).queryByText("notes.docx")).not.toBeInTheDocument();
    expect(screen.getByText(/ignorate/i)).toBeInTheDocument();
  });

  it("rejects a file larger than the cap but accepts one under it", () => {
    render(<InvoiceBulkUpload onUploaded={vi.fn()} />);
    selectFiles([pdf("ok.pdf", 3_000_000), pdf("huge.pdf", 13_000_000)]);
    const list = screen.getByLabelText("Facturi selectate");
    expect(within(list).getByText("ok.pdf")).toBeInTheDocument();
    expect(within(list).queryByText("huge.pdf")).not.toBeInTheDocument();
    expect(screen.getByText(/ignorate/i)).toBeInTheDocument();
  });

  it("signs once, PUTs each file to storage, finalizes, and reports uploaded ids", async () => {
    const onUploaded = onUploadedAllMatched();
    render(<InvoiceBulkUpload onUploaded={onUploaded} />);
    selectFiles([pdf("a.pdf"), pdf("b.pdf")]);

    fireEvent.click(screen.getByRole("button", { name: /Încarcă/i }));

    // onUploaded gets the uploaded capture ids (id = fileName in the mock).
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(["a.pdf", "b.pdf"]));
    expect(mockSign).toHaveBeenCalledTimes(1);
    expect(mockSign.mock.calls[0][0]).toHaveLength(2);
    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(mockFinalize).toHaveBeenCalledTimes(1);
  });

  it("finalizes in small batches past FINALIZE_BATCH", async () => {
    const onUploaded = onUploadedAllMatched();
    render(<InvoiceBulkUpload onUploaded={onUploaded} />);
    // 6 files, FINALIZE_BATCH=4 → 2 finalize requests (4 + 2). Sign is still one request.
    selectFiles(Array.from({ length: 6 }, (_, i) => pdf(`f${i}.pdf`)));

    fireEvent.click(screen.getByRole("button", { name: /Încarcă/i }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(onUploaded.mock.calls[0][0]).toHaveLength(6);
    expect(mockSign).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledTimes(6);
    expect(mockFinalize).toHaveBeenCalledTimes(2);
    expect(mockFinalize.mock.calls[0][0]).toHaveLength(4);
    expect(mockFinalize.mock.calls[1][0]).toHaveLength(2);
  });

  it("marks a matched invoice green ('Potrivit') and an unmatched one yellow ('Fără tranzacție')", async () => {
    // onUploaded reports only a.pdf matched a transaction.
    const onUploaded = vi.fn(async () => ["a.pdf"]);
    render(<InvoiceBulkUpload onUploaded={onUploaded} />);
    selectFiles([pdf("a.pdf"), pdf("b.pdf")]);

    fireEvent.click(screen.getByRole("button", { name: /Încarcă/i }));

    await waitFor(() => expect(screen.getByText("Potrivit")).toBeInTheDocument());
    expect(screen.getByText("Fără tranzacție")).toBeInTheDocument();
  });

  it("a storage PUT failure marks only that file, others succeed", async () => {
    mockPut.mockImplementation(async (url: string) => {
      if (url.endsWith("/1")) throw new ApiError(500, "storage_500");
    });
    const onUploaded = onUploadedAllMatched();
    render(<InvoiceBulkUpload onUploaded={onUploaded} />);
    selectFiles([pdf("ok.pdf"), pdf("fail.pdf")]);

    fireEvent.click(screen.getByRole("button", { name: /Încarcă/i }));

    // Only the file that PUT successfully reaches finalize → onUploaded gets 1 id.
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(onUploaded.mock.calls[0][0]).toHaveLength(1);
    expect(mockFinalize.mock.calls[0][0]).toHaveLength(1);
  });

  it("stops without retrying on a 403 rate-limit and shows the guidance banner", async () => {
    mockSign.mockRejectedValueOnce(new ApiError(403, "http_403"));
    const onUploaded = vi.fn();
    render(<InvoiceBulkUpload onUploaded={onUploaded} />);
    selectFiles(Array.from({ length: 6 }, (_, i) => pdf(`f${i}.pdf`)));

    fireEvent.click(screen.getByRole("button", { name: /Încarcă/i }));

    await waitFor(() => expect(screen.getByText(/limitată temporar/i)).toBeInTheDocument());
    // Sign 403'd → no PUTs, no finalize, no retry.
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockFinalize).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("caps the batch at MAX_INVOICE_FILES", () => {
    render(<InvoiceBulkUpload onUploaded={vi.fn()} />);
    const many = Array.from({ length: MAX_INVOICE_FILES + 5 }, (_, i) => pdf(`f${i}.pdf`));
    selectFiles(many);

    const list = screen.getByLabelText("Facturi selectate");
    expect(within(list).getAllByRole("listitem")).toHaveLength(MAX_INVOICE_FILES);
    expect(screen.getByText(new RegExp(`Maxim ${MAX_INVOICE_FILES}`, "i"))).toBeInTheDocument();
  });
});
