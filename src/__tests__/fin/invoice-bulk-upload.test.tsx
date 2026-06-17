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
import { uploadInvoiceBatch, type BatchItemResult } from "@/lib/api/finCaptures";
import { ApiError } from "@/lib/api";

vi.mock("@/lib/api/finCaptures", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/finCaptures")>();
  return { ...actual, uploadInvoiceBatch: vi.fn() };
});

const mockUpload = vi.mocked(uploadInvoiceBatch);

/** Default mock: every file in the batch succeeds. */
function allOk(files: File[]): { results: BatchItemResult[]; count: number; okCount: number } {
  const results: BatchItemResult[] = files.map((f, i) => ({ ok: true, capture: { id: `c${i}`, fileName: f.name } as never, lineCount: 0 }));
  return { results, count: results.length, okCount: results.length };
}

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
    mockUpload.mockReset();
    mockUpload.mockImplementation(async (files: File[]) => allOk(files));
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

  it("rejects a file larger than 4MB (Vercel body limit) but accepts one under it", () => {
    render(<InvoiceBulkUpload onUploaded={vi.fn()} />);
    selectFiles([pdf("ok.pdf", 3_000_000), pdf("huge.pdf", 5_000_000)]);
    const list = screen.getByLabelText("Facturi selectate");
    expect(within(list).getByText("ok.pdf")).toBeInTheDocument();
    expect(within(list).queryByText("huge.pdf")).not.toBeInTheDocument();
    expect(screen.getByText(/ignorate/i)).toBeInTheDocument();
  });

  it("uploads queued files in one batch and calls onUploaded with the success count", async () => {
    const onUploaded = vi.fn();
    render(<InvoiceBulkUpload onUploaded={onUploaded} />);
    selectFiles([pdf("a.pdf"), pdf("b.pdf")]);

    fireEvent.click(screen.getByRole("button", { name: /Încarcă/i }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(2));
    // 2 files fit in one batch → a single request with both files + team tag.
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith([expect.any(File), expect.any(File)], "other");
  });

  it("splits into multiple batches past the per-batch file cap", async () => {
    const onUploaded = vi.fn();
    render(<InvoiceBulkUpload onUploaded={onUploaded} />);
    // 6 files, MAX_BATCH_FILES=4 → 2 batches (4 + 2).
    selectFiles(Array.from({ length: 6 }, (_, i) => pdf(`f${i}.pdf`)));

    fireEvent.click(screen.getByRole("button", { name: /Încarcă/i }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(6));
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockUpload.mock.calls[0][0]).toHaveLength(4);
    expect(mockUpload.mock.calls[1][0]).toHaveLength(2);
  });

  it("reports the success count even when one file in the batch fails", async () => {
    mockUpload.mockImplementation(async (files: File[]) => ({
      results: [
        { ok: true, capture: { id: "c1", fileName: files[0].name } as never, lineCount: 0 },
        { ok: false, fileName: files[1].name, error: "upload_failed" },
      ],
      count: 2,
      okCount: 1,
    }));
    const onUploaded = vi.fn();
    render(<InvoiceBulkUpload onUploaded={onUploaded} />);
    selectFiles([pdf("ok.pdf"), pdf("fail.pdf")]);

    fireEvent.click(screen.getByRole("button", { name: /Încarcă/i }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(1));
  });

  it("stops without retrying on a 403 rate-limit and shows the guidance banner", async () => {
    // 6 files → 2 batches (4 + 2). First batch 403s → must STOP (not retry, not send batch 2).
    mockUpload.mockRejectedValueOnce(new ApiError(403, "http_403"));
    const onUploaded = vi.fn();
    render(<InvoiceBulkUpload onUploaded={onUploaded} />);
    selectFiles(Array.from({ length: 6 }, (_, i) => pdf(`f${i}.pdf`)));

    fireEvent.click(screen.getByRole("button", { name: /Încarcă/i }));

    await waitFor(() => expect(screen.getByText(/limitată temporar/i)).toBeInTheDocument());
    // Only the first batch was attempted — no retry, no second batch.
    expect(mockUpload).toHaveBeenCalledTimes(1);
    // Nothing succeeded → onUploaded not called; files remain for a later retry.
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
