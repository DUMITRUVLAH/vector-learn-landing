/**
 * INVOICE-REPORTING — bulk invoice upload on the Invoice Reporting page
 *
 * The accountant can add up to 50 invoices right on the statement view, then
 * they auto-match against the transactions. Tests cover:
 *   1. Renders the dropzone with the file input.
 *   2. Rejects unacceptable files (wrong type / too big), keeps acceptable ones.
 *   3. Uploads each queued file via uploadInvoiceFile and fires onUploaded(n).
 *   4. Enforces the 50-file cap.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import {
  InvoiceBulkUpload,
  MAX_INVOICE_FILES,
} from "@/components/fin/InvoiceBulkUpload";
import { uploadInvoiceFile } from "@/lib/api/finCaptures";

vi.mock("@/lib/api/finCaptures", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/finCaptures")>();
  return { ...actual, uploadInvoiceFile: vi.fn() };
});

const mockUpload = vi.mocked(uploadInvoiceFile);

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
    mockUpload.mockResolvedValue({ capture: { id: "c1" } as never });
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

  it("rejects a file larger than 8MB", () => {
    render(<InvoiceBulkUpload onUploaded={vi.fn()} />);
    selectFiles([pdf("huge.pdf", 9_000_000)]);
    expect(screen.queryByLabelText("Facturi selectate")).not.toBeInTheDocument();
    expect(screen.getByText(/ignorate/i)).toBeInTheDocument();
  });

  it("uploads queued files and calls onUploaded with the success count", async () => {
    const onUploaded = vi.fn();
    render(<InvoiceBulkUpload onUploaded={onUploaded} />);
    selectFiles([pdf("a.pdf"), pdf("b.pdf")]);

    fireEvent.click(screen.getByRole("button", { name: /Încarcă/i }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(2));
    expect(mockUpload).toHaveBeenCalledTimes(2);
    // Default team tag is "other".
    expect(mockUpload).toHaveBeenCalledWith(expect.any(File), "other");
  });

  it("reports the success count even when some uploads fail", async () => {
    mockUpload
      .mockResolvedValueOnce({ capture: { id: "c1" } as never })
      .mockRejectedValueOnce(new Error("boom"));
    const onUploaded = vi.fn();
    render(<InvoiceBulkUpload onUploaded={onUploaded} />);
    selectFiles([pdf("ok.pdf"), pdf("fail.pdf")]);

    fireEvent.click(screen.getByRole("button", { name: /Încarcă/i }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(1));
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
